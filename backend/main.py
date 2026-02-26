import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional

import crud
import schemas
from db import get_db
from dotenv import load_dotenv
from email_templates import render
from fastapi import (
    BackgroundTasks,
    Body,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi_limiter.depends import RateLimiter
from fastapi_mail import FastMail, MessageSchema, MessageType
from models import User
from pyrate_limiter import Duration, Limiter, Rate
from redis_config import get_redis
from security import create_access_token, create_refresh_token
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


app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

manager = ConnectionManager()


# ========== USER ENDPOINTS ==========

@app.post("/register", response_model=schemas.UserRead, dependencies=[Depends(RateLimiter(limiter=Limiter(Rate(5, Duration.HOUR))))])
async def register(user: schemas.UserCreate, db: AsyncSession = Depends(get_db)):
    if await crud.get_user_by_email(db, user.email):
        raise HTTPException(status_code=400, detail="Email already exists")
    if await crud.get_user_by_username(db, user.username):
        raise HTTPException(status_code=400, detail="Username already taken")
    
    new_user = await crud.create_user(db, user)

    return new_user

@app.post("/login", response_model=schemas.Token, dependencies=[Depends(RateLimiter(Limiter(Rate(3, Duration.MINUTE))))])
async def login(user: schemas.UserLogin, db: AsyncSession = Depends(get_db)):
    db_user = await crud.authenticate_user(db, user.email, user.password)
    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = create_access_token({"sub": str(db_user.id)})
    refresh_token = create_refresh_token({"sub": str(db_user.id)})
    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}

@app.post("/verify-email", dependencies=[Depends(RateLimiter(Limiter(Rate(10, Duration.MINUTE * 10))))])
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

@app.post("/resend-code", dependencies=[Depends(RateLimiter(Limiter(Rate(2, Duration.MINUTE * 2))))])
async def resend_code(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), redis = Depends(get_redis)):
    code = await redis.get(f"verification:{current_user.id}")

    if code is None:
        code = generate_code()
        await redis.set(f"verification:{current_user.id}", code, ex=600)

    body = render("verification_code", code=code)
    message = MessageSchema(
    subject="Код верифікації",
    recipients=[current_user.email],
    body=body,
    subtype=MessageType.html
    )
    fm = FastMail(conf)
    background_tasks.add_task(fm.send_message, message)

    return {"message": "Code successfully sent"}




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

@app.patch("/users/me", response_model=schemas.UserRead, dependencies=[Depends(RateLimiter(Limiter(Rate(10, Duration.MINUTE * 10))))])
async def update_profile(update_data: schemas.UserUpdate,db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    updated_user = await crud.update_user(db, update_data, current_user.id)

    if not updated_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return updated_user

@app.post("/users/makeadmin")
async def make_admin(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_verified_user)):
    return await crud.make_admin(db, current_user.id)


@app.post("/users/telegram/generate-link", dependencies=[Depends(RateLimiter(Limiter(Rate(5, Duration.HOUR))))])
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

@app.post("/auth/refresh", dependencies=[Depends(RateLimiter(Limiter(Rate(30, Duration.MINUTE))))])
async def refresh_access_token(data: schemas.RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = jwt.decode(data.refresh_token, SECRET_KEY, algorithms=[ALGORITHM])

        if payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        
        user_id = payload.get("sub")
        user = await crud.get_user_by_id(db, int(user_id))
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        
        new_access_token = create_access_token(data={"sub": str(user.id)})
        return {"access_token": new_access_token, "token_type": "bearer"}
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

# =========== PROBLEM ENDPOINTS =============

@app.post("/problems", response_model=schemas.ProblemRead)
async def create_problem(
    problem_data: schemas.ProblemCreate,
    image: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_verified_user), 
    redis = Depends(get_redis)
):  
    new_problem = await crud.create_problem(db, problem_data, image, current_user.id)
    
    await redis.delete(problems_list_key(current_user.id, False))
    await redis.delete(problems_list_key(0, True))

    await manager.broadcast_new_problem(new_problem)
    
    return new_problem

@app.get("/problems", response_model=List[schemas.ProblemListRead])
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

@app.get("/problems/{id}", response_model=schemas.ProblemRead, dependencies=[Depends(RateLimiter(Limiter(Rate(5, Duration.SECOND * 30))))])
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
    
    is_creator = problem.user_id == current_user.id
    is_assigned_admin = current_user.is_admin and problem.admin_id == current_user.id
    is_unassigned_admin = current_user.is_admin and problem.admin_id is None
    
    if not (is_creator or is_assigned_admin or is_unassigned_admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your problem")
    
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

    if status_update.status == "відмовлено":
        body = render("ticket_rejected", username=updated.user.username, problem_id=updated.id)
        message = MessageSchema(
        subject=f"Заявка №{updated.id} відмовлена🙁",
        recipients=[updated.user.email],
        body=body,
        subtype=MessageType.html
        )

        tg_message = f"❌ Ваша заявка №{updated.id} відмовлена🙁"

        fm = FastMail(conf)

        background_tasks.add_task(fm.send_message, message)

        if updated.user.telegram_id:
            background_tasks.add_task(send_tg_message, updated.user.telegram_id, tg_message)

    await redis.delete(f"problem:{id}")
    await redis.delete(problems_list_key(updated.user_id, False))
    await redis.delete(problems_list_key(0, True))
    
    await manager.broadcast_problem_update(updated)

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
    problem = await crud.get_problem(db, new_service_record.problem_id)
    if not problem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="problem not found")

    body = render("service_record", username=new_service_record.user.username, problem_id=new_service_record.problem_id, work_done=new_service_record.work_done, used_parts=new_service_record.used_parts, warranty_info=new_service_record.warranty_info)
    message = MessageSchema(
    subject=f"Заявка №{new_service_record.problem_id} виконана!",
    recipients=[new_service_record.user.email],
    body=body,
    subtype=MessageType.html
    )

    fm = FastMail(conf)
    background_tasks.add_task(fm.send_message, message)

    if new_service_record.user.telegram_id:
        tg_text = f"✅ Ваша заявка №{new_service_record.problem_id} виконана!\nІнформація: {new_service_record.work_done}"
        background_tasks.add_task(send_tg_message, new_service_record.user.telegram_id, tg_text)


    await redis.delete(problems_list_key(new_service_record.problem.user_id, False))
    await redis.delete(problems_list_key(0, True))
    await redis.delete(f"problem:{new_service_record.problem_id}")

    await manager.broadcast_problem_update(problem)

    return new_service_record


@app.patch("/problems/{id}/assign")
async def assign_admin(id: int, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin), redis = Depends(get_redis)):
    new_assign = await crud.assign_admin(db, id, admin.id)
    if not new_assign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found")

    await redis.delete(problems_list_key(new_assign.user_id, False))
    await redis.delete(problems_list_key(0, True))
    await redis.delete(f"problem:{id}")

    return new_assign

# ========= WEBSOCKETS ============

@app.websocket("/ws/problems/notifications")
async def problems_notifications(
    websocket: WebSocket, 
    current_user = Depends(get_current_user_ws)
):
    await manager.connect_global(websocket, current_user.id, current_user.is_admin)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_global(websocket, current_user.id, current_user.is_admin)


@app.websocket("/ws/problems/{id}/chat")
async def problem_chat(
    websocket: WebSocket, 
    id: int, 
    current_user = Depends(get_current_user_ws), 
    db: AsyncSession = Depends(get_db), 
    redis = Depends(get_redis)
):
    await websocket.accept()

    problem = await crud.get_problem(db, id)

    if not problem:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    
    is_creator = problem.user_id == current_user.id
    is_assigned_admin = current_user.is_admin and problem.admin_id == current_user.id

    if not (is_creator or is_assigned_admin):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    manager.chat_connect(websocket, id)

    try:
        while True:
            data = await websocket.receive_text()
            
            try:
                message_data = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"error": "Invalid JSON format"}))
                continue

            text = message_data.get("message")
            
            if not text or not str(text).strip():
                continue

            new_message = await crud.create_message(
                db=db, 
                text=text.strip(), 
                sender_id=current_user.id, 
                problem_id=id
            )

            if new_message:
                await redis.delete(f"problem:{id}")

                response_payload = {
                    "id": new_message.id,
                    "message": new_message.message,
                    "user_id": new_message.user_id,
                    "is_admin": new_message.is_admin,
                    "date_created": new_message.date_created.isoformat()
                }
            
                await manager.broadcast_to_problem(json.dumps(response_payload), id)

    except WebSocketDisconnect:
        manager.chat_disconnect(websocket, id)


# ========== GAMES ENPOINTS ============

@app.post("/users/me/snake", response_model=schemas.SnakeRead)
async def snake_game(stats: schemas.SnakeCreate, db: AsyncSession = Depends(get_db), redis = Depends(get_redis), current_user: User = Depends(get_verified_user)):
    stats.user_id = current_user.id
    await crud.create_snake(db, stats)

    await redis.delete("snake_top_10")

    return await get_snake_game(db, redis, current_user)


@app.get("/users/me/snake", response_model=schemas.SnakeRead)
async def get_snake_game(db: AsyncSession = Depends(get_db), redis = Depends(get_redis), current_user: User = Depends(get_verified_user)):
    cache_key = "snake_top_10"
    cached_top = await redis.get(cache_key)
    if cached_top:
        top_10 = json.loads(cached_top)
    else:
        top_10_raw = await crud.get_top_10(db)
        top_10 = jsonable_encoder(top_10_raw)
        await redis.set(cache_key, json.dumps(top_10), ex=60)

    for entry in top_10:
        entry["is_current_user"] = (entry["user_id"] == current_user.id)

    user_stats = await crud.get_user_stats(db, current_user.id)
    return {"top_points": top_10, "user_points": user_stats}