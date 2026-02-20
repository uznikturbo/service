from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field

# ======== USER SCHEMAS ==========


class UserBase(BaseModel):
    username: str = Field(..., max_length=50)
    email: EmailStr = Field(..., max_length=100)


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)


class UserRead(UserBase):
    id: int
    is_admin: bool
    is_verified: bool
    telegram_id: Optional[int] = None
    model_config={"from_attributes": True}


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, max_length=100)
    password: Optional[str] = Field(None, min_length=6)


class VerifyEmail(BaseModel):
    code: str

# ========= ADMIN SCHEMAS =========


class AdminResponseBase(BaseModel):
    message: str = Field(..., max_length=1000)


class AdminResponseCreate(AdminResponseBase):
    problem_id: int


class AdminResponseRead(AdminResponseBase):
    id: int
    date_responded: datetime
    admin_id: int
    problem_id: int

    model_config={"from_attributes": True}


# ========= SERVICERECORD SCHEMAS ==========


class ServiceRecordBase(BaseModel):
    work_done: str = Field(..., max_length=1000)
    used_parts: Optional[List[str]] = None
    warranty_info: str = Field(..., max_length=1000)


class ServiceRecordCreate(ServiceRecordBase):
    problem_id: int
    user_id: int

class ServiceRecordRead(ServiceRecordBase):
    id: int
    date_completed: datetime
    problem_id: int

    model_config={"from_attributes": True}


# ======= PROBLEM SCHEMAS ========


class ProblemBase(BaseModel):
    title: str = Field(..., max_length=250)
    description: str = Field(..., max_length=1000)
    image_url: Optional[str] = Field(None, max_length=250)


class ProblemCreate(ProblemBase):
    pass


class ProblemRead(ProblemBase):
    id: int
    status: str
    date_created: datetime
    user_id: int
    admin_id: Optional[int]

    response: Optional[AdminResponseRead] = None
    service_record: Optional[ServiceRecordRead] = None

    model_config={"from_attributes": True}


class ProblemUpdateStatus(BaseModel):
    status: Literal["виконано", "відмовлено"]


# ========= JWT TOKEN SCHEMAS ==========

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    sub: str | None = None


# ========== TELEGRAM SCHEMAS ============

class TgLinkData(BaseModel):
        token: str
        telegram_id: int