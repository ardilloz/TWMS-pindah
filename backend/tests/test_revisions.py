"""Backend tests for TWMS revisions: driver/vehicle, cascade delete, per-warehouse access, koli unit."""
import os
import uuid
import httpx
import pytest

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API = f"{BACKEND_URL}/api"


def _admin():
    c = httpx.Client(base_url=API, timeout=30.0)
    r = c.post("/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture(scope="module")
def admin():
    c = _admin()
    yield c
    c.close()


@pytest.fixture(scope="module")
def warehouses(admin):
    created = []
    for name in ("TEST_WH_A", "TEST_WH_B"):
        r = admin.post("/warehouses", json={"name": name, "location": "loc"})
        assert r.status_code == 200, r.text
        created.append(r.json())
    yield created
    # cleanup
    for w in created:
        admin.delete(f"/warehouses/{w['id']}")


@pytest.fixture(scope="module")
def supplier(admin):
    name = f"TEST_SUP_{uuid.uuid4().hex[:6]}"
    r = admin.post("/suppliers", json={"name": name})
    assert r.status_code == 200, r.text
    sup = r.json()
    yield sup
    admin.delete(f"/suppliers/{sup['id']}")


# -------- Driver/vehicle on masuk + receipt PDF --------
def test_masuk_stores_driver_and_vehicle_and_pdf(admin, warehouses, supplier):
    wh = warehouses[0]
    payload = {
        "date": "2026-01-15",
        "supplier_id": supplier["id"],
        "warehouse_id": wh["id"],
        "item": "glangse",
        "qty": 10,
        "unit": "koli",
        "note": "test",
        "driver_name": "Pak Budi",
        "vehicle_number": "N 1234 AB",
    }
    r = admin.post("/transactions/masuk", json=payload)
    assert r.status_code == 200, r.text
    tx = r.json()
    assert tx["driver_name"] == "Pak Budi"
    assert tx["vehicle_number"] == "N 1234 AB"
    # Receipt PDF
    r2 = admin.get(f"/transactions/{tx['id']}/receipt.pdf")
    assert r2.status_code == 200
    assert r2.headers.get("content-type", "").startswith("application/pdf")
    assert r2.content[:4] == b"%PDF"
    # cleanup
    admin.delete(f"/transactions/{tx['id']}")


# -------- Driver/vehicle on keluar (transfer & pribadi) --------
@pytest.mark.parametrize("tx_type", ["transfer", "pribadi"])
def test_keluar_stores_driver_and_vehicle(admin, warehouses, tx_type):
    body = {
        "date": "2026-01-16",
        "type": tx_type,
        "warehouse_id": warehouses[0]["id"],
        "item": "tali",
        "qty": 5,
        "unit": "kg",
        "note": "",
        "driver_name": "Pak Agus",
        "vehicle_number": "L 5678 CD",
    }
    if tx_type == "transfer":
        body["target_warehouse_id"] = warehouses[1]["id"]
    r = admin.post("/transactions/keluar", json=body)
    assert r.status_code == 200, r.text
    tx = r.json()
    assert tx["driver_name"] == "Pak Agus"
    assert tx["vehicle_number"] == "L 5678 CD"
    admin.delete(f"/transactions/{tx['id']}")


# -------- Admin edit persists driver/vehicle --------
def test_admin_edit_tx_persists_driver(admin, warehouses, supplier):
    r = admin.post("/transactions/masuk", json={
        "date": "2026-01-17",
        "supplier_id": supplier["id"],
        "warehouse_id": warehouses[0]["id"],
        "item": "kertas", "qty": 2, "unit": "roll",
        "driver_name": "A", "vehicle_number": "X 1",
    })
    tx = r.json()
    r2 = admin.put(f"/transactions/{tx['id']}", json={
        "date": "2026-01-18",
        "warehouse_id": warehouses[0]["id"],
        "supplier_id": supplier["id"],
        "item": "kertas", "qty": 3, "unit": "roll",
        "note": "edited",
        "driver_name": "Pak Edit",
        "vehicle_number": "Z 9999 ZZ",
    })
    assert r2.status_code == 200, r2.text
    assert r2.json()["driver_name"] == "Pak Edit"
    assert r2.json()["vehicle_number"] == "Z 9999 ZZ"
    admin.delete(f"/transactions/{tx['id']}")


# -------- Cascade delete warehouse --------
def test_warehouse_delete_cascades_transactions(admin, supplier):
    wh = admin.post("/warehouses", json={"name": f"TEST_CASCADE_{uuid.uuid4().hex[:6]}"}).json()
    # add a ranting
    rt = admin.post("/warehouses", json={"name": f"TEST_RANTING_{uuid.uuid4().hex[:6]}", "parent_id": wh["id"]}).json()
    # create tx in both
    for w in (wh, rt):
        admin.post("/transactions/masuk", json={
            "date": "2026-01-10", "supplier_id": supplier["id"],
            "warehouse_id": w["id"], "item": "tali", "qty": 1, "unit": "kg",
        })
    r = admin.delete(f"/warehouses/{wh['id']}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["deleted_warehouses"] == 2
    assert data["deleted_transactions"] >= 2
    # verify gone
    assert admin.get("/transactions", params={"warehouse_id": wh["id"]}).json() == []


# -------- Koli unit accepted & conversion --------
def test_koli_unit_accepted_and_converted(admin, warehouses, supplier):
    r = admin.post("/transactions/masuk", json={
        "date": "2026-01-11", "supplier_id": supplier["id"],
        "warehouse_id": warehouses[0]["id"],
        "item": "glangse", "qty": 2, "unit": "koli",
    })
    assert r.status_code == 200, r.text
    tx = r.json()
    # 2 koli = 2 lembar (base)
    assert tx["input_unit"] == "koli"
    assert tx["qty"] == 2  # base lembar
    admin.delete(f"/transactions/{tx['id']}")


# -------- Per-warehouse access restriction --------
def test_per_warehouse_access_for_staff(admin, warehouses, supplier):
    uname = f"teststaff{uuid.uuid4().hex[:6]}"
    pwd = "staffpass123"
    body = {
        "username": uname, "name": "Test Staff", "password": pwd,
        "role": "staff", "permissions": ["stok", "masuk", "riwayat"],
        "warehouse_ids": [warehouses[0]["id"]],
    }
    r = admin.post("/users", json=body)
    assert r.status_code == 200, r.text
    user = r.json()
    try:
        with httpx.Client(base_url=API, timeout=30.0) as sc:
            r = sc.post("/auth/login", json={"username": uname, "password": pwd})
            assert r.status_code == 200
            # /warehouses only allowed one
            whs = sc.get("/warehouses").json()
            assert len(whs) == 1 and whs[0]["id"] == warehouses[0]["id"]
            # stock only allowed
            stock = sc.get("/stock").json()
            assert len(stock["rows"]) == 1
            assert stock["rows"][0]["warehouse_id"] == warehouses[0]["id"]
            # creating masuk into disallowed wh -> 403
            r2 = sc.post("/transactions/masuk", json={
                "date": "2026-01-12", "supplier_id": supplier["id"],
                "warehouse_id": warehouses[1]["id"],
                "item": "tali", "qty": 1, "unit": "kg",
            })
            assert r2.status_code == 403, r2.text
            # creating into allowed wh works
            r3 = sc.post("/transactions/masuk", json={
                "date": "2026-01-12", "supplier_id": supplier["id"],
                "warehouse_id": warehouses[0]["id"],
                "item": "tali", "qty": 1, "unit": "kg",
            })
            assert r3.status_code == 200, r3.text
            tid = r3.json()["id"]
            # transactions list scoped
            txs = sc.get("/transactions").json()
            assert all(
                t["warehouse_id"] == warehouses[0]["id"] or t.get("target_warehouse_id") == warehouses[0]["id"]
                for t in txs
            )
            admin.delete(f"/transactions/{tid}")
    finally:
        admin.delete(f"/users/{user['id']}")


# -------- Warehouse delete confirmation is frontend-only; backend has no check -> report-level note --------
def test_warehouse_delete_no_backend_confirmation_required(admin):
    """Confirmation ('konfirmasi' typed) is a UI-level guard; backend accepts delete directly."""
    wh = admin.post("/warehouses", json={"name": f"TEST_NOCONF_{uuid.uuid4().hex[:6]}"}).json()
    r = admin.delete(f"/warehouses/{wh['id']}")
    assert r.status_code == 200
