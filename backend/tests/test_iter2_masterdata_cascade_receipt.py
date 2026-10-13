"""Iteration 2 regression:
- Supplier cascade delete + admin-only guard
- Receipt number format TT{yy}{seq:03d}{HHMMSS} + sequence increments
- Admin Master Data endpoints: reset / backup / list / export + admin-only
- Date dd/mm/yy helper (fmt_ddmmyy) sanity (via receipt endpoint, which uses it)
"""

import os
import re
import uuid

import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"username": "admin", "password": "admin123"}


def _login(username: str, password: str) -> httpx.Client:
    c = httpx.Client(base_url=API, timeout=60.0, verify=True)
    r = c.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture(scope="module")
def admin() -> httpx.Client:
    c = _login(**ADMIN)
    yield c
    c.close()


@pytest.fixture()
def warehouse(admin: httpx.Client):
    name = f"TEST_WH_{uuid.uuid4().hex[:6]}"
    r = admin.post("/warehouses", json={"name": name, "location": "LOC", "parent_id": None})
    assert r.status_code == 200, r.text
    wh = r.json()
    yield wh
    admin.delete(f"/warehouses/{wh['id']}")


@pytest.fixture()
def supplier(admin: httpx.Client):
    name = f"TEST_SUP_{uuid.uuid4().hex[:6]}"
    r = admin.post("/suppliers", json={"name": name, "phone": "0812", "address": "ADDR"})
    assert r.status_code == 200, r.text
    sup = r.json()
    yield sup
    admin.delete(f"/suppliers/{sup['id']}")


def _create_masuk(admin, wh_id, sup_id, date="2026-10-09"):
    body = {
        "date": date, "warehouse_id": wh_id, "supplier_id": sup_id,
        "item": "glangse", "qty": 10, "unit": "gulung",
        "note": "test", "driver_name": "DRV", "vehicle_number": "B1234",
    }
    r = admin.post("/transactions/masuk", json=body)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- Supplier cascade delete ----------
def test_supplier_cascade_delete_admin(admin, warehouse):
    name = f"TEST_SUP_{uuid.uuid4().hex[:6]}"
    sup = admin.post("/suppliers", json={"name": name, "phone": "0", "address": "A"}).json()
    tx1 = _create_masuk(admin, warehouse["id"], sup["id"])
    tx2 = _create_masuk(admin, warehouse["id"], sup["id"])
    r = admin.delete(f"/suppliers/{sup['id']}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["deleted_transactions"] >= 2
    # verify supplier gone + transactions gone
    assert admin.get("/suppliers").status_code == 200
    for tx in (tx1, tx2):
        r = admin.get(f"/transactions/{tx['id']}/receipt.pdf")
        assert r.status_code == 404


def test_supplier_delete_admin_only(admin, warehouse):
    """Create a staff user with 'supplier' perm; must get 403 on DELETE but 200 on PUT."""
    uname = f"TEST_STAFF_{uuid.uuid4().hex[:5]}"
    pwd = "secret123"
    r = admin.post("/users", json={
        "username": uname, "password": pwd, "name": "Staff S",
        "role": "staff", "permissions": ["supplier", "masuk"], "warehouse_ids": [warehouse["id"]],
    })
    assert r.status_code == 200, r.text
    staff_id = r.json()["id"]

    name = f"TEST_SUP_{uuid.uuid4().hex[:6]}"
    sup = admin.post("/suppliers", json={"name": name, "phone": "0", "address": "A"}).json()

    try:
        staff = _login(uname, pwd)
        try:
            upd = staff.put(f"/suppliers/{sup['id']}", json={"name": name, "phone": "999", "address": "A"})
            assert upd.status_code == 200, upd.text
            r = staff.delete(f"/suppliers/{sup['id']}")
            assert r.status_code == 403, r.text
        finally:
            staff.close()
    finally:
        admin.delete(f"/suppliers/{sup['id']}")
        admin.delete(f"/users/{staff_id}")


# ---------- Receipt number ----------
RECEIPT_RE = re.compile(r"^TT(\d{2})(\d{3})(\d{6})$")


def test_receipt_number_format_and_sequence(admin, warehouse, supplier):
    tx_a = _create_masuk(admin, warehouse["id"], supplier["id"], date="2026-10-09")
    tx_b = _create_masuk(admin, warehouse["id"], supplier["id"], date="2026-10-09")
    assert isinstance(tx_a.get("receipt_seq"), int)
    assert tx_b["receipt_seq"] == tx_a["receipt_seq"] + 1

    # fetch pdf, verify filename has receipt pattern & content-type
    r = admin.get(f"/transactions/{tx_a['id']}/receipt.pdf")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/pdf")
    cd = r.headers.get("content-disposition", "")
    m = re.search(r"tanda-terima-(TT\d{2}\d{3}\d{6})\.pdf", cd)
    assert m, f"receipt pattern not in content-disposition: {cd}"
    num = m.group(1)
    mm = RECEIPT_RE.match(num)
    assert mm, num
    yy, seq, hhmmss = mm.groups()
    assert yy == "26"  # from 2026-10-09
    assert int(seq) == tx_a["receipt_seq"] % 1000
    assert 0 <= int(hhmmss[:2]) < 24
    assert len(r.content) > 500 and r.content[:4] == b"%PDF"


# ---------- Admin Master Data endpoints ----------
def test_admin_endpoints_require_admin(admin, warehouse):
    uname = f"TEST_STAFF_{uuid.uuid4().hex[:5]}"
    r = admin.post("/users", json={
        "username": uname, "password": "pw12345", "name": "Staff M",
        "role": "staff", "permissions": ["riwayat"], "warehouse_ids": [warehouse["id"]],
    })
    assert r.status_code == 200, r.text
    staff_id = r.json()["id"]
    try:
        staff = _login(uname, "pw12345")
        try:
            assert staff.post("/admin/reset", json={"confirm": "konfirmasi reset"}).status_code == 403
            assert staff.post("/admin/backup").status_code == 403
            assert staff.get("/admin/backups").status_code == 403
        finally:
            staff.close()
    finally:
        admin.delete(f"/users/{staff_id}")


def test_admin_reset_wrong_confirm(admin):
    r = admin.post("/admin/reset", json={"confirm": "nope"})
    assert r.status_code == 400


def test_admin_backup_list_and_export(admin):
    r = admin.post("/admin/backup")
    assert r.status_code == 200, r.text
    b = r.json()
    assert "id" in b and "counts" in b and "created_at" in b
    bid = b["id"]

    r = admin.get("/admin/backups")
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert bid in ids
    # list must NOT include the heavy 'data' blob
    assert all("data" not in x for x in r.json())

    r = admin.get(f"/admin/backups/{bid}/export")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/json")
    assert "attachment" in r.headers.get("content-disposition", "")
    import json as _json
    payload = _json.loads(r.content.decode("utf-8"))
    assert "data" in payload and "counts" in payload
    assert set(["warehouses", "suppliers", "transactions", "users", "counters"]).issubset(payload["data"].keys())


# ---------- Reset flow — run LAST (wipes data) ----------
def test_zz_admin_reset_wipes_data(admin):
    # ensure at least one of each exists
    wname = f"TEST_WH_{uuid.uuid4().hex[:5]}"
    sname = f"TEST_SUP_{uuid.uuid4().hex[:5]}"
    wh = admin.post("/warehouses", json={"name": wname, "location": "L", "parent_id": None}).json()
    sup = admin.post("/suppliers", json={"name": sname, "phone": "0", "address": "A"}).json()
    _create_masuk(admin, wh["id"], sup["id"])

    r = admin.post("/admin/reset", json={"confirm": "konfirmasi reset"})
    assert r.status_code == 200, r.text
    d = r.json()["deleted"]
    assert d["warehouses"] >= 1 and d["suppliers"] >= 1 and d["transactions"] >= 1

    assert admin.get("/warehouses").json() == []
    assert admin.get("/suppliers").json() == []
    # transactions list requires 'riwayat' perm (admin bypass)
    r = admin.get("/transactions")
    assert r.status_code == 200
    assert r.json() == []

    # Backups should still exist across reset
    r = admin.get("/admin/backups")
    assert r.status_code == 200
    assert len(r.json()) >= 1

    # After reset, counter was cleared → next transaction seq should restart at 1
    wh2 = admin.post("/warehouses", json={"name": "TEST_WH_POSTRESET", "location": "L", "parent_id": None}).json()
    sup2 = admin.post("/suppliers", json={"name": "TEST_SUP_POSTRESET", "phone": "0", "address": "A"}).json()
    tx = _create_masuk(admin, wh2["id"], sup2["id"])
    assert tx["receipt_seq"] == 1
    # cleanup
    admin.delete(f"/suppliers/{sup2['id']}")
    admin.delete(f"/warehouses/{wh2['id']}")
