import json
import uuid
from datetime import datetime, timezone
from typing import List

import crud
import schemas
from db import get_db
from dotenv import load_dotenv
from fastapi import (
    BackgroundTasks,
    Body,
    Depends,
    FastAPI,
    HTTPException,
    Request,
    status,
)
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi_mail import FastMail, MessageSchema, MessageType
from models import User
from redis_config import get_redis
from security import create_access_token
from sqlalchemy.ext.asyncio import AsyncSession
from utils import *

load_dotenv()

app = FastAPI(redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:80"],
    allow_credentials=True,
    allow_headers=["*"],
    allow_methods=["*"]
)

# ========== USER ENDPOINTS ==========

@app.post("/register", response_model=schemas.UserRead)
async def register(background_tasks: BackgroundTasks, user: schemas.UserCreate, db: AsyncSession = Depends(get_db), redis = Depends(get_redis)):
    if await crud.get_user_by_email(db, user.email):
        raise HTTPException(status_code=400, detail="Email already exists")
    if await crud.get_user_by_username(db, user.username):
        raise HTTPException(status_code=400, detail="Username already taken")
    
    new_user = await crud.create_user(db, user)

    code = generate_code()
    await redis.set(f"verification:{new_user.id}", code, ex=600)

    message = MessageSchema(
        subject="Код верифікації",
        recipients=[new_user.email],
        body=f"Ваш код для підтвердження пошти: {code}",
        subtype=MessageType.plain
    )
    fm = FastMail(conf)
    background_tasks.add_task(fm.send_message, message)

    return new_user


@app.post("/verify-email")
async def verify_email(data: schemas.VerifyEmail, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db), redis = Depends(get_redis)):
    if current_user.is_verified:
        return {"message": "Email already verified"}

    cached_code = await redis.get(f"verification:{current_user.id}")

    if cached_code is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code expired or not found")
    
    if cached_code != data.code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Code")
    
    await crud.verify_user(db, current_user.id)

    await redis.delete(f"verification:{current_user.id}")

    return {"message": "Email successfully verified"}

@app.post("/resend-code")
async def resend_code(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), redis = Depends(get_redis)):
    code = await redis.get(f"verification:{current_user.id}")

    if code is None:
        code = generate_code()
        await redis.set(f"verification:{current_user.id}", code, ex=600)

    message = MessageSchema(
    subject="Код верифікації",
    recipients=[current_user.email],
    body=f"Ваш код для підтвердження пошти: {code}",
    subtype=MessageType.plain
    )
    fm = FastMail(conf)
    background_tasks.add_task(fm.send_message, message)

    return {"message": "Code successfully sent"}



@app.post("/login", response_model=schemas.Token)
async def login(user: schemas.UserLogin, db: AsyncSession = Depends(get_db)):
    db_user = await crud.authenticate_user(db, user.email, user.password)
    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = create_access_token({"sub": str(db_user.id)})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=schemas.UserRead)
async def profile(current_user: User = Depends(get_current_user)):
    return current_user

@app.delete("/users/me")
async def delete_user(
    request: Request, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user), 
    redis = Depends(get_redis)
):
    token = request.state.token
    exp = request.state.exp
    ttl = exp - int(datetime.now(timezone.utc).timestamp())
    
    if ttl > 0:
        await redis.set(f"blacklist:{token}", "1", ex=ttl)
    
    await redis.delete(problems_list_key(current_user.id, False))
    await redis.delete(problems_list_key(0, True))
    
    return await crud.delete_user(db, current_user.id)

@app.patch("/users/me", response_model=schemas.UserRead)
async def update_profile(update_data: schemas.UserUpdate, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), redis = Depends(get_redis)):
    updated_user, email_changed = await crud.update_user(db, update_data, current_user.id)

    if not updated_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if email_changed:
        code = generate_code()

        await redis.set(f"verification:{updated_user.id}", code, ex=600)

        message = MessageSchema(
            subject="Підтвердження нової пошти",
            recipients=[updated_user.email],
            body=f"Ви змінили пошту. Ваш новий код підтвердження: {code}",
            subtype=MessageType.plain
        )    

        fm = FastMail(conf)
        background_tasks.add_task(fm.send_message, message)

        return updated_user

@app.post("/users/makeadmin")
async def make_admin(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_verified_user)):
    return await crud.make_admin(db, current_user.id)


@app.post("/users/telegram/generate-link")
async def generate_tg_link(current_user: User = Depends(get_verified_user), redis = Depends(get_redis)):
    token = str(uuid.uuid4())[:8]

    await redis.set(f"tg_link:{token}", current_user.id, ex=600)

    return {"link": f"https://t.me/deskservice3_bot?start={token}"}


@app.post("/users/telegram/confirm")
async def confirm_tg_link(data: schemas.TgLinkData, db: AsyncSession = Depends(get_db), redis = Depends(get_redis)):
        existing_tg_user = await crud.get_user_by_telegram_id(db, data.telegram_id)
        if existing_tg_user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Цей Telegram вже прив'язаний!!")

        user_id_bytes = await redis.get(f"tg_link:{data.token}")
        if not user_id_bytes:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Посилання застаріло або не існує")
        
        user_id = int(user_id_bytes)

        user = await crud.get_user_by_id(db, user_id)
        user.telegram_id = data.telegram_id
        await db.commit()

        await redis.delete(f"tg_link:{data.token}")

        return {"status": "success", "username": user.username}

@app.get("/users/telegram/check/{telegram_id}")
async def check_tg_link(telegram_id: int, db: AsyncSession = Depends(get_db)):
    user = await crud.get_user_by_telegram_id(db, telegram_id)
    if user:
        return {"linked": True, 'username': user.username}
    return {"linked": False}

@app.patch("/users/telegram/unlink")
async def unlink_tg(background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_verified_user)):
    old_tg_id = current_user.telegram_id

    updated_user = await crud.unlink_user_tg(db, current_user.id)
    if old_tg_id:
        background_tasks.add_task(send_tg_message, old_tg_id, "✅ Аккаунт успішно відв'язано!")

    return updated_user

# =========== PROBLEM ENDPOINTS =============

@app.post("/problems", response_model=schemas.ProblemRead)
async def create_problem(
    problem: schemas.ProblemCreate, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_verified_user), 
    redis = Depends(get_redis)
):
    new_problem = await crud.create_problem(db, problem, current_user.id)
    await redis.delete(problems_list_key(current_user.id, False))
    await redis.delete(problems_list_key(0, True))
    return new_problem

@app.get("/problems", response_model=List[schemas.ProblemRead])
async def get_problems(
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_verified_user), 
    redis = Depends(get_redis)
):
    key = problems_list_key(current_user.id, current_user.is_admin)
    cached = await redis.get(key)
    if cached:
        return json.loads(cached)

    if current_user.is_admin:
        problems = await crud.get_problems(db)
    else:
        problems = await crud.get_problems_by_user_id(db, current_user.id)

    serialized = jsonable_encoder(problems)
    await redis.set(key, json.dumps(serialized), ex=600)
    return serialized

@app.get("/problems/{id}", response_model=schemas.ProblemRead)
async def get_problem(
    id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_verified_user), 
    redis = Depends(get_redis)
):
    key = f"problem:{id}"
    cached = await redis.get(key)
    
    if cached:
        problem_data = json.loads(cached)
        if not current_user.is_admin and problem_data['user_id'] != current_user.id:
            raise HTTPException(status_code=403, detail="Not your problem")
        return problem_data

    problem = await crud.get_problem(db, id)
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    
    if not current_user.is_admin and problem.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your problem")
    
    serialized = jsonable_encoder(problem)
    await redis.set(key, json.dumps(serialized), ex=600)
    return serialized

@app.delete("/problems/{id}")
async def delete_problem(
    id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_verified_user), 
    redis = Depends(get_redis)
):
    problem = await crud.get_problem(db, id)
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    
    if not current_user.is_admin and problem.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    await redis.delete(problems_list_key(problem.user_id, False))
    await redis.delete(problems_list_key(0, True))
    await redis.delete(f"problem:{id}")

    return await crud.delete_problem(db, id)

# ========= ADMIN ENDPOINTS =========

@app.patch("/problems/{id}/status", response_model=schemas.ProblemRead)
async def change_problem_status(
    id: int, 
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db), 
    admin: User = Depends(get_current_admin),
    status_update: schemas.ProblemUpdateStatus = Body(...), 
    redis = Depends(get_redis)
):
    updated = await crud.update_problem_status(db, id, status_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Problem not found")

    if updated.status == "виконано":
        message = MessageSchema(
        subject=f"Заявка №{updated.id} виконана!",
        recipients=[updated.user.email],
        body=f"Привіт, {updated.user.username}!\n\nВаша заявка №{updated.id} змінила статус на 'виконано'.",
        subtype=MessageType.plain
        )
        tg_message = f"✅ Ваша заявка №{updated.id} виконана!"
    else:
        message = MessageSchema(
        subject=f"Заявка №{updated.id} відмовлена🙁",
        recipients=[updated.user.email],
        body=f"Привіт, {updated.user.username}!\n\nВаша заявка №{updated.id} змінила статус на 'відмовлено'.",
        subtype=MessageType.plain
        )

        tg_message = f"❌ Ваша заявка №{updated.id} відмовлена🙁"

    fm = FastMail(conf)

    background_tasks.add_task(fm.send_message, message)

    if updated.user.telegram_id:
        background_tasks.add_task(send_tg_message, updated.user.telegram_id, tg_message)

    await redis.delete(f"problem:{id}")
    await redis.delete(problems_list_key(updated.user_id, False))
    await redis.delete(problems_list_key(0, True))
    
    return updated

@app.post("/service-record", response_model=schemas.ServiceRecordRead)
async def create_service_record(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db), 
    admin: User = Depends(get_current_admin), 
    record: schemas.ServiceRecordCreate = Body(...),
    redis = Depends(get_redis)
):
    new_service_record = await crud.create_service_record(db, record)

    if new_service_record.used_parts:
        message = MessageSchema(
        subject=f"Заявка №{new_service_record.problem_id} виконана!",
        recipients=[new_service_record.user.email],
        body=f"Привіт, {new_service_record.user.username}!\n\nВаша заявка №{new_service_record.problem_id} виконана.\nІнформація: {new_service_record.work_done}\nВикористані деталі:{', '.join(new_service_record.used_parts)}",
        subtype=MessageType.plain
        )
    else:
        message = MessageSchema(
        subject=f"Заявка №{new_service_record.problem_id} виконана!",
        recipients=[new_service_record.user.email],
        body=f"Привіт, {new_service_record.user.username}!\n\nВаша заявка №{new_service_record.problem_id} виконана.\nІнформація: {new_service_record.work_done}",
        subtype=MessageType.plain
        )

    fm = FastMail(conf)
    background_tasks.add_task(fm.send_message, message)

    if new_service_record.user.telegram_id:
        tg_text = f"✅ Ваша заявка №{new_service_record.problem_id} виконана!\nІнформація: {new_service_record.work_done}"

    background_tasks.add_task(send_tg_message, new_service_record.user.telegram_id, tg_text)


    await redis.delete(problems_list_key(new_service_record.problem.user_id, False))
    await redis.delete(problems_list_key(0, True))
    await redis.delete(f"problem:{new_service_record.problem_id}")

    return new_service_record


@app.patch("/problems/{id}/assign")
async def asign_admin(id: int, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    return await crud.assign_admin(db, id, admin.id)

@app.post("/problems/response", response_model=schemas.AdminResponseRead)
async def admin_response(db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin), response: schemas.AdminResponseCreate = Body(...)):
    return await crud.create_admin_response(db, response, admin.id)