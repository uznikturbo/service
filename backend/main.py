import json
import os
import random
import string
from datetime import datetime, timezone
from typing import List

import crud
import schemas
from db import get_db
from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, HTTPException, Request, status
from fastapi.background import BackgroundTasks
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from jose import JWTError, jwt
from models import User
from redis_config import get_redis
from security import ALGORITHM, SECRET_KEY, create_access_token
from sqlalchemy.ext.asyncio import AsyncSession

load_dotenv()

app = FastAPI(redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:80"],
    allow_credentials=True,
    allow_headers=["*"],
    allow_methods=["*"]
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


def problems_list_key(user_id: int, is_admin: bool) -> str:
    if is_admin:
        return "admin:problems_list"
    return f"user:{user_id}:problems_list"


async def get_current_user(
    request: Request, 
    token: str = Depends(oauth2_scheme), 
    db: AsyncSession = Depends(get_db), 
    redis = Depends(get_redis)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, 
        detail="Could not validate credentials"
    )

    is_blacklisted = await redis.get(f"blacklist:{token}")
    if is_blacklisted:
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await crud.get_user_by_id(db, int(user_id))
    if user is None:
        raise credentials_exception
    
    request.state.token = token
    request.state.exp = payload.get("exp")
    
    return user


async def get_verified_user(user: User = Depends(get_current_user)):
    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your email not verified")
    
    return user


async def get_current_admin(user: User = Depends(get_verified_user)):
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


conf = ConnectionConfig(
    MAIL_USERNAME = os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD"),
    MAIL_FROM = os.getenv("MAIL_FROM"),
    MAIL_PORT = 587,
    MAIL_SERVER = "smtp.gmail.com",
    MAIL_STARTTLS = True,
    MAIL_SSL_TLS = False,
    USE_CREDENTIALS = True,
    VALIDATE_CERTS = True
)

def generate_code():
    return "".join(random.choices(string.digits, k=6))

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
    db: AsyncSession = Depends(get_db), 
    admin: User = Depends(get_current_admin),
    status_update: schemas.ProblemUpdateStatus = Body(...), 
    redis = Depends(get_redis)
):
    updated = await crud.update_problem_status(db, id, status_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Problem not found")

    await redis.delete(f"problem:{id}")
    await redis.delete(problems_list_key(updated.user_id, False))
    await redis.delete(problems_list_key(0, True))
    
    return updated

@app.post("/service-record", response_model=schemas.ServiceRecordRead)
async def create_service_record(
    db: AsyncSession = Depends(get_db), 
    admin: User = Depends(get_current_admin), 
    record: schemas.ServiceRecordCreate = Body(...)
):
    return await crud.create_service_record(db, record)

@app.patch("/problems/{id}/assign")
async def asign_admin(id: int, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    return await crud.assign_admin(db, id, admin.id)

@app.post("/problems/response", response_model=schemas.AdminResponseRead)
async def admin_response(db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin), response: schemas.AdminResponseCreate = Body(...)):
    return await crud.create_admin_response(db, response, admin.id)