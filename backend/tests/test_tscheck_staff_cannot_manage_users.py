"""Criterion: Hanya admin yang bisa reset password staff.

Staff accounts must not have access to GET/PATCH /users (403), confirming only admins can
manage accounts (including password resets). Also verifies admin CAN reset a staff password
and the staff can then log in with the new password (old one fails).
"""
import uuid

from .conftest import make_client

SUFFIX = uuid.uuid4().hex[:8]
STAFF_USERNAME = f"tscheck-staffpw-{SUFFIX}"
STAFF_NAME = f"TSCHECK Staff PW {SUFFIX}"


def test_staff_cannot_access_users_and_admin_can_reset_password(admin_client):
    create = admin_client.post(
        "/users",
        json={
            "username": STAFF_USERNAME,
            "name": STAFF_NAME,
            "password": "oldpass1",
            "role": "staff",
            "permissions": ["masuk"],
        },
    )
    assert create.status_code == 200, f"create staff failed: {create.status_code} {create.text}"
    staff_id = create.json()["id"]

    try:
        # staff cannot list/patch users (403)
        with make_client() as sc:
            login = sc.post("/auth/login", json={"username": STAFF_USERNAME, "password": "oldpass1"})
            assert login.status_code == 200, f"staff login failed: {login.status_code} {login.text}"
            list_resp = sc.get("/users")
            assert list_resp.status_code == 403, f"expected 403 for staff GET /users, got {list_resp.status_code}"
            patch_resp = sc.patch(f"/users/{staff_id}", json={"name": "Hacked Name"})
            assert patch_resp.status_code == 403, f"expected 403 for staff PATCH /users, got {patch_resp.status_code}"

        # admin resets staff password
        reset = admin_client.patch(f"/users/{staff_id}", json={"password": "newpass1"})
        assert reset.status_code == 200, f"admin reset password failed: {reset.status_code} {reset.text}"

        # old password now fails, new password works
        with make_client() as c2:
            old_login = c2.post("/auth/login", json={"username": STAFF_USERNAME, "password": "oldpass1"})
            assert old_login.status_code == 401, f"expected old password to fail, got {old_login.status_code}"
        with make_client() as c3:
            new_login = c3.post("/auth/login", json={"username": STAFF_USERNAME, "password": "newpass1"})
            assert new_login.status_code == 200, f"new password login failed: {new_login.status_code} {new_login.text}"
    finally:
        admin_client.delete(f"/users/{staff_id}")
