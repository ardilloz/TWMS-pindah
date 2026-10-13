"""Criterion: Admin bisa menambah admin baru dengan akses penuh (username & nama berbeda).

Happy path: ztest_admin creates a new admin account -> role=admin, permissions=[].
Failure cases: duplicate username (409), duplicate name case-insensitive (409).
"""
import uuid

from .conftest import make_client

SUFFIX = uuid.uuid4().hex[:8]
USERNAME = f"tscheck-admin2-{SUFFIX}"
NAME = f"TSCHECK Admin Dua {SUFFIX}"


def test_create_admin_full_access(admin_client):
    r = admin_client.post(
        "/users",
        json={"username": USERNAME, "name": NAME, "password": "secret12", "role": "admin", "permissions": []},
    )
    assert r.status_code == 200, f"create admin failed: {r.status_code} {r.text}"
    body = r.json()
    assert body["role"] == "admin"
    assert body["permissions"] == []
    assert body["username"] == USERNAME.lower()
    new_id = body["id"]

    # new admin can log in and sees full access (role=admin)
    with make_client() as c:
        login = c.post("/auth/login", json={"username": USERNAME, "password": "secret12"})
        assert login.status_code == 200, f"new admin login failed: {login.status_code} {login.text}"
        me = c.get("/auth/me")
        assert me.status_code == 200
        assert me.json()["role"] == "admin"

    try:
        # duplicate username -> 409
        dup_user = admin_client.post(
            "/users",
            json={
                "username": USERNAME,
                "name": f"TSCHECK Other Name {SUFFIX}",
                "password": "secret12",
                "role": "admin",
                "permissions": [],
            },
        )
        assert dup_user.status_code == 409, f"expected 409 for dup username, got {dup_user.status_code} {dup_user.text}"

        # duplicate name (case-insensitive) -> 409
        dup_name = admin_client.post(
            "/users",
            json={
                "username": f"tscheck-admin3-{SUFFIX}",
                "name": NAME.upper(),
                "password": "secret12",
                "role": "admin",
                "permissions": [],
            },
        )
        assert dup_name.status_code == 409, f"expected 409 for dup name, got {dup_name.status_code} {dup_name.text}"
    finally:
        admin_client.delete(f"/users/{new_id}")
