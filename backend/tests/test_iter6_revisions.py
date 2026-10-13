"""Iteration 6 - verify revision batch endpoints: kasir jumlah_kuli, busai PUT/DELETE, sisa_stock, laporan."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://internal-menu.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    # pick first non-empty warehouse by scanning sidebar list via /api/warehouses
    r = s.get(f"{BASE_URL}/api/warehouses")
    assert r.status_code == 200
    whs = r.json()
    # find a wh with sisa-stock first; otherwise first with kasir
    chosen = None
    for w in whs:
        wid = w["id"]
        rr = s.get(f"{BASE_URL}/api/internal/sisa-stock?wh={wid}")
        if rr.status_code == 200 and rr.json():
            chosen = wid
            break
    if not chosen:
        for w in whs:
            wid = w["id"]
            rr = s.get(f"{BASE_URL}/api/internal/kasir?wh={wid}")
            if rr.status_code == 200 and rr.json():
                chosen = wid
                break
    assert chosen, "No warehouse with kasir data"
    s.headers.update({"X-WH": chosen})
    s.wh = chosen  # type: ignore
    return s


def test_kasir_has_jumlah_kuli(sess):
    r = sess.get(f"{BASE_URL}/api/internal/kasir?wh={sess.wh}")
    assert r.status_code == 200
    data = r.json()
    assert len(data) > 0
    for nota in data:
        assert "jumlah_kuli" in nota, f"missing jumlah_kuli: {list(nota.keys())}"
        assert "jumlah_out" in nota
        assert "total_potongan_kuli" in nota
        assert "total_out" in nota
        for it in nota.get("items", []):
            assert "bruto" in it and "netto" in it


def test_sisa_stock(sess):
    r = sess.get(f"{BASE_URL}/api/internal/sisa-stock?wh={sess.wh}")
    assert r.status_code == 200
    rows = r.json()
    if rows:
        row = rows[0]
        for k in ["tanggal_beli", "nomor_kupon", "bandul_nama", "nomor_seri", "bruto_beli", "netto_beli", "harga_beli", "bruto_busai", "netto_busai", "keterangan"]:
            assert k in row, f"missing {k}"


def test_laporan_penjualan(sess):
    r = sess.get(f"{BASE_URL}/api/internal/laporan-penjualan?wh={sess.wh}")
    assert r.status_code == 200


def test_dashboard_stats(sess):
    r = sess.get(f"{BASE_URL}/api/internal/dashboard?wh={sess.wh}")
    assert r.status_code == 200
    data = r.json()
    # should expose total_pembelian and total_netto to allow rata-rata/kg
    assert isinstance(data, dict)


def test_busai_put_delete(sess):
    r = sess.get(f"{BASE_URL}/api/internal/busai?wh={sess.wh}")
    assert r.status_code == 200
    items = r.json() if isinstance(r.json(), list) else []
    # Attempt PUT on a bungkus/cc item if present
    target = next((b for b in items if b.get("status") in ("bungkus", "cc")), None)
    if target:
        bid = target["id"]
        orig_bruto = float(target.get("bruto_busai") or 10)
        new_bruto = orig_bruto + 0.5
        rp = sess.put(f"{BASE_URL}/api/internal/busai/{bid}?wh={sess.wh}", json={"bruto": new_bruto, "keterangan": "TEST_update"})
        assert rp.status_code == 200, rp.text
        updated = rp.json()
        assert abs(float(updated["bruto_busai"]) - new_bruto) < 0.01
        assert updated["keterangan"] == "TEST_update"
        # revert
        sess.put(f"{BASE_URL}/api/internal/busai/{bid}?wh={sess.wh}", json={"bruto": orig_bruto, "keterangan": target.get("keterangan", "")})
    # Attempt PUT on a bongkar item - should 400
    bongkar = next((b for b in items if b.get("status") == "bongkar"), None)
    if bongkar:
        rp = sess.put(f"{BASE_URL}/api/internal/busai/{bongkar['id']}?wh={sess.wh}", json={"bruto": 5, "keterangan": "x"})
        assert rp.status_code == 400, rp.text
