"""Criterion: Barang Keluar (transfer ke gudang lain) boleh membuat stok minus.

Creates two ZTEST warehouses (both empty), transfers Tali Putih 3.5 kg from one to the other,
and asserts the transfer succeeds (no availability check) with source stock going negative and
destination stock positive. Cleans up transactions then warehouses afterward.
"""
import uuid

SUFFIX = uuid.uuid4().hex[:8]
WH_SRC = f"TSCHECK G1 {SUFFIX}"
WH_DST = f"TSCHECK G2 {SUFFIX}"


def _stock_for(stock_json, wid):
    for row in stock_json["rows"]:
        if row["warehouse_id"] == wid:
            return row
    raise AssertionError(f"warehouse {wid} not found in /stock rows")


def test_transfer_allows_negative_stock(admin_client):
    src = admin_client.post("/warehouses", json={"name": WH_SRC, "location": "", "parent_id": None})
    assert src.status_code == 200, f"create src warehouse failed: {src.status_code} {src.text}"
    dst = admin_client.post("/warehouses", json={"name": WH_DST, "location": "", "parent_id": None})
    assert dst.status_code == 200, f"create dst warehouse failed: {dst.status_code} {dst.text}"
    src_id, dst_id = src.json()["id"], dst.json()["id"]

    tx_id = None
    try:
        today = admin_client.get("/meta/today")
        assert today.status_code == 200
        date = today.json()["today"]

        resp = admin_client.post(
            "/transactions/keluar",
            json={
                "date": date,
                "type": "transfer",
                "warehouse_id": src_id,
                "target_warehouse_id": dst_id,
                "item": "tali",
                "qty": 3.5,
                "unit": "kg",
                "note": "tscheck transfer negative stock",
            },
        )
        assert resp.status_code == 200, f"transfer should succeed (no availability check): {resp.status_code} {resp.text}"
        tx_id = resp.json()["id"]

        stock = admin_client.get("/stock")
        assert stock.status_code == 200, f"get stock failed: {stock.status_code} {stock.text}"
        sj = stock.json()
        src_row = _stock_for(sj, src_id)
        dst_row = _stock_for(sj, dst_id)
        assert src_row["tali_kg"] == -3.5, f"expected src tali -3.5, got {src_row['tali_kg']}"
        assert dst_row["tali_kg"] == 3.5, f"expected dst tali 3.5, got {dst_row['tali_kg']}"
    finally:
        if tx_id:
            admin_client.delete(f"/transactions/{tx_id}")
        admin_client.delete(f"/warehouses/{src_id}")
        admin_client.delete(f"/warehouses/{dst_id}")
