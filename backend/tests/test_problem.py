import pytest
from httpx import AsyncClient
from models import Problem, User
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def get_auth_headers(client: AsyncClient, email: str, password: str, username: str = "user"):
    reg_resp = await client.post("/register/", json={
        "username": username,
        "email": email,
        "password": password
    })
    
    login_resp = await client.post("/login/", json={
        "email": email, 
        "password": password, 
        "username": username
    })
    
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}



@pytest.mark.asyncio
async def test_create_problem(client: AsyncClient):
    headers = await get_auth_headers(client, "creater@test.com", "password123", "creater")

    payload = {
        "title": "Broken PC",
        "description": "Blue screen of death",
        "image_url": "http://img.com/1.jpg"
    }

    response = await client.post("/problems/", json=payload, headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == payload["title"]
    assert "id" in data
    assert data["status"] == "В обробці"


@pytest.mark.asyncio
async def test_get_problems_isolation(client: AsyncClient):
    headers_a = await get_auth_headers(client, "userA@test.com", "passwordA", "userA")
    await client.post("/problems/", json={"title": "Problem A", "description": "desc"}, headers=headers_a)

    headers_b = await get_auth_headers(client, "userB@test.com", "passwordB", "userB")
    await client.post("/problems/", json={"title": "Problem B", "description": "desc"}, headers=headers_b)

    response = await client.get("/problems/", headers=headers_a)
    assert response.status_code == 200
    data = response.json()

    assert len(data) == 1
    assert data[0]["title"] == "Problem A"


@pytest.mark.asyncio
async def test_admin_can_see_all_problems(client: AsyncClient, db_session: AsyncSession):
    headers_user = await get_auth_headers(client, "user@test.com", "password123", "user")
    await client.post("/problems/", json={"title": "User Problem", "description": "d"}, headers=headers_user)

    await client.post("/register/", json={
        "username": "admin", 
        "email": "admin@test.com", 
        "password": "adminpassword"
    })
    
    result = await db_session.execute(select(User).where(User.username == "admin"))
    admin_user = result.scalar_one()
    admin_user.is_admin = True
    await db_session.commit()

    resp_login = await client.post("/login/", json={
        "email": "admin@test.com", 
        "password": "adminpassword", 
        "username": "admin"
    })
    token = resp_login.json()["access_token"]
    headers_admin = {"Authorization": f"Bearer {token}"}

    response = await client.get("/problems/", headers=headers_admin)
    assert response.status_code == 200
    data = response.json()
    
    assert len(data) >= 1
    assert data[0]["title"] == "User Problem"


@pytest.mark.asyncio
async def test_get_single_problem_permissions(client: AsyncClient):
    headers_a = await get_auth_headers(client, "userAA@t.com", "passwordAA", "userAA")
    resp_create = await client.post("/problems/", json={"title": "ProbA", "description": "d"}, headers=headers_a)
    prob_id = resp_create.json()["id"]

    headers_b = await get_auth_headers(client, "userBB@t.com", "passwordBB", "userBB")
    resp_get = await client.get(f"/problems/{prob_id}/", headers=headers_b)

    assert resp_get.status_code == 403

    resp_get_own = await client.get(f"/problems/{prob_id}/", headers=headers_a)
    assert resp_get_own.status_code == 200


@pytest.mark.asyncio
async def test_delete_problem(client: AsyncClient, db_session: AsyncSession):
    headers = await get_auth_headers(client, "del@test.com", "deletepass", "del")
    create_resp = await client.post("/problems/", json={"title": "To Delete", "description": "d"}, headers=headers)
    prob_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/problems/{prob_id}/", headers=headers)
    assert del_resp.status_code == 200
    
    deleted_prob = await db_session.get(Problem, prob_id)
    assert deleted_prob is None


@pytest.mark.asyncio
async def test_delete_foreign_problem_fails(client: AsyncClient):
    headers_a = await get_auth_headers(client, "owner@t.com", "passowner", "owner")
    resp = await client.post("/problems/", json={"title": "Mine", "description": "d"}, headers=headers_a)
    prob_id = resp.json()["id"]

    headers_b = await get_auth_headers(client, "thief@t.com", "passthief", "thief")
    del_resp = await client.delete(f"/problems/{prob_id}/", headers=headers_b)

    assert del_resp.status_code == 403