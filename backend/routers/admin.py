"""Master Data admin tools: reset seluruh data, backup & export database. Admin-only."""

import io
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from lib.auth import now_iso, require_admin
from lib.db import db

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

INTERNAL_COLLECTIONS = ["harga_jual", "potongan_kuli", "potongan_out", "bandul", "pembelian", "berat_koli", "kasir_prints", "penjualan", "busai", "out_records", "revisi_records"]
SNAPSHOT_COLLECTIONS = ["warehouses", "suppliers", "transactions", "users", "counters"] + INTERNAL_COLLECTIONS
RESET_COLLECTIONS = ["transactions", "warehouses", "suppliers", "counters"] + INTERNAL_COLLECTIONS + ["pembelian_drafts"]
RESTORE_COLLECTIONS = ["warehouses", "suppliers", "transactions", "counters"] + INTERNAL_COLLECTIONS


class ResetIn(BaseModel):
    confirm: str = ""


class RestoreIn(BaseModel):
    data: dict = {}


@router.post("/reset")
async def reset_data(body: ResetIn):
    if body.confirm.strip().lower() != "konfirmasi reset":
        raise HTTPException(status_code=400, detail="Ketik 'konfirmasi reset' untuk melanjutkan")
    deleted: dict[str, int] = {}
    for c in RESET_COLLECTIONS:
        res = await db[c].delete_many({})
        deleted[c] = res.deleted_count
    # Hapus semua akun kecuali admin (akses penuh).
    res_users = await db.users.delete_many({"role": {"$ne": "admin"}})
    deleted["staff_users"] = res_users.deleted_count
    return {"ok": True, "deleted": deleted}


@router.post("/restore")
async def restore_data(body: RestoreIn):
    # Terima file backup utuh ({..., data: {...}}) atau snapshot mentah.
    data = body.data or {}
    if isinstance(data.get("data"), dict):
        data = data["data"]
    restored: dict[str, int] = {}
    for c in RESTORE_COLLECTIONS:
        docs = data.get(c) or []
        await db[c].delete_many({})
        if docs:
            await db[c].insert_many([dict(d) for d in docs])
        restored[c] = len(docs)
    return {"ok": True, "restored": restored}


async def _snapshot() -> dict:
    data: dict = {}
    for c in SNAPSHOT_COLLECTIONS:
        # counters pakai _id string ("receipt") agar nomor urut tetap konsisten saat restore.
        projection = {} if c == "counters" else {"_id": 0}
        docs = await db[c].find({}, projection).to_list(100000)
        if c == "users":
            for d in docs:
                d.pop("password_hash", None)
        data[c] = docs
    return data


@router.post("/backup")
async def create_backup(user: dict = Depends(require_admin)):
    data = await _snapshot()
    counts = {k: len(v) for k, v in data.items()}
    doc = {
        "id": str(uuid.uuid4()),
        "created_at": now_iso(),
        "created_by": user.get("name", ""),
        "counts": counts,
        "data": data,
    }
    await db.backups.insert_one(dict(doc))
    return {"id": doc["id"], "created_at": doc["created_at"], "created_by": doc["created_by"], "counts": counts}


@router.get("/backups")
async def list_backups():
    return await db.backups.find({}, {"_id": 0, "data": 0}).sort("created_at", -1).to_list(500)


@router.get("/backups/{bid}/export")
async def export_backup(bid: str):
    doc = await db.backups.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Backup tidak ditemukan")
    payload = json.dumps(doc, ensure_ascii=False, indent=2).encode("utf-8")
    fname = f"twms-backup-{doc['created_at'][:10]}-{bid[:6]}.json"
    return StreamingResponse(
        io.BytesIO(payload),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
