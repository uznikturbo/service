import pytest
from httpx import AsyncClient
from jose import jwt
from security import ALGORITHM, SECRET_KEY


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    payload = {
        "username": "test",
        "email": "test@example.com",
        "password": "pass123213"
    }

    response = await client.post("/register/", json=payload)

    assert response.status_code == 200

    data = response.json()
    assert data["email"] == payload["email"]
    assert data["username"] == payload["username"]

    assert "id" in data
    assert isinstance(data["id"], int)

    assert "password" not in data


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    payload = {"username": "test1", "email": "test@example.com", "password": "1234123"}

    response1 = await client.post("/register/", json=payload)
    assert response1.status_code == 200

    payload_dupli = payload.copy()
    payload_dupli["username"] = "test2"

    response2 = await client.post("/register/", json=payload)
    assert response2.status_code == 400
    assert response2.json()["detail"] == "email already exists"


@pytest.mark.asyncio
async def test_register_duplicate_username(client: AsyncClient):
    payload = {"username": "test1", "email": "test1@example.com", "password": "123123"}

    response1 = await client.post("/register/", json=payload)
    assert response1.status_code == 200

    payload_dupli = payload.copy()
    payload_dupli["email"] = "test2@example.com"

    response2 = await client.post("/register/", json=payload_dupli)
    assert response2.status_code == 400
    assert response2.json()["detail"] == "username already taken"


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    payload_reg = {"username": "test", "email": "test@example.com", "password": "123123"}

    response1 = await client.post("/register/", json=payload_reg)
    assert response1.status_code == 200

    payload_log = {"email": "test@example.com", "password": "123123"}

    response2 = await client.post("/login/", json=payload_log)
    assert response2.status_code == 200

    data = response2.json()

    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert isinstance(data["access_token"], str)

    token = data["access_token"]
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

    assert payload["sub"] == str(response1.json()["id"])

    assert "exp" in payload


@pytest.mark.asyncio
async def test_login_failed(client: AsyncClient):
    payload_reg = {"username": "test", "email": "test@example.com", "password": "123123"}

    response1 = await client.post("/register/", json=payload_reg)
    assert response1.status_code == 200

    payload_log = {"email": "ewfew@dfsfs.com", "password": "12312412412"}

    response2 = await client.post("/login/", json=payload_log)

    assert response2.status_code == 401
    assert response2.json()["detail"] == "Invalid credentials"