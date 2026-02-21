"""
Comprehensive tests for all backend endpoints of the ServiceDesk API.

Setup:
    pip install pytest pytest-asyncio httpx fastapi sqlalchemy aiosqlite

Run:
    pytest test_main.py -v

The tests use an in-memory SQLite database and mock Redis / external services,
so no real database, Redis instance, or mail server is required.
"""

import json

# ---------------------------------------------------------------------------
# Patch heavy optional dependencies BEFORE importing the app so that the
# module-level code in utils.py (ConnectionConfig) doesn't crash when
# env-vars are absent.
# ---------------------------------------------------------------------------
import sys
from datetime import datetime, timedelta, timezone
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Stub fastapi_mail so ConnectionConfig doesn't error without SMTP env-vars
fastapi_mail_mock = MagicMock()
fastapi_mail_mock.ConnectionConfig = MagicMock(return_value=MagicMock())
fastapi_mail_mock.FastMail = MagicMock
fastapi_mail_mock.MessageSchema = MagicMock
fastapi_mail_mock.MessageType = MagicMock()
fastapi_mail_mock.MessageType.plain = "plain"
sys.modules.setdefault("fastapi_mail", fastapi_mail_mock)

# Stub fastapi_limiter so rate-limiter dependencies resolve to no-ops
class _PassThrough:
    """Dependency that always resolves to None (no rate limiting)."""
    async def __call__(self, request=None):
        return None

class _RateLimiter:
    """Fake RateLimiter that accepts any args/kwargs and returns a no-op dependency."""
    def __new__(cls, *args, **kwargs):
        return _PassThrough()

limiter_depends_mock = MagicMock()
limiter_depends_mock.RateLimiter = _RateLimiter

limiter_mock = MagicMock()
limiter_mock.depends = limiter_depends_mock

sys.modules["fastapi_limiter"] = limiter_mock
sys.modules["fastapi_limiter.depends"] = limiter_depends_mock

# Stub pyrate_limiter
pyrate_mock = MagicMock()
pyrate_mock.Duration = MagicMock()
pyrate_mock.Duration.MINUTE = 60
pyrate_mock.Duration.HOUR = 3600
pyrate_mock.Rate = MagicMock(return_value=MagicMock())
pyrate_mock.Limiter = MagicMock(return_value=MagicMock())
sys.modules["pyrate_limiter"] = pyrate_mock

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only")
os.environ.setdefault("MAIL_USERNAME", "test@example.com")
os.environ.setdefault("MAIL_PASSWORD", "testpassword")
os.environ.setdefault("MAIL_FROM", "test@example.com")
os.environ.setdefault("BOT_TOKEN", "fake-bot-token")

import pathlib

# ---------------------------------------------------------------------------
# Now it's safe to import the app modules
# ---------------------------------------------------------------------------
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

# We need to import from the backend directory
import importlib
import types

# Adjust path so we can import backend modules directly
backend_path = pathlib.Path(__file__).parent / "servicedesk" / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from db import Base, get_db
from main import app
from models import AdminResponse, Problem, ServiceRecord, User
from redis_config import get_redis
from security import create_access_token, create_refresh_token, hash_pass

# ---------------------------------------------------------------------------
# Test database (in-memory SQLite via aiosqlite)
# ---------------------------------------------------------------------------
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session


# ---------------------------------------------------------------------------
# Fake Redis
# ---------------------------------------------------------------------------
class FakeRedis:
    """Minimal in-memory Redis stand-in."""

    def __init__(self):
        self._store: dict = {}

    async def get(self, key):
        return self._store.get(key)

    async def set(self, key, value, ex=None):
        self._store[key] = value

    async def delete(self, key):
        self._store.pop(key, None)

    def clear(self):
        self._store.clear()


fake_redis = FakeRedis()


async def override_get_redis():
    return fake_redis


# Override dependencies
app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_redis] = override_get_redis

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(autouse=True)
async def clean_db():
    """Truncate all tables and clear redis before each test."""
    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())
    fake_redis.clear()
    yield


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _create_user_in_db(
    username="testuser",
    email="test@example.com",
    password="secret123",
    is_admin=False,
    is_verified=True,
) -> User:
    async with TestingSessionLocal() as session:
        user = User(
            username=username,
            email=email,
            password=hash_pass(password),
            is_admin=is_admin,
            is_verified=is_verified,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


def _token_for(user: User) -> str:
    return create_access_token({"sub": str(user.id)})


def _auth(user: User) -> dict:
    return {"Authorization": f"Bearer {_token_for(user)}"}


async def _create_problem_in_db(user_id: int, title="Test Problem", description="Test description") -> Problem:
    async with TestingSessionLocal() as session:
        problem = Problem(
            title=title,
            description=description,
            user_id=user_id,
            status="В обробці",
        )
        session.add(problem)
        await session.commit()
        await session.refresh(problem)
        return problem


# ===========================================================================
# REGISTER  POST /register
# ===========================================================================
class TestRegister:
    @pytest.mark.asyncio
    async def test_register_success(self, client):
        response = await client.post(
            "/register",
            json={"username": "alice", "email": "alice@example.com", "password": "pass123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "alice"
        assert data["email"] == "alice@example.com"
        assert "id" in data
        assert data["is_admin"] is False
        assert data["is_verified"] is False

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, client):
        await _create_user_in_db(email="bob@example.com", username="bob")
        response = await client.post(
            "/register",
            json={"username": "bob2", "email": "bob@example.com", "password": "pass123"},
        )
        assert response.status_code == 400
        assert "Email" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_register_duplicate_username(self, client):
        await _create_user_in_db(username="carol", email="carol@example.com")
        response = await client.post(
            "/register",
            json={"username": "carol", "email": "carol2@example.com", "password": "pass123"},
        )
        assert response.status_code == 400
        assert "Username" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_register_short_password(self, client):
        response = await client.post(
            "/register",
            json={"username": "dave", "email": "dave@example.com", "password": "12"},
        )
        assert response.status_code == 422  # validation error


# ===========================================================================
# LOGIN  POST /login
# ===========================================================================
class TestLogin:
    @pytest.mark.asyncio
    async def test_login_success(self, client):
        await _create_user_in_db(email="user@example.com", username="loginuser", password="mypassword")
        response = await client.post(
            "/login", json={"email": "user@example.com", "password": "mypassword"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client):
        await _create_user_in_db(email="u2@example.com", username="u2", password="correctpass")
        response = await client.post(
            "/login", json={"email": "u2@example.com", "password": "wrongpass"}
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client):
        response = await client.post(
            "/login", json={"email": "ghost@example.com", "password": "anypass"}
        )
        assert response.status_code == 401


# ===========================================================================
# REFRESH  POST /auth/refresh
# ===========================================================================
class TestRefreshToken:
    @pytest.mark.asyncio
    async def test_refresh_valid_token(self, client):
        user = await _create_user_in_db()
        refresh_token = create_refresh_token({"sub": str(user.id)})
        response = await client.post("/auth/refresh", json=refresh_token)
        assert response.status_code == 200
        assert "access_token" in response.json()

    @pytest.mark.asyncio
    async def test_refresh_with_access_token_fails(self, client):
        user = await _create_user_in_db()
        access_token = _token_for(user)
        response = await client.post("/auth/refresh", json=access_token)
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_refresh_invalid_token(self, client):
        response = await client.post("/auth/refresh", json="not.a.valid.jwt")
        assert response.status_code == 401


# ===========================================================================
# GET PROFILE  GET /users/me
# ===========================================================================
class TestGetProfile:
    @pytest.mark.asyncio
    async def test_get_profile_authenticated(self, client):
        user = await _create_user_in_db()
        response = await client.get("/users/me", headers=_auth(user))
        assert response.status_code == 200
        assert response.json()["email"] == user.email

    @pytest.mark.asyncio
    async def test_get_profile_unauthenticated(self, client):
        response = await client.get("/users/me")
        assert response.status_code == 401


# ===========================================================================
# DELETE USER  DELETE /users/me
# ===========================================================================
class TestDeleteUser:
    @pytest.mark.asyncio
    async def test_delete_self(self, client):
        user = await _create_user_in_db()
        response = await client.delete("/users/me", headers=_auth(user))
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_delete_unauthenticated(self, client):
        response = await client.delete("/users/me")
        assert response.status_code == 401


# ===========================================================================
# UPDATE PROFILE  PATCH /users/me
# ===========================================================================
class TestUpdateProfile:
    @pytest.mark.asyncio
    async def test_update_username(self, client):
        user = await _create_user_in_db()
        response = await client.patch(
            "/users/me", headers=_auth(user), json={"username": "newname"}
        )
        assert response.status_code == 200
        assert response.json()["username"] == "newname"

    @pytest.mark.asyncio
    async def test_update_unauthenticated(self, client):
        response = await client.patch("/users/me", json={"username": "x"})
        assert response.status_code == 401


# ===========================================================================
# VERIFY EMAIL  POST /verify-email
# ===========================================================================
class TestVerifyEmail:
    @pytest.mark.asyncio
    async def test_verify_email_correct_code(self, client):
        user = await _create_user_in_db(is_verified=False)
        await fake_redis.set(f"verification:{user.id}", "123456")
        response = await client.post(
            "/verify-email", headers=_auth(user), json={"code": "123456"}
        )
        assert response.status_code == 200
        assert "verified" in response.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_verify_email_wrong_code(self, client):
        user = await _create_user_in_db(is_verified=False)
        await fake_redis.set(f"verification:{user.id}", "999999")
        response = await client.post(
            "/verify-email", headers=_auth(user), json={"code": "000000"}
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_verify_email_expired(self, client):
        user = await _create_user_in_db(is_verified=False)
        # No code in redis → expired
        response = await client.post(
            "/verify-email", headers=_auth(user), json={"code": "123456"}
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_verify_already_verified(self, client):
        user = await _create_user_in_db(is_verified=True)
        response = await client.post(
            "/verify-email", headers=_auth(user), json={"code": "anything"}
        )
        assert response.status_code == 200
        assert "already" in response.json()["message"].lower()


# ===========================================================================
# RESEND CODE  POST /resend-code
# ===========================================================================
class TestResendCode:
    @pytest.mark.asyncio
    async def test_resend_code(self, client):
        user = await _create_user_in_db()
        with patch("main.FastMail") as mock_fm:
            mock_fm.return_value.send_message = AsyncMock()
            response = await client.post("/resend-code", headers=_auth(user))
        assert response.status_code == 200
        assert "sent" in response.json()["message"].lower()


# ===========================================================================
# MAKE ADMIN  POST /users/makeadmin
# ===========================================================================
class TestMakeAdmin:
    @pytest.mark.asyncio
    async def test_make_admin(self, client):
        user = await _create_user_in_db()
        response = await client.post("/users/makeadmin", headers=_auth(user))
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_make_admin_unverified(self, client):
        user = await _create_user_in_db(is_verified=False)
        response = await client.post("/users/makeadmin", headers=_auth(user))
        assert response.status_code == 403


# ===========================================================================
# TELEGRAM ENDPOINTS
# ===========================================================================
class TestTelegram:
    @pytest.mark.asyncio
    async def test_generate_tg_link(self, client):
        user = await _create_user_in_db()
        response = await client.post("/users/telegram/generate-link", headers=_auth(user))
        assert response.status_code == 200
        assert "link" in response.json()
        assert "t.me" in response.json()["link"]

    @pytest.mark.asyncio
    async def test_generate_tg_link_unverified(self, client):
        user = await _create_user_in_db(is_verified=False)
        response = await client.post("/users/telegram/generate-link", headers=_auth(user))
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_confirm_tg_link_success(self, client):
        user = await _create_user_in_db()
        token = "abc12345"
        await fake_redis.set(f"tg_link:{token}", str(user.id))
        response = await client.post(
            "/users/telegram/confirm",
            json={"token": token, "telegram_id": 12345678},
        )
        assert response.status_code == 200
        assert response.json()["username"] == user.username

    @pytest.mark.asyncio
    async def test_confirm_tg_link_expired(self, client):
        response = await client.post(
            "/users/telegram/confirm",
            json={"token": "notexist", "telegram_id": 99999},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_check_tg_link_not_linked(self, client):
        response = await client.get("/users/telegram/check/9999999")
        assert response.status_code == 200
        assert response.json()["linked"] is False

    @pytest.mark.asyncio
    async def test_check_tg_link_linked(self, client):
        user = await _create_user_in_db()
        # Manually set telegram_id
        async with TestingSessionLocal() as session:
            db_user = await session.get(User, user.id)
            db_user.telegram_id = 55555
            await session.commit()
        response = await client.get("/users/telegram/check/55555")
        assert response.status_code == 200
        assert response.json()["linked"] is True

    @pytest.mark.asyncio
    async def test_unlink_tg(self, client):
        user = await _create_user_in_db()
        response = await client.patch("/users/telegram/unlink", headers=_auth(user))
        assert response.status_code == 200


# ===========================================================================
# PROBLEMS  POST /problems
# ===========================================================================
class TestCreateProblem:
    @pytest.mark.asyncio
    async def test_create_problem_no_image(self, client):
        user = await _create_user_in_db()
        response = await client.post(
            "/problems",
            headers=_auth(user),
            data={"title": "My Problem", "description": "Some description here"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "My Problem"
        assert data["user_id"] == user.id
        assert data["status"] == "В обробці"

    @pytest.mark.asyncio
    async def test_create_problem_with_image(self, client):
        user = await _create_user_in_db()
        fake_image = BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
        with patch("crud.upload_file", new_callable=AsyncMock, return_value="uploads/test.png"):
            response = await client.post(
                "/problems",
                headers=_auth(user),
                data={"title": "Problem w/ Image", "description": "Has an image"},
                files={"image": ("test.png", fake_image, "image/png")},
            )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_create_problem_unverified(self, client):
        user = await _create_user_in_db(is_verified=False)
        response = await client.post(
            "/problems",
            headers=_auth(user),
            data={"title": "X", "description": "Y"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_create_problem_unauthenticated(self, client):
        response = await client.post(
            "/problems", data={"title": "X", "description": "Y"}
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_create_problem_title_too_long(self, client):
        user = await _create_user_in_db()
        response = await client.post(
            "/problems",
            headers=_auth(user),
            data={"title": "A" * 251, "description": "desc"},
        )
        assert response.status_code == 422


# ===========================================================================
# GET PROBLEMS  GET /problems
# ===========================================================================
class TestGetProblems:
    @pytest.mark.asyncio
    async def test_regular_user_sees_own_problems_only(self, client):
        user1 = await _create_user_in_db(username="u1", email="u1@x.com")
        user2 = await _create_user_in_db(username="u2", email="u2@x.com")
        await _create_problem_in_db(user1.id, "U1 Problem")
        await _create_problem_in_db(user2.id, "U2 Problem")
        response = await client.get("/problems", headers=_auth(user1))
        assert response.status_code == 200
        titles = [p["title"] for p in response.json()]
        assert "U1 Problem" in titles
        assert "U2 Problem" not in titles

    @pytest.mark.asyncio
    async def test_admin_sees_all_problems(self, client):
        admin = await _create_user_in_db(username="admin1", email="admin@x.com", is_admin=True)
        user = await _create_user_in_db(username="regular", email="regular@x.com")
        await _create_problem_in_db(user.id, "User Problem")
        response = await client.get("/problems", headers=_auth(admin))
        assert response.status_code == 200
        assert len(response.json()) >= 1

    @pytest.mark.asyncio
    async def test_get_problems_cached(self, client):
        user = await _create_user_in_db()
        await _create_problem_in_db(user.id)
        # First request populates cache
        r1 = await client.get("/problems", headers=_auth(user))
        # Second should hit cache and still return valid data
        r2 = await client.get("/problems", headers=_auth(user))
        assert r1.status_code == r2.status_code == 200


# ===========================================================================
# GET PROBLEM BY ID  GET /problems/{id}
# ===========================================================================
class TestGetProblemById:
    @pytest.mark.asyncio
    async def test_owner_can_get_problem(self, client):
        user = await _create_user_in_db()
        problem = await _create_problem_in_db(user.id, "My Specific Problem")
        response = await client.get(f"/problems/{problem.id}", headers=_auth(user))
        assert response.status_code == 200
        assert response.json()["title"] == "My Specific Problem"

    @pytest.mark.asyncio
    async def test_other_user_cannot_get_problem(self, client):
        owner = await _create_user_in_db(username="owner", email="owner@x.com")
        other = await _create_user_in_db(username="other", email="other@x.com")
        problem = await _create_problem_in_db(owner.id)
        response = await client.get(f"/problems/{problem.id}", headers=_auth(other))
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_can_get_any_problem(self, client):
        admin = await _create_user_in_db(username="adm", email="adm@x.com", is_admin=True)
        user = await _create_user_in_db(username="usr", email="usr@x.com")
        problem = await _create_problem_in_db(user.id)
        response = await client.get(f"/problems/{problem.id}", headers=_auth(admin))
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_problem_not_found(self, client):
        user = await _create_user_in_db()
        response = await client.get("/problems/99999", headers=_auth(user))
        assert response.status_code == 404


# ===========================================================================
# DELETE PROBLEM  DELETE /problems/{id}
# ===========================================================================
class TestDeleteProblem:
    @pytest.mark.asyncio
    async def test_owner_can_delete_problem(self, client):
        user = await _create_user_in_db()
        problem = await _create_problem_in_db(user.id)
        response = await client.delete(f"/problems/{problem.id}", headers=_auth(user))
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_other_user_cannot_delete(self, client):
        owner = await _create_user_in_db(username="o2", email="o2@x.com")
        intruder = await _create_user_in_db(username="i2", email="i2@x.com")
        problem = await _create_problem_in_db(owner.id)
        response = await client.delete(f"/problems/{problem.id}", headers=_auth(intruder))
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_can_delete_any_problem(self, client):
        admin = await _create_user_in_db(username="a3", email="a3@x.com", is_admin=True)
        user = await _create_user_in_db(username="u3", email="u3@x.com")
        problem = await _create_problem_in_db(user.id)
        response = await client.delete(f"/problems/{problem.id}", headers=_auth(admin))
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_delete_nonexistent_problem(self, client):
        user = await _create_user_in_db()
        response = await client.delete("/problems/88888", headers=_auth(user))
        assert response.status_code == 404


# ===========================================================================
# CHANGE PROBLEM STATUS  PATCH /problems/{id}/status
# ===========================================================================
class TestChangeProblemStatus:
    async def _setup_admin_and_problem(self):
        admin = await _create_user_in_db(username="adm_s", email="adm_s@x.com", is_admin=True)
        user = await _create_user_in_db(username="usr_s", email="usr_s@x.com")
        # Ensure user's email is on the problem's relationship
        problem = await _create_problem_in_db(user.id)
        return admin, user, problem

    @pytest.mark.asyncio
    async def test_admin_can_change_status_to_done(self, client):
        admin, user, problem = await self._setup_admin_and_problem()
        with patch("main.FastMail") as mock_fm:
            mock_fm.return_value.send_message = AsyncMock()
            response = await client.patch(
                f"/problems/{problem.id}/status",
                headers=_auth(admin),
                json={"status": "виконано"},
            )
        assert response.status_code == 200
        assert response.json()["status"] == "виконано"

    @pytest.mark.asyncio
    async def test_admin_can_change_status_to_rejected(self, client):
        admin, user, problem = await self._setup_admin_and_problem()
        with patch("main.FastMail") as mock_fm:
            mock_fm.return_value.send_message = AsyncMock()
            response = await client.patch(
                f"/problems/{problem.id}/status",
                headers=_auth(admin),
                json={"status": "відмовлено"},
            )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_regular_user_cannot_change_status(self, client):
        user = await _create_user_in_db()
        problem = await _create_problem_in_db(user.id)
        response = await client.patch(
            f"/problems/{problem.id}/status",
            headers=_auth(user),
            json={"status": "виконано"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_invalid_status_value(self, client):
        admin = await _create_user_in_db(username="adm4", email="adm4@x.com", is_admin=True)
        user = await _create_user_in_db(username="u4", email="u4@x.com")
        problem = await _create_problem_in_db(user.id)
        response = await client.patch(
            f"/problems/{problem.id}/status",
            headers=_auth(admin),
            json={"status": "invalid_status"},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_change_status_problem_not_found(self, client):
        admin = await _create_user_in_db(username="adm5", email="adm5@x.com", is_admin=True)
        response = await client.patch(
            "/problems/77777/status",
            headers=_auth(admin),
            json={"status": "виконано"},
        )
        assert response.status_code == 404


# ===========================================================================
# ASSIGN ADMIN  PATCH /problems/{id}/assign
# ===========================================================================
class TestAssignAdmin:
    @pytest.mark.asyncio
    async def test_admin_can_assign_self(self, client):
        admin = await _create_user_in_db(username="adm6", email="adm6@x.com", is_admin=True)
        user = await _create_user_in_db(username="u6", email="u6@x.com")
        problem = await _create_problem_in_db(user.id)
        response = await client.patch(f"/problems/{problem.id}/assign", headers=_auth(admin))
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_regular_user_cannot_assign(self, client):
        user = await _create_user_in_db()
        problem = await _create_problem_in_db(user.id)
        response = await client.patch(f"/problems/{problem.id}/assign", headers=_auth(user))
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_assign_nonexistent_problem(self, client):
        admin = await _create_user_in_db(username="adm7", email="adm7@x.com", is_admin=True)
        response = await client.patch("/problems/66666/assign", headers=_auth(admin))
        assert response.status_code == 404


# ===========================================================================
# ADMIN RESPONSE  POST /problems/response
# ===========================================================================
class TestAdminResponse:
    @pytest.mark.asyncio
    async def test_admin_can_create_response(self, client):
        admin = await _create_user_in_db(username="adm8", email="adm8@x.com", is_admin=True)
        user = await _create_user_in_db(username="u8", email="u8@x.com")
        problem = await _create_problem_in_db(user.id)
        response = await client.post(
            "/problems/response",
            headers=_auth(admin),
            json={"message": "We have reviewed your problem.", "problem_id": problem.id},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "We have reviewed your problem."
        assert data["problem_id"] == problem.id

    @pytest.mark.asyncio
    async def test_regular_user_cannot_respond(self, client):
        user = await _create_user_in_db()
        problem = await _create_problem_in_db(user.id)
        response = await client.post(
            "/problems/response",
            headers=_auth(user),
            json={"message": "hack", "problem_id": problem.id},
        )
        assert response.status_code == 403


# ===========================================================================
# SERVICE RECORD  POST /service-record
# ===========================================================================
class TestServiceRecord:
    @pytest.mark.asyncio
    async def test_admin_can_create_service_record(self, client):
        admin = await _create_user_in_db(username="adm9", email="adm9@x.com", is_admin=True)
        user = await _create_user_in_db(username="u9", email="u9@x.com")
        problem = await _create_problem_in_db(user.id)
        with patch("main.FastMail") as mock_fm:
            mock_fm.return_value.send_message = AsyncMock()
            response = await client.post(
                "/service-record",
                headers=_auth(admin),
                json={
                    "problem_id": problem.id,
                    "user_id": user.id,
                    "work_done": "Replaced motherboard",
                    "warranty_info": "6 months",
                    "used_parts": ["motherboard", "thermal paste"],
                },
            )
        assert response.status_code == 200
        data = response.json()
        assert data["work_done"] == "Replaced motherboard"
        assert data["problem_id"] == problem.id

    @pytest.mark.asyncio
    async def test_regular_user_cannot_create_service_record(self, client):
        user = await _create_user_in_db()
        problem = await _create_problem_in_db(user.id)
        response = await client.post(
            "/service-record",
            headers=_auth(user),
            json={
                "problem_id": problem.id,
                "user_id": user.id,
                "work_done": "hack",
                "warranty_info": "none",
            },
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_service_record_without_parts(self, client):
        admin = await _create_user_in_db(username="adm10", email="adm10@x.com", is_admin=True)
        user = await _create_user_in_db(username="u10", email="u10@x.com")
        problem = await _create_problem_in_db(user.id)
        with patch("main.FastMail") as mock_fm:
            mock_fm.return_value.send_message = AsyncMock()
            response = await client.post(
                "/service-record",
                headers=_auth(admin),
                json={
                    "problem_id": problem.id,
                    "user_id": user.id,
                    "work_done": "Cleaned fans",
                    "warranty_info": "None",
                },
            )
        assert response.status_code == 200


# ===========================================================================
# BLACKLISTED TOKEN (after delete)
# ===========================================================================
class TestBlacklist:
    @pytest.mark.asyncio
    async def test_deleted_user_token_is_blacklisted(self, client):
        user = await _create_user_in_db()
        token = _token_for(user)
        # Delete the user (this blacklists the token in redis)
        await client.delete("/users/me", headers={"Authorization": f"Bearer {token}"})
        # Subsequent request with same token should fail
        response = await client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401


# ===========================================================================
# EDGE CASES & SECURITY
# ===========================================================================
class TestEdgeCases:
    @pytest.mark.asyncio
    async def test_expired_token_rejected(self, client):
        # Create a token that is already expired
        expired = jwt.encode(
            {"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
            os.environ["SECRET_KEY"],
            algorithm="HS256",
        )
        response = await client.get(
            "/users/me", headers={"Authorization": f"Bearer {expired}"}
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_tampered_token_rejected(self, client):
        user = await _create_user_in_db()
        valid = _token_for(user)
        tampered = valid[:-5] + "XXXXX"
        response = await client.get(
            "/users/me", headers={"Authorization": f"Bearer {tampered}"}
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_missing_required_fields_returns_422(self, client):
        response = await client.post("/register", json={"username": "nopass"})
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_problem_missing_description(self, client):
        user = await _create_user_in_db()
        response = await client.post(
            "/problems", headers=_auth(user), data={"title": "No desc"}
        )
        assert response.status_code == 422