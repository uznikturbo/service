import models
import schemas
from fastapi import HTTPException, UploadFile, status
from security import hash_pass, verify_password
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from utils import upload_file

# ================= USERS =================

async def create_user(db: AsyncSession, user: schemas.UserCreate):
    db_user = models.User(
        username=user.username,
        email=user.email,
        password=hash_pass(user.password),
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user


async def get_user_by_id(db: AsyncSession, user_id: int):
    result = await db.execute(
        select(models.User).where(models.User.id == user_id)
    )
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str):
    result = await db.execute(
        select(models.User).where(models.User.email == email)
    )
    return result.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str):
    result = await db.execute(
        select(models.User).where(models.User.username == username)
    )
    return result.scalar_one_or_none()


async def authenticate_user(db: AsyncSession, email: str, password: str):
    user = await get_user_by_email(db, email)

    if user and verify_password(password, user.password):
        return user

    return None


async def delete_user(db: AsyncSession, user_id: int):
    user = await get_user_by_id(db, user_id)

    if user:
        await db.delete(user)
        await db.commit()

    return user


async def update_user(db: AsyncSession, change: schemas.UserUpdate, user_id: int):
    user = await get_user_by_id(db, user_id)

    if not user:
        return None, False

    update_data = change.model_dump(exclude_unset=True)

    email_changed = False

    if "email" in update_data and update_data["email"] != user.email:
        user.is_verified = False
        email_changed = True

    if 'password' in update_data:
        update_data["password"] = hash_pass(update_data["password"])

    for field, value in update_data.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)

    return user, email_changed


async def make_admin(db: AsyncSession, user_id: int):
    user = await get_user_by_id(db, user_id)

    if not user:
        return None

    user.is_admin = True

    await db.commit()
    await db.refresh(user)


async def verify_user(db: AsyncSession, user_id:int):
    user = await get_user_by_id(db, user_id)

    if user:
        user.is_verified = True
        await db.commit()
        await db.refresh(user)
    
    return user


async def get_user_by_telegram_id(db: AsyncSession, telegram_id: int):
    result = await db.execute(
        select(models.User).where(models.User.telegram_id == telegram_id)
    )
    return result.scalar_one_or_none()


async def unlink_user_tg(db: AsyncSession, user_id: int):
    user = await get_user_by_id(db, user_id)

    if user:
        user.telegram_id = None
        await db.commit()
        await db.refresh(user)

    return user




# ================= PROBLEMS =================

def _problem_query_options():
    return [
        selectinload(models.Problem.response),
        selectinload(models.Problem.service_record),
        selectinload(models.Problem.user)
    ]

async def create_problem(db: AsyncSession, problem_data: schemas.ProblemCreate, image: UploadFile, user_id: int):
    image_path = None

    if image:
        image_path = await upload_file(image, "uploads")
        if image_path is None:
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="must be image with extension png jpeg jpg webp")

    db_problem = models.Problem(title=problem_data.title, description=problem_data.description, user_id=user_id, image_url=image_path)
    db.add(db_problem)
    await db.commit()
    
    query = (
        select(models.Problem)
        .where(models.Problem.id == db_problem.id)
        .options(*_problem_query_options())
    )
    result = await db.execute(query)
    return result.scalar_one()

async def get_problems(db: AsyncSession):
    query = select(models.Problem).options(*_problem_query_options())
    result = await db.execute(query)
    return result.scalars().all()

async def get_problems_by_user_id(db: AsyncSession, user_id: int):
    query = (
        select(models.Problem)
        .where(models.Problem.user_id == user_id)
        .options(*_problem_query_options())
    )
    result = await db.execute(query)
    return result.scalars().all()

async def get_problem(db: AsyncSession, problem_id: int):
    query = (
        select(models.Problem)
        .where(models.Problem.id == problem_id)
        .options(*_problem_query_options())
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()

async def delete_problem(db: AsyncSession, problem_id: int):
    problem = await get_problem(db, problem_id)
    if problem:
        await db.delete(problem)
        await db.commit()
    return problem

async def assign_admin(db: AsyncSession, problem_id: int, admin_id: int):
    stmt = (
        update(models.Problem)
        .where(models.Problem.id == problem_id)
        .values(admin_id=admin_id, status="в роботі")
    )
    await db.execute(stmt)
    await db.commit()
    
    return await get_problem(db, problem_id)

async def update_problem_status(db: AsyncSession, problem_id: int, status_update: schemas.ProblemUpdateStatus):
    stmt = (
        update(models.Problem)
        .where(models.Problem.id == problem_id)
        .values(status=status_update.status)
    )
    await db.execute(stmt)
    await db.commit()
    
    return await get_problem(db, problem_id)
# ================= ADMIN RESPONSE =================

async def create_admin_response(db: AsyncSession, response: schemas.AdminResponseCreate, admin_id: int):
    problem = await get_problem(db, response.problem_id)
    if not problem:
        return None
        
    db_response = models.AdminResponse(
        problem_id=response.problem_id,
        message=response.message,
        admin_id=admin_id 
    )
    db.add(db_response)
    await db.commit()
    await db.refresh(db_response)
    return db_response


# ================= SERVICE RECORD =================

async def create_service_record(db: AsyncSession, record: schemas.ServiceRecordCreate):
    problem = await get_problem(db, record.problem_id)
    if not problem:
        return None
        
    db_record = models.ServiceRecord(
        **record.model_dump(exclude={"user_id"}),
        user_id=problem.user_id
    )
    db.add(db_record)

    await update_problem_status(db, record.problem_id, schemas.ProblemUpdateStatus(status="виконано"))

    await db.commit()

    query = (
        select(models.ServiceRecord)
        .where(models.ServiceRecord.id == db_record.id)
        .options(
            selectinload(models.ServiceRecord.user),
            selectinload(models.ServiceRecord.problem)
        )
    )
    result = await db.execute(query)
    
    return result.scalar_one()

async def get_service_record(db: AsyncSession, problem_id: int):
    query = select(models.ServiceRecord).where(models.ServiceRecord.problem_id == problem_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()