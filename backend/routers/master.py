"""Warehouses (gudang) and suppliers. Read for every logged-in user; writes gated by per-user permission
(supplier create also allowed with 'masuk', for the inline add in Barang Masuk)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import allowed_warehouses, get_current_user, now_iso, require_admin, require_any
from lib.db import db
from lib.dates import today_iso
from models.schemas import Supplier, SupplierIn, TodayOut, Warehouse, WarehouseIn

router = APIRouter(tags=["master"], dependencies=[Depends(get_current_user)])


@router.get("/meta/today", response_model=TodayOut)
async def today():
    return TodayOut(today=today_iso("Asia/Jakarta"))


# ---------- Gudang ----------
@router.get("/warehouses", response_model=list[Warehouse])
async def list_warehouses(user: dict = Depends(get_current_user)):
    docs = await db.warehouses.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    allowed = allowed_warehouses(user)
    if allowed is not None:
        docs = [d for d in docs if d["id"] in allowed]
    return [Warehouse(**d) for d in docs]


async def _validate_parent(parent_id: str | None, self_id: str | None) -> str | None:
    if not parent_id:
        return None
    if parent_id == self_id:
        raise HTTPException(status_code=400, detail="Gudang tidak bisa menginduk ke dirinya sendiri")
    parent = await db.warehouses.find_one({"id": parent_id})
    if not parent:
        raise HTTPException(status_code=404, detail="Gudang induk tidak ditemukan")
    if parent.get("parent_id"):
        raise HTTPException(status_code=400, detail="Ranting hanya bisa menginduk ke gudang utama, bukan ke ranting lain")
    if self_id and await db.warehouses.find_one({"parent_id": self_id}):
        raise HTTPException(status_code=400, detail="Gudang ini masih punya ranting, sehingga tidak bisa dijadikan ranting")
    return parent_id


@router.post("/warehouses", response_model=Warehouse, dependencies=[Depends(require_any("gudang"))])
async def create_warehouse(body: WarehouseIn):
    name = body.name.strip().upper()
    if await db.warehouses.find_one({"name": name}):
        raise HTTPException(status_code=409, detail="Nama gudang sudah ada")
    parent_id = await _validate_parent(body.parent_id, None)
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "location": body.location.strip().upper(),
        "parent_id": parent_id,
        "logo_url": (body.logo_url or "").strip(),
        "created_at": now_iso(),
    }
    await db.warehouses.insert_one(dict(doc))
    return Warehouse(**doc)


@router.put("/warehouses/{wid}", response_model=Warehouse, dependencies=[Depends(require_any("gudang"))])
async def update_warehouse(wid: str, body: WarehouseIn):
    wh = await db.warehouses.find_one({"id": wid}, {"_id": 0})
    if not wh:
        raise HTTPException(status_code=404, detail="Gudang tidak ditemukan")
    name = body.name.strip().upper()
    if await db.warehouses.find_one({"name": name, "id": {"$ne": wid}}):
        raise HTTPException(status_code=409, detail="Nama gudang sudah ada")
    parent_id = await _validate_parent(body.parent_id, wid)
    updates = {"name": name, "location": body.location.strip().upper(), "parent_id": parent_id}
    if body.logo_url is not None:
        updates["logo_url"] = body.logo_url.strip()
    await db.warehouses.update_one({"id": wid}, {"$set": updates})
    await db.transactions.update_many({"warehouse_id": wid}, {"$set": {"warehouse_name": name}})
    await db.transactions.update_many({"target_warehouse_id": wid}, {"$set": {"target_warehouse_name": name}})
    wh.update(updates)
    return Warehouse(**wh)


@router.delete("/warehouses/{wid}", dependencies=[Depends(require_any("gudang"))])
async def delete_warehouse(wid: str):
    wh = await db.warehouses.find_one({"id": wid})
    if not wh:
        raise HTTPException(status_code=404, detail="Gudang tidak ditemukan")
    # Cascade: hapus gudang ini beserta seluruh rantingnya, dan semua transaksi yang terkait.
    ranting = await db.warehouses.find({"parent_id": wid}, {"_id": 0, "id": 1}).to_list(1000)
    ids = [wid] + [r["id"] for r in ranting]
    tx_res = await db.transactions.delete_many(
        {"$or": [{"warehouse_id": {"$in": ids}}, {"target_warehouse_id": {"$in": ids}}]}
    )
    wh_res = await db.warehouses.delete_many({"id": {"$in": ids}})
    return {"ok": True, "deleted_warehouses": wh_res.deleted_count, "deleted_transactions": tx_res.deleted_count}


# ---------- Supplier ----------
@router.get("/suppliers", response_model=list[Supplier])
async def list_suppliers():
    docs = await db.suppliers.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return [Supplier(**d) for d in docs]


@router.post("/suppliers", response_model=Supplier, dependencies=[Depends(require_any("masuk", "supplier"))])
async def create_supplier(body: SupplierIn):
    name = body.name.strip().upper()
    if await db.suppliers.find_one({"name": name}):
        raise HTTPException(status_code=409, detail="Nama supplier sudah ada")
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "phone": body.phone.strip(),
        "address": body.address.strip().upper(),
        "created_at": now_iso(),
    }
    await db.suppliers.insert_one(dict(doc))
    return Supplier(**doc)


@router.put("/suppliers/{sid}", response_model=Supplier, dependencies=[Depends(require_any("supplier"))])
async def update_supplier(sid: str, body: SupplierIn):
    sup = await db.suppliers.find_one({"id": sid}, {"_id": 0})
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier tidak ditemukan")
    name = body.name.strip().upper()
    if await db.suppliers.find_one({"name": name, "id": {"$ne": sid}}):
        raise HTTPException(status_code=409, detail="Nama supplier sudah ada")
    updates = {"name": name, "phone": body.phone.strip(), "address": body.address.strip().upper()}
    await db.suppliers.update_one({"id": sid}, {"$set": updates})
    await db.transactions.update_many({"supplier_id": sid}, {"$set": {"supplier_name": name}})
    sup.update(updates)
    return Supplier(**sup)


@router.delete("/suppliers/{sid}", dependencies=[Depends(require_admin)])
async def delete_supplier(sid: str):
    sup = await db.suppliers.find_one({"id": sid})
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier tidak ditemukan")
    # Cascade: hapus supplier beserta seluruh transaksi yang berasal dari supplier ini.
    tx_res = await db.transactions.delete_many({"supplier_id": sid})
    await db.suppliers.delete_one({"id": sid})
    return {"ok": True, "deleted_transactions": tx_res.deleted_count}
