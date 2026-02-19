import pytest
from httpx import AsyncClient
from models import User
from security import verify_password
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_get_profile_success(client: AsyncClient):
    payload_reg = {"username": "test", "email": "test@example.com", "password": "123123"}

    response1 = await client.post("/register/", json=payload_reg)
    assert response1.status_code == 200

    payload_log = {"email": "test@example.com", "password": "123123"}

    response2 = await client.post("/login/", json=payload_log)
    assert response2.status_code == 200


    response3 = await client.get("/users/me", headers={"Authorization": f"Bearer {response2.json()["access_token"]}"})
    assert response3.status_code == 200
    assert response3.json() == {"username": "test", "email": "test@example.com", "id": response1.json()["id"], "is_admin": False}


@pytest.mark.asyncio
async def test_get_profile_failed(client: AsyncClient):
    response = await client.get("/users/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_change_username(client: AsyncClient):
    payload_reg = {"username": "test", "email": "test@example.com", "password": "123123"}

    response1 = await client.post("/register/", json=payload_reg)
    assert response1.status_code == 200

    payload_log = {"email": "test@example.com", "password": "123123"}

    response2 = await client.post("/login/", json=payload_log)
    assert response2.status_code == 200

    payload_change = {"username": "test1"}

    response3 = await client.patch("/users/me", json=payload_change, headers={"Authorization": f"Bearer {response2.json()["access_token"]}"})

    assert response3.status_code == 200
    assert response3.json()["username"] != "test"
    assert response3.json()["email"] == "test@example.com"
    assert verify_password("123123", response3.json()["password"]) == True


@pytest.mark.asyncio
async def test_change_email(client: AsyncClient):
    payload_reg = {"username": "test", "email": "test@example.com", "password": "123123"}

    response1 = await client.post("/register/", json=payload_reg)
    assert response1.status_code == 200

    payload_log = {"email": "test@example.com", "password": "123123"}

    response2 = await client.post("/login/", json=payload_log)
    assert response2.status_code == 200

    payload_change = {"email": "test1@example.com"}

    response3 = await client.patch("/users/me", json=payload_change, headers={"Authorization": f"Bearer {response2.json()["access_token"]}"})

    assert response3.status_code == 200
    assert response3.json()["username"] == "test"
    assert response3.json()["email"] != "test@example.com"
    assert verify_password("123123", response3.json()["password"]) == True

@pytest.mark.asyncio
async def test_change_password(client: AsyncClient):
    payload_reg = {"username": "test", "email": "test@example.com", "password": "123123"}

    response1 = await client.post("/register/", json=payload_reg)
    assert response1.status_code == 200

    payload_log = {"email": "test@example.com", "password": "123123"}

    response2 = await client.post("/login/", json=payload_log)
    assert response2.status_code == 200

    payload_change = {"password": "t21121241"}

    response3 = await client.patch("/users/me", json=payload_change, headers={"Authorization": f"Bearer {response2.json()["access_token"]}"})

    assert response3.status_code == 200
    assert response3.json()["username"] == "test"
    assert response3.json()["email"] == "test@example.com"
    assert verify_password("123123", response3.json()["password"]) == False


@pytest.mark.asyncio
async def test_delete_account(client: AsyncClient, db_session: AsyncSession):
    payload_reg = {"username": "test", "email": "test@example.com", "password": "123123"}

    response1 = await client.post("/register/", json=payload_reg)
    assert response1.status_code == 200

    payload_log = {"email": "test@example.com", "password": "123123"}

    response2 = await client.post("/login/", json=payload_log)
    assert response2.status_code == 200

    response3 = await client.delete("/users/me", headers={"Authorization": f"Bearer {response2.json()["access_token"]}"})

    assert response3.status_code == 200
    assert response3.json() == {"username": "test", "email": "test@example.com", "id": response1.json()["id"], "is_admin": False}
    assert await db_session.get(User, response1.json()["id"]) is None
