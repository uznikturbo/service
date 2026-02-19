import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List

import crud
import schemas
from db import Base, engine, get_db
from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from models import User
from redis_config import get_redis
from security import ALGORITHM, SECRET_KEY, create_access_token
from sqlalchemy.ext.asyncio import AsyncSession

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(lifespan=lifespan)

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

async def get_current_admin(user: User = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user

# ========== USER ENDPOINTS ==========

@app.post("/register/", response_model=schemas.UserRead)
async def register(user: schemas.UserCreate, db: AsyncSession = Depends(get_db)):
    if await crud.get_user_by_email(db, user.email):
        raise HTTPException(status_code=400, detail="Email already exists")
    if await crud.get_user_by_username(db, user.username):
        raise HTTPException(status_code=400, detail="Username already taken")
    return await crud.create_user(db, user)

@app.post("/login/", response_model=schemas.Token)
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

# =========== PROBLEM ENDPOINTS =============

@app.post("/problems/", response_model=schemas.ProblemRead)
async def create_problem(
    problem: schemas.ProblemCreate, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user), 
    redis = Depends(get_redis)
):
    new_problem = await crud.create_problem(db, problem, current_user.id)
    await redis.delete(problems_list_key(current_user.id, False))
    await redis.delete(problems_list_key(0, True))
    return new_problem

@app.get("/problems/", response_model=List[schemas.ProblemRead])
async def get_problems(
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user), 
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

@app.get("/problems/{id}/", response_model=schemas.ProblemRead)
async def get_problem(
    id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user), 
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

@app.delete("/problems/{id}/")
async def delete_problem(
    id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user), 
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