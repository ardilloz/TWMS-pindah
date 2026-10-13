"""Criterion: Riwayat Transaksi - print a tanda terima (receipt) PDF per transaction.

Creates a ZTEST warehouse + supplier, records a "masuk" transaction, then fetches
/api/transactions/{id}/receipt.pdf and asserts a one-page PDF is returned with the expected
title and signature labels embedded. Also checks 404 for an unknown id and 401 without login.
Cleans up the transaction, warehouse and supplier afterward.
"""
import uuid

import io

import httpx
from pypdf import PdfReader

from .conftest import API_URL, make_client

SUFFIX = uuid.uuid4().hex[:8]
WH_NAME = f"TSCHECK Receipt WH {SUFFIX}"
SUP_NAME = f"ZTEST Receipt Supplier {SUFFIX}"


def test_receipt_pdf_generated_for_masuk_transaction(admin_client):
    wh = admin_client.post("/warehouses", json={"name": WH_NAME, "location": "", "parent_id": None})
    assert wh.status_code == 200, f"create warehouse failed: {wh.status_code} {wh.text}"
    wh_id = wh.json()["id"]

    sup = admin_client.post("/suppliers", json={"name": SUP_NAME})
    assert sup.status_code == 200, f"create supplier failed: {sup.status_code} {sup.text}"
    sup_id = sup.json()["id"]

    tx_id = None
    try:
        today = admin_client.get("/meta/today")
        assert today.status_code == 200
        date = today.json()["today"]

        resp = admin_client.post(
            "/transactions/masuk",
            json={
                "date": date,
                "warehouse_id": wh_id,
                "supplier_id": sup_id,
                "item": "glangse",
                "qty": 2,
                "unit": "gulung",
                "note": "tscheck receipt pdf",
            },
        )
        assert resp.status_code == 200, f"create masuk tx failed: {resp.status_code} {resp.text}"
        tx_id = resp.json()["id"]

        pdf = admin_client.get(f"/transactions/{tx_id}/receipt.pdf")
        assert pdf.status_code == 200, f"receipt pdf failed: {pdf.status_code} {pdf.text[:300]}"
        assert pdf.headers["content-type"] == "application/pdf"
        body = pdf.content
        assert body[:4] == b"%PDF", "response is not a PDF"
        reader = PdfReader(io.BytesIO(body))
        assert len(reader.pages) == 1, f"expected 1-page receipt, got {len(reader.pages)}"
        text = reader.pages[0].extract_text() or ""
        assert "TANDA TERIMA BARANG" in text, text[:300]
        assert "Pengirim" in text, text[:300]
        assert "Penerima" in text, text[:300]

        missing = admin_client.get("/transactions/doesnotexist123/receipt.pdf")
        assert missing.status_code == 404, f"unknown id should 404: {missing.status_code}"

        with httpx.Client(base_url=API_URL, timeout=30.0) as anon:
            unauth = anon.get(f"/transactions/{tx_id}/receipt.pdf")
            assert unauth.status_code == 401, f"no-login should 401: {unauth.status_code}"
    finally:
        if tx_id:
            admin_client.delete(f"/transactions/{tx_id}")
        admin_client.delete(f"/warehouses/{wh_id}")
        admin_client.delete(f"/suppliers/{sup_id}")
