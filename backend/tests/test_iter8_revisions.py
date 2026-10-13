"""Iteration 8 - verify logo_url on warehouse, MIN_PRINT_BRUTO=11 kasir status, sisa-stock busai-pref, detail-koli Total Harga, exports."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://internal-menu.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    r = s.get(f"{BASE_URL}/api/warehouses")
    assert r.status_code == 200
    whs = r.json()
    chosen = None
    for w in whs:
        wid = w["id"]
        rr = s.get(f"{BASE_URL}/api/internal/sisa-stock?wh={wid}")
        if rr.status_code == 200 and rr.json():
            chosen = wid
            break
    assert chosen, "No warehouse with data"
    s.wh = chosen  # type: ignore
    s.whs = whs  # type: ignore
    return s


# ---------- Warehouse logo_url ----------
def test_warehouse_schema_has_logo_url(sess):
    r = sess.get(f"{BASE_URL}/api/warehouses")
    assert r.status_code == 200
    for w in r.json():
        assert "logo_url" in w, f"Warehouse missing logo_url: {w}"


def test_warehouse_update_logo_url_persists(sess):
    wh_id = sess.wh  # type: ignore
    # fetch current
    cur = next(w for w in sess.whs if w["id"] == wh_id)  # type: ignore
    orig_logo = cur.get("logo_url", "")
    test_logo = "/uploads/test_logo_iter8.jpg"
    # PUT update
    body = {"name": cur["name"], "location": cur.get("location", ""), "parent_id": cur.get("parent_id"), "logo_url": test_logo}
    r = sess.put(f"{BASE_URL}/api/warehouses/{wh_id}", json=body)
    assert r.status_code == 200, r.text
    # verify persisted
    r2 = sess.get(f"{BASE_URL}/api/warehouses")
    found = next(w for w in r2.json() if w["id"] == wh_id)
    assert found["logo_url"] == test_logo
    # revert
    body["logo_url"] = orig_logo
    sess.put(f"{BASE_URL}/api/warehouses/{wh_id}", json=body)


# ---------- Kasir can_print (MIN_PRINT_BRUTO=11 or harga 0) ----------
def test_kasir_can_print_rule(sess):
    wh = sess.wh  # type: ignore
    r = sess.get(f"{BASE_URL}/api/internal/kasir", params={"wh": wh})
    assert r.status_code == 200
    notas = r.json()
    for n in notas:
        bad = any((it.get("bruto", 0) < 11.0 or (it.get("harga") or 0) <= 0) for it in n.get("items", []))
        expected_can_print = bool(n.get("items")) and not bad
        assert n["can_print"] == expected_can_print, f"nota {n['nomor_kupon']} can_print mismatch items={n['items']}"


def test_kasir_print_rejected_when_not_printable(sess):
    wh = sess.wh  # type: ignore
    r = sess.get(f"{BASE_URL}/api/internal/kasir", params={"wh": wh})
    notas = r.json()
    target = next((n for n in notas if not n["can_print"]), None)
    if not target:
        pytest.skip("No non-printable nota in this warehouse")
    pr = sess.post(f"{BASE_URL}/api/internal/kasir/print", params={"wh": wh}, json={"nomor_kupon": target["nomor_kupon"]})
    assert pr.status_code == 400


# ---------- Sisa stock busai-preferred values ----------
def test_sisa_stock_fields(sess):
    wh = sess.wh  # type: ignore
    r = sess.get(f"{BASE_URL}/api/internal/sisa-stock", params={"wh": wh})
    assert r.status_code == 200
    rows = r.json()
    assert rows
    for row in rows:
        # must expose both busai and beli so UI can prefer busai when present
        assert "bruto_beli" in row
        assert "netto_beli" in row
        assert "bruto_busai" in row
        assert "netto_busai" in row


# ---------- Detail Koli (laporan pembelian) ----------
def test_detail_koli_list_ok(sess):
    wh = sess.wh  # type: ignore
    r = sess.get(f"{BASE_URL}/api/internal/detail-koli", params={"wh": wh})
    assert r.status_code == 200
    rows = r.json()
    if rows:
        row = rows[0]
        # fields required to compute Total Harga = harga * netto in UI
        assert "harga" in row
        assert "netto" in row
        assert "bruto" in row
        assert "nomor_kupon" in row
        assert "bandul_nama" in row


# ---------- Exports ----------
def test_sisa_stock_export(sess):
    wh = sess.wh  # type: ignore
    r = sess.get(f"{BASE_URL}/api/internal/sisa-stock/export", params={"wh": wh})
    assert r.status_code == 200
    assert len(r.content) > 100
    ct = r.headers.get("content-type", "")
    assert "spreadsheet" in ct or "octet-stream" in ct or "excel" in ct


def test_detail_koli_export(sess):
    wh = sess.wh  # type: ignore
    r = sess.get(f"{BASE_URL}/api/internal/detail-koli/export", params={"wh": wh})
    assert r.status_code == 200
    assert len(r.content) > 100


# ---------- Warehouse auto-selected: internal APIs reject empty wh ----------
def test_internal_requires_wh(sess):
    r = sess.get(f"{BASE_URL}/api/internal/sisa-stock")
    # should 400/422 without wh
    assert r.status_code in (400, 422)
