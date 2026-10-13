import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.worksheet.worksheet import Worksheet

from lib.auth import allowed_warehouses, ensure_warehouse_allowed, get_current_user, has_perm, now_iso, require_admin, require_any
from lib.db import db
from lib.receipt import TYPE_LABELS, build_receipt_pdf, receipt_number
from lib.stock import ITEM_LABELS, LEMBAR_PER_GULUNG, compute_stock, to_base_qty
from lib.xlsx import XLSX_MEDIA_TYPE, style_sheet, workbook_bytes
from routers.report import fmt, nf
from models.schemas import StockRow, StockSummary, Transaction, TxKeluarIn, TxMasukIn, TxUpdateIn

router = APIRouter(tags=["transactions"], dependencies=[Depends(get_current_user)])



async def _warehouse(wid: str) -> dict:
    wh = await db.warehouses.find_one({"id": wid}, {"_id": 0})
    if not wh:
        raise HTTPException(status_code=404, detail="Gudang tidak ditemukan")
    return wh


# ---------- Stock ----------
@router.get("/stock", response_model=StockSummary, dependencies=[Depends(require_any("stok", "masuk", "transfer", "pribadi", "gudang"))])
async def get_stock(user: dict = Depends(get_current_user)):
    stock = await compute_stock()
    whs = await db.warehouses.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    allowed = allowed_warehouses(user)
    if allowed is not None:
        whs = [w for w in whs if w["id"] in allowed]
    rows = []
    for w in whs:
        s = stock.get(w["id"], {"glangse": 0.0, "tali": 0.0, "kertas": 0.0})
        rows.append(
            StockRow(
                warehouse_id=w["id"],
                warehouse_name=w["name"],
                location=w.get("location", ""),
                glangse_lembar=s["glangse"],
                tali_kg=s["tali"],
                kertas_roll=s["kertas"],
            )
        )
    return StockSummary(
        rows=rows,
        total_glangse_lembar=round(sum(r.glangse_lembar for r in rows), 4),
        total_tali_kg=round(sum(r.tali_kg for r in rows), 4),
        total_kertas_roll=round(sum(r.kertas_roll for r in rows), 4),
    )


# ---------- Create ----------
async def _next_receipt_seq() -> int:
    from pymongo import ReturnDocument

    doc = await db.counters.find_one_and_update(
        {"_id": "receipt"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    return int(doc["seq"])


@router.post("/transactions/masuk", response_model=Transaction)
async def create_masuk(body: TxMasukIn, user: dict = Depends(require_any("masuk"))):
    ensure_warehouse_allowed(user, body.warehouse_id)
    wh = await _warehouse(body.warehouse_id)
    sup = await db.suppliers.find_one({"id": body.supplier_id}, {"_id": 0})
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier tidak ditemukan")
    base = to_base_qty(body.item, body.qty, body.unit)
    seq = await _next_receipt_seq()
    doc = {
        "id": str(uuid.uuid4()),
        "receipt_seq": seq,
        "date": body.date,
        "type": "masuk",
        "item": body.item,
        "qty": base,
        "input_qty": body.qty,
        "input_unit": body.unit,
        "warehouse_id": wh["id"],
        "warehouse_name": wh["name"],
        "target_warehouse_id": None,
        "target_warehouse_name": None,
        "supplier_id": sup["id"],
        "supplier_name": sup["name"],
        "note": body.note.strip().upper(),
        "driver_name": body.driver_name.strip().upper(),
        "vehicle_number": body.vehicle_number.strip().upper(),
        "created_by_name": user["name"],
        "created_at": now_iso(),
    }
    await db.transactions.insert_one(dict(doc))
    return Transaction(**doc)


@router.post("/transactions/keluar", response_model=Transaction)
async def create_keluar(body: TxKeluarIn, user: dict = Depends(get_current_user)):
    if not has_perm(user, body.type):
        raise HTTPException(status_code=403, detail="Anda tidak memiliki akses ke fitur ini")
    ensure_warehouse_allowed(user, body.warehouse_id)
    wh = await _warehouse(body.warehouse_id)
    target = None
    if body.type == "transfer":
        if not body.target_warehouse_id:
            raise HTTPException(status_code=400, detail="Pilih gudang tujuan transfer")
        if body.target_warehouse_id == body.warehouse_id:
            raise HTTPException(status_code=400, detail="Gudang tujuan harus berbeda dengan gudang asal")
        target = await _warehouse(body.target_warehouse_id)
    base = to_base_qty(body.item, body.qty, body.unit)
    # Stock may go negative (minus) by design — no availability check.
    seq = await _next_receipt_seq()
    doc = {
        "id": str(uuid.uuid4()),
        "receipt_seq": seq,
        "date": body.date,
        "type": body.type,
        "item": body.item,
        "qty": base,
        "input_qty": body.qty,
        "input_unit": body.unit,
        "warehouse_id": wh["id"],
        "warehouse_name": wh["name"],
        "target_warehouse_id": target["id"] if target else None,
        "target_warehouse_name": target["name"] if target else None,
        "supplier_id": None,
        "supplier_name": None,
        "note": body.note.strip().upper(),
        "driver_name": body.driver_name.strip().upper(),
        "vehicle_number": body.vehicle_number.strip().upper(),
        "created_by_name": user["name"],
        "created_at": now_iso(),
    }
    await db.transactions.insert_one(dict(doc))
    return Transaction(**doc)


# ---------- List / filter / export ----------
def _filter(
    date_from: Optional[str],
    date_to: Optional[str],
    warehouse_id: Optional[str],
    type: Optional[str],
    item: Optional[str],
    supplier_id: Optional[str],
) -> dict:
    q: dict = {}
    if date_from or date_to:
        q["date"] = {}
        if date_from:
            q["date"]["$gte"] = date_from
        if date_to:
            q["date"]["$lte"] = date_to
    if warehouse_id:
        q["$or"] = [{"warehouse_id": warehouse_id}, {"target_warehouse_id": warehouse_id}]
    if type:
        q["type"] = type
    if item:
        q["item"] = item
    if supplier_id:
        q["supplier_id"] = supplier_id
    return q


async def _query(q: dict, limit: int) -> list[dict]:
    return await db.transactions.find(q, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(limit)


@router.get("/transactions", response_model=list[Transaction], dependencies=[Depends(require_any("riwayat"))])
async def list_transactions(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    type: Optional[str] = None,
    item: Optional[str] = None,
    supplier_id: Optional[str] = None,
    limit: int = 500,
    user: dict = Depends(get_current_user),
):
    q = _filter(date_from, date_to, warehouse_id, type, item, supplier_id)
    allowed = allowed_warehouses(user)
    if allowed is not None:
        ids = list(allowed)
        q["$and"] = q.get("$and", []) + [{"$or": [{"warehouse_id": {"$in": ids}}, {"target_warehouse_id": {"$in": ids}}]}]
    docs = await _query(q, min(limit, 2000))
    return [Transaction(**d) for d in docs]


TX_HEADERS = [
    "Tanggal", "Jenis", "Barang", "Jumlah Input", "Satuan Input", "Jumlah (gulung/kg/roll)",
    "Jumlah Koli (Glangse)", "Gudang Asal / Tujuan", "Gudang Tujuan Transfer", "Supplier",
    "Nama Driver", "No. Kendaraan", "Keterangan", "Dicatat Oleh",
]


def _tx_cells(d: dict) -> list:
    is_glangse = d["item"] == "glangse"
    primary = d["qty"] / LEMBAR_PER_GULUNG if is_glangse else d["qty"]
    return [
        d["date"], TYPE_LABELS.get(d["type"], d["type"]), ITEM_LABELS[d["item"]], d["input_qty"],
        d["input_unit"], round(primary, 4), d["qty"] if is_glangse else None,
        d["warehouse_name"], d.get("target_warehouse_name") or "", d.get("supplier_name") or "",
        d.get("driver_name", ""), d.get("vehicle_number", ""),
        d.get("note", ""), d.get("created_by_name", ""),
    ]


def _write_tx_sheet(ws: Worksheet, docs: list[dict]) -> None:
    ws.title = "Riwayat Transaksi"
    ws.append(TX_HEADERS)
    for d in docs:
        ws.append(_tx_cells(d))
    style_sheet(ws)


async def _write_stock_sheet(ws: Worksheet) -> None:
    ws.append(["Gudang", "Lokasi", "Glangse (gulung)", "Glangse (koli)", "Tali Putih (kg)", "Kertas Coklat (roll)"])
    stock = await compute_stock()
    for w in await db.warehouses.find({}, {"_id": 0}).sort("name", 1).to_list(1000):
        s = stock.get(w["id"], {"glangse": 0.0, "tali": 0.0, "kertas": 0.0})
        ws.append([w["name"], w.get("location", ""), round(s["glangse"] / LEMBAR_PER_GULUNG, 4), s["glangse"], s["tali"], s["kertas"]])
    style_sheet(ws)


@router.get("/transactions/export", dependencies=[Depends(require_any("riwayat"))])
async def export_transactions(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    type: Optional[str] = None,
    item: Optional[str] = None,
    supplier_id: Optional[str] = None,
):
    docs = await _query(_filter(date_from, date_to, warehouse_id, type, item, supplier_id), 100000)
    wb = Workbook()
    _write_tx_sheet(wb.active, docs)
    await _write_stock_sheet(wb.create_sheet("Stok Per Gudang"))
    filename = f"laporan-twms-{date_from or 'awal'}-sd-{date_to or 'akhir'}.xlsx"
    return StreamingResponse(
        workbook_bytes(wb),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.put("/transactions/{tid}", response_model=Transaction)
async def update_transaction(tid: str, body: TxUpdateIn, admin: dict = Depends(require_admin)):
    t = await db.transactions.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    wh = await _warehouse(body.warehouse_id)
    base = to_base_qty(body.item, body.qty, body.unit)
    updates: dict = {
        "date": body.date,
        "item": body.item,
        "qty": base,
        "input_qty": body.qty,
        "input_unit": body.unit,
        "warehouse_id": wh["id"],
        "warehouse_name": wh["name"],
        "note": body.note.strip().upper(),
        "driver_name": body.driver_name.strip().upper(),
        "vehicle_number": body.vehicle_number.strip().upper(),
        "edited_by_name": admin["name"],
        "edited_at": now_iso(),
    }
    if t["type"] == "masuk":
        sup = await db.suppliers.find_one({"id": body.supplier_id or ""}, {"_id": 0})
        if not sup:
            raise HTTPException(status_code=404, detail="Supplier tidak ditemukan")
        updates.update({"supplier_id": sup["id"], "supplier_name": sup["name"]})
    elif t["type"] == "transfer":
        if not body.target_warehouse_id:
            raise HTTPException(status_code=400, detail="Pilih gudang tujuan transfer")
        if body.target_warehouse_id == body.warehouse_id:
            raise HTTPException(status_code=400, detail="Gudang tujuan harus berbeda dengan gudang asal")
        target = await _warehouse(body.target_warehouse_id)
        updates.update({"target_warehouse_id": target["id"], "target_warehouse_name": target["name"]})
    new_doc = {**t, **updates}
    await db.transactions.update_one({"id": tid}, {"$set": updates})
    return Transaction(**new_doc)


@router.delete("/transactions/{tid}", dependencies=[Depends(require_admin)])
async def delete_transaction(tid: str):
    t = await db.transactions.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    await db.transactions.delete_one({"id": tid})
    return {"ok": True}


# ---------- Tanda terima (receipt PDF) ----------
@router.get("/transactions/{tid}/receipt.pdf", dependencies=[Depends(require_any("riwayat"))])
async def transaction_receipt(tid: str):
    t = await db.transactions.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    qty_text = fmt(t["item"], t["qty"])
    input_text = f"{nf(t['input_qty'], 4)} {t['input_unit']}"
    buf = build_receipt_pdf(t, qty_text, input_text)
    return StreamingResponse(
        buf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="tanda-terima-{receipt_number(t)}.pdf"'}
    )
