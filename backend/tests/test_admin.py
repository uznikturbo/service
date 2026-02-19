import pytest
from httpx import AsyncClient
from models import User
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

async def get_auth_headers(client: AsyncClient, email: str, password: str, username: str = "user"):
    """Регистрирует (если надо) и логинит пользователя, возвращая заголовки."""
    # Пытаемся залогиниться
    login_payload = {"username": username, "email": email, "password": password}
    response = await client.post("/login/", json=login_payload)
    
    # Если не вышло (юзера нет), регистрируем и логинимся снова
    if response.status_code != 200:
        reg_payload = {"username": username, "email": email, "password": password}
        await client.post("/register/", json=reg_payload)
        response = await client.post("/login/", json=login_payload)
    
    assert response.status_code == 200, f"Auth failed: {response.text}"
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

async def create_admin_and_get_headers(client: AsyncClient, db_session: AsyncSession, email="admin@test.com", username="admin"):
    """Создает пользователя, принудительно делает его админом через БД и возвращает токен."""
    # 1. Обычная регистрация
    await client.post("/register/", json={
        "username": username,
        "email": email,
        "password": "adminpassword123"
    })

    # 2. Делаем админом через прямой SQL (хак для тестов)
    result = await db_session.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    user.is_admin = True
    await db_session.commit()

    # 3. Логинимся
    return await get_auth_headers(client, email, "adminpassword123", username)

async def create_problem_fixture(client: AsyncClient, title="Test Problem"):
    """Создает проблему от обычного юзера и возвращает её ID."""
    headers = await get_auth_headers(client, "user@test.com", "userpass123", "user")
    response = await client.post("/problems/", json={
        "title": title,
        "description": "Description"
    }, headers=headers)
    return response.json()["id"]


# === ТЕСТЫ ===

@pytest.mark.asyncio
async def test_assign_admin(client: AsyncClient, db_session: AsyncSession):
    # 1. Создаем проблему
    problem_id = await create_problem_fixture(client)
    
    # 2. Создаем админа
    admin_headers = await create_admin_and_get_headers(client, db_session)

    # 3. Админ берет проблему в работу
    response = await client.patch(f"/problems/{problem_id}/assign", headers=admin_headers)
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == problem_id
    # Проверяем, что admin_id заполнился (нужно проверить ID админа, но для простоты проверим что не null)
    assert data["admin_id"] is not None


@pytest.mark.asyncio
async def test_admin_response_to_problem(client: AsyncClient, db_session: AsyncSession):
    # 1. Создаем проблему
    problem_id = await create_problem_fixture(client)
    
    # 2. Создаем админа
    admin_headers = await create_admin_and_get_headers(client, db_session)

    # 3. Админ пишет ответ
    payload = {
        "message": "We are working on it",
        "problem_id": problem_id
    }
    response = await client.post("/problems/response/", json=payload, headers=admin_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "We are working on it"
    assert data["problem_id"] == problem_id


@pytest.mark.asyncio
async def test_change_problem_status(client: AsyncClient, db_session: AsyncSession):
    # 1. Создаем проблему
    problem_id = await create_problem_fixture(client)
    admin_headers = await create_admin_and_get_headers(client, db_session)

    # 2. Меняем статус
    payload = {"status": "виконано"}
    response = await client.patch(f"/problems/{problem_id}/status", json=payload, headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["status"] == "виконано"


@pytest.mark.asyncio
async def test_create_and_get_service_record(client: AsyncClient, db_session: AsyncSession):
    # 1. Подготовка
    problem_id = await create_problem_fixture(client)
    admin_headers = await create_admin_and_get_headers(client, db_session)

    # 2. Создание Service Record (Отчет о ремонте)
    record_payload = {
        "problem_id": problem_id,
        "work_done": "Replaced CPU fan",
        "warranty_info": "6 months",
        "used_parts": ["Fan", "Thermal Paste"] # Список строк
    }
    
    resp_create = await client.post("/service-record", json=record_payload, headers=admin_headers)
    
    assert resp_create.status_code == 200
    data_create = resp_create.json()
    assert data_create["work_done"] == "Replaced CPU fan"
    # Проверяем, что список деталей сохранился и вернулся
    assert "Fan" in data_create["used_parts"]

    # 3. Получение Service Record по ID проблемы
    resp_get = await client.get(f"/service-record/{problem_id}", headers=admin_headers)
    
    assert resp_get.status_code == 200
    data_get = resp_get.json()
    assert data_get["id"] == data_create["id"]
    assert data_get["warranty_info"] == "6 months"


@pytest.mark.asyncio
async def test_permissions_check(client: AsyncClient, db_session: AsyncSession):
    """Обычный пользователь не должен иметь доступ к админским ручкам"""
    problem_id = await create_problem_fixture(client)
    
    # Логинимся как ОБЫЧНЫЙ юзер
    user_headers = await get_auth_headers(client, "simple@test.com", "pass1234", "simple")

    # 1. Попытка назначить админа
    resp_assign = await client.patch(f"/problems/{problem_id}/assign", headers=user_headers)
    assert resp_assign.status_code == 403

    # 2. Попытка создать Service Record
    record_payload = {
        "problem_id": problem_id,
        "work_done": "Hacked",
        "warranty_info": "None"
    }
    resp_record = await client.post("/service-record", json=record_payload, headers=user_headers)
    assert resp_record.status_code == 403