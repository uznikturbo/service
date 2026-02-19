import models
import schemas
from security import hash_pass, verify_password
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
        await None

    update_data = change.model_dump(exclude_unset=True)

    if 'password' in update_data:
        update_data["password"] = hash_pass(update_data["password"])

    for field, value in update_data.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)

    return user


async def make_admin(db: AsyncSession, user_id: int):
    user = await get_user_by_id(db, user_id)

    if not user:
        await None

    user.is_admin = not user.is_admin

    await db.commit()
    await db.refresh(user)

# ================= PROBLEMS =================

def _problem_query_options():
    return [
        selectinload(models.Problem.response),
        selectinload(models.Problem.service_record)
    ]

async def create_problem(db: AsyncSession, problem: schemas.ProblemCreate, user_id: int):
    db_problem = models.Problem(**problem.model_dump(), user_id=user_id)
    db.add(db_problem)
    await db.commit()
    
    # ВАЖНО: Делаем выборку заново с подгрузкой связей, 
    # иначе Pydantic упадет при попытке прочитать response/service_record
    query = (
        select(models.Problem)
        .where(models.Problem.id == db_problem.id)
        .options(*_problem_query_options())
    )
    result = await db.execute(query)
    return result.scalar_one()

async def get_problems(db: AsyncSession):
    # Для админа: загружаем все проблемы со связями
    query = select(models.Problem).options(*_problem_query_options())
    result = await db.execute(query)
    return result.scalars().all()

async def get_problems_by_user_id(db: AsyncSession, user_id: int):
    # Для юзера: только его проблемы со связями
    query = (
        select(models.Problem)
        .where(models.Problem.user_id == user_id)
        .options(*_problem_query_options())
    )
    result = await db.execute(query)
    return result.scalars().all()

async def get_problem(db: AsyncSession, problem_id: int):
    # Получение одной проблемы
    query = (
        select(models.Problem)
        .where(models.Problem.id == problem_id)
        .options(*_problem_query_options())
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()

async def delete_problem(db: AsyncSession, problem_id: int):
    # Сначала находим (чтобы вернуть), потом удаляем
    problem = await get_problem(db, problem_id)
    if problem:
        await db.delete(problem)
        await db.commit()
    return problem

async def assign_admin(db: AsyncSession, problem_id: int, admin_id: int):
    # Обновляем admin_id и статус
    stmt = (
        update(models.Problem)
        .where(models.Problem.id == problem_id)
        .values(admin_id=admin_id, status="В роботі")
    )
    await db.execute(stmt)
    await db.commit()
    
    # Возвращаем обновленный объект с подгрузкой!
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
    # Проверяем, есть ли такая проблема
    problem = await get_problem(db, response.problem_id)
    if not problem:
        return None
        
    db_response = models.AdminResponse(
        problem_id=response.problem_id,
        message=response.message,
        # Если в модели AdminResponse есть поле admin_id, раскомментируйте:
        admin_id=admin_id 
    )
    db.add(db_response)
    await db.commit()
    await db.refresh(db_response)
    return db_response


# ================= SERVICE RECORD =================

async def create_service_record(db: AsyncSession, record: schemas.ServiceRecordCreate):
    # Так как parts_used это список строк (List[str]), а в БД часто хранится как JSON или строка,
    # убедитесь, что модель это поддерживает. Если вы используете SQLAlchemy с JSON типом, 
    # то record.model_dump() сработает нормально.
    
    db_record = models.ServiceRecord(**record.model_dump())
    
    db.add(db_record)
    await db.commit()
    await db.refresh(db_record)
    return db_record

async def get_service_record(db: AsyncSession, problem_id: int):
    query = select(models.ServiceRecord).where(models.ServiceRecord.problem_id == problem_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()