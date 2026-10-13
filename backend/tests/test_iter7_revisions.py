"""Iteration 7 - verify new revision batch: pajak, MIN_PRINT_BRUTO=11, berat_lookup, exports, laporan-pembelian."""
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
    return s


# ======== Pajak ========
def test_pajak_get_default(sess):
    r = sess.get(f"{BASE_URL}/api/internal/pajak?wh={sess.wh}")
    assert r.status_code == 200
    data = r.json()
    assert "pajak_rate" in data
    assert isinstance(data["pajak_rate"], (int, float))


def test_pajak_put_persists_and_reflects_in_kasir(sess):
    # Capture original
    orig = sess.get(f"{BASE_URL}/api/internal/pajak?wh={sess.wh}").json()["pajak_rate"]
    try:
        new_rate = 0.01  # 1%
        r = sess.put(f"{BASE_URL}/api/internal/pajak?wh={sess.wh}", json={"pajak_rate": new_rate})
        assert r.status_code == 200, r.text
        # GET verifies persistence
        got = sess.get(f"{BASE_URL}/api/internal/pajak?wh={sess.wh}").json()["pajak_rate"]
        assert abs(got - new_rate) < 1e-6
        # Kasir pajak should use the new rate
        k = sess.get(f"{BASE_URL}/api/internal/kasir?wh={sess.wh}").json()
        if k:
            n = k[0]
            expected = round(n["total_harga"] * new_rate, 2)
            assert abs(n["pajak"] - expected) < 0.5, f"kasir pajak {n['pajak']} vs expected {expected}"
    finally:
        sess.put(f"{BASE_URL}/api/internal/pajak?wh={sess.wh}", json={"pajak_rate": orig})


# ======== MIN_PRINT_BRUTO = 11 ========
def test_kasir_can_print_rule_11kg(sess):
    k = sess.get(f"{BASE_URL}/api/internal/kasir?wh={sess.wh}").json()
    for nota in k:
        has_low = any((it.get("bruto") or 0) < 11 for it in nota.get("items", []))
        has_zero = any((it.get("harga") or 0) == 0 for it in nota.get("items", []))
        if has_low or has_zero:
            assert nota["can_print"] is False
        # when all items pass, can_print should be true (if any items exist)
        if nota.get("items") and not has_low and not has_zero:
            assert nota["can_print"] is True


def test_kasir_print_rejects_bad_nota(sess):
    k = sess.get(f"{BASE_URL}/api/internal/kasir?wh={sess.wh}").json()
    bad = next((n for n in k if not n.get("can_print")), None)
    if bad:
        r = sess.post(f"{BASE_URL}/api/internal/kasir/print?wh={sess.wh}", json={"nomor_kupon": bad["nomor_kupon"], "tanggal_beli": bad["tanggal_beli"]})
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"


# ======== berat_lookup ========
def test_berat_lookup_returns_bandul_keterangan(sess):
    # pick an existing nomor seri from pembelian
    pb = sess.get(f"{BASE_URL}/api/internal/pembelian?wh={sess.wh}").json()
    assert pb, "no pembelian"
    seri = pb[0]["items"][0]["nomor_seri"]
    r = sess.get(f"{BASE_URL}/api/internal/berat-koli/lookup?seri={seri}&wh={sess.wh}")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "bandul_nama" in d and "keterangan" in d
    assert d.get("in_pembelian") in (True, False)


def test_berat_list_contains_bandul_keterangan(sess):
    r = sess.get(f"{BASE_URL}/api/internal/berat-koli?wh={sess.wh}")
    assert r.status_code == 200
    rows = r.json()
    if rows:
        assert "bandul_nama" in rows[0] and "keterangan" in rows[0]


# ======== Exports ========
def test_sisa_stock_export_xlsx(sess):
    r = sess.get(f"{BASE_URL}/api/internal/sisa-stock/export?wh={sess.wh}")
    assert r.status_code == 200
    ct = r.headers.get("content-type", "")
    assert "spreadsheet" in ct or "xlsx" in ct or "octet-stream" in ct, ct
    assert len(r.content) > 100


def test_detail_koli_cc_export_xlsx(sess):
    r = sess.get(f"{BASE_URL}/api/internal/detail-koli-cc/export?wh={sess.wh}")
    assert r.status_code == 200
    ct = r.headers.get("content-type", "")
    assert "spreadsheet" in ct or "xlsx" in ct or "octet-stream" in ct, ct
    assert len(r.content) > 100


# ======== Laporan Pembelian endpoint still accessible ========
def test_detail_koli_endpoint(sess):
    r = sess.get(f"{BASE_URL}/api/internal/detail-koli?wh={sess.wh}")
    assert r.status_code == 200
