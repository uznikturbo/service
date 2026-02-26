import json
import os
import random
import string
import uuid
from datetime import datetime
from typing import Dict, List

import aiofiles
import crud
import httpx
from db import get_db
from fastapi import (
    Depends,
    HTTPException,
    Query,
    Request,
    UploadFile,
    WebSocket,
    WebSocketException,
    status,
)
from fastapi.encoders import jsonable_encoder
from fastapi.security import OAuth2PasswordBearer
from fastapi_mail import ConnectionConfig
from jose import JWTError, jwt
from models import User
from redis_config import get_redis
from security import ALGORITHM, SECRET_KEY
from sqlalchemy.ext.asyncio import AsyncSession

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}
        self.admin_connections: List[WebSocket] = []
        self.user_connections: Dict[int, List[WebSocket]] = {}
    
    # CHAT FUNCS

    def chat_connect(self, websocket: WebSocket, problem_id: int):
        if problem_id not in self.active_connections:
            self.active_connections[problem_id] = []
        
        self.active_connections[problem_id].append(websocket)

    def chat_disconnect(self, websocket: WebSocket, problem_id: int):
        if problem_id in self.active_connections:
                if websocket in self.active_connections[problem_id]:
                    self.active_connections[problem_id].remove(websocket)

                if not self.active_connections[problem_id]:
                    del self.active_connections[problem_id]

    async def broadcast_to_problem(self, message: str, problem_id: int):
        if problem_id in self.active_connections:
            for connection in self.active_connections[problem_id][:]:
                try:
                    await connection.send_text(message)
                except Exception:
                    self.chat_connect(connection, problem_id)


    # PROBLEM LIST FUNCS

    async def connect_global(self, websocket: WebSocket, user_id: int, is_admin: bool):
        await websocket.accept()
        if is_admin:
            self.admin_connections.append(websocket)
        else:
            if user_id not in self.user_connections:
                self.user_connections[user_id] = []
            self.user_connections[user_id].append(websocket)

    def disconnect_global(self, websocket: WebSocket, user_id: int, is_admin: bool):
        if is_admin:
            if websocket in self.admin_connections:
                self.admin_connections.remove(websocket)
        else:
            if user_id in self.user_connections and websocket in self.user_connections[user_id]:
                self.user_connections[user_id].remove(websocket)

    async def broadcast_new_problem(self, problem_data: any):
        payload = {
            "type": "new_problem",
            "data": jsonable_encoder(problem_data)
        }
        message = json.dumps(payload)

        for connection in self.admin_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                print(f"Error broadcasting to admin: {e}")

        user_id = problem_data.user_id
        if user_id in self.user_connections:
            for connection in self.user_connections[user_id]:
                try:
                    await connection.send_text(message)
                except Exception as e:
                    print(f"Error broadcasting to admin: {e}")

    async def broadcast_problem_update(self, problem_data: any):
            payload = {
                "type": "update_problem",
                "data": jsonable_encoder(problem_data)
            }
            message = json.dumps(payload)

            for connection in self.admin_connections:
                try:
                    await connection.send_text(message)
                except Exception as e:
                    print(f"Error broadcasting to admin: {e}")
            
            user_id = problem_data.user_id
            if user_id in self.user_connections:
                for connection in self.user_connections[user_id]:
                    try:
                        await connection.send_text(message)
                    except Exception as e:
                        print(f"Error broadcasting to admin: {e}")

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


async def upload_file(file: UploadFile, folder: str):
    allowed_ext = {"png", "jpg", "jpeg", "webp"}
    os.makedirs(folder, exist_ok=True)

    extension = file.filename.split(".")[-1].lower()
    if extension not in allowed_ext:
        return None
    
    unique_filename = f"{uuid.uuid4()}_{datetime.now().strftime('%d-%m-%Y_%H-%M-%S')}.{extension}"

    file_path = os.path.join(folder, unique_filename)

    async with aiofiles.open(file_path, "wb") as out_file:
        while content := await file.read(1024 * 1024):
            await out_file.write(content)

    return file_path


async def get_user_by_token(token: str, db: AsyncSession):
    print(f"[WS DEBUG] Отримано токен: {token[:20]}...") # Дивимось, чи нема зайвих символів
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")

        if user_id is None:
            print("[WS DEBUG] Помилка: У payload немає поля 'sub'")
            return None
    
    except JWTError as e:
        print(f"[WS DEBUG] Помилка декодування JWT: {e}") # ТУТ зазвичай криється проблема!
        return None
    
    user = await crud.get_user_by_id(db, int(user_id))

    if not user:
        print(f"[WS DEBUG] Користувача з ID {user_id} не знайдено в БД")
        return None
    
    return user

async def get_current_user_ws(token: str = Query(...), db: AsyncSession = Depends(get_db)):
    user = await get_user_by_token(token, db)

    if not user:
        print("[WS DEBUG] WebSocketException викликано! Користувач = None")
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
    
    print(f"[WS DEBUG] Успішна авторизація для WS! Юзер: {user.username}")
    return user