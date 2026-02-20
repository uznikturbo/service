import os
import random
import string

import crud
import httpx
from db import get_db
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from fastapi_mail import ConnectionConfig
from jose import JWTError, jwt
from models import User
from redis_config import get_redis
from security import ALGORITHM, SECRET_KEY
from sqlalchemy.ext.asyncio import AsyncSession

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


async def send_tg_message(chat_id: int, text: str):
    bot_token = os.getenv("BOT_TOKEN")
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"

    async with httpx.AsyncClient() as client:
        try:
            await client.post(url, json={"chat_id": chat_id, "text": text})
        except Exception as e:
            print(f"Error while sending message to Telegram: {e}")