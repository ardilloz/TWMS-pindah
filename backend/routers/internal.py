"""Internal module API — all scoped per active warehouse (?wh=<id>)."""

import asyncio
import re
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from pymongo import ReturnDocument

from lib.auth import ensure_warehouse_allowed, get_current_user, now_iso, require_any
from lib.db import db
from lib.dates import today_iso
from lib.excel import build_xlsx, read_xlsx
from lib.storage import APP_NAME, get_object, put_object
from models.internal import (
    Bandul, BandulIn, BeratKoli, BeratKoliIn, Busai, BusaiBongkarIn, BusaiBungkusIn, BusaiCCIn, BusaiUpdateIn, PajakIn,
    DashboardOut, DashboardTotals, DaySummary, DetailKoliRow, HargaJual, HargaJualIn, KasirItem, KasirNota, KodeCount,
    LaporanPenjualanRow, OutRecord, Pembelian, PembelianIn, Penjualan, PenjualanIn, Potongan, PotonganIn, PrintIn, RevisiRecord,
)

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(get_current_user)])

MIME = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif"}
PAJAK_RATE = 0.0025
MAX_BRUTO = 50.0
XLSX_MT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


async def active_wh(wh: str = Query(...), user: dict = Depends(get_current_user)) -> str:
    whdoc = await db.warehouses.find_one({"id": wh}, {"_id": 0})
    if not whdoc:
        raise HTTPException(status_code=404, detail="Gudang tidak ditemukan")
    ensure_warehouse_allowed(user, wh)
    return wh


async def wh_name(wh: str) -> str:
    doc = await db.warehouses.find_one({"id": wh}, {"_id": 0, "name": 1})
    return doc["name"] if doc else ""


def xlsx_response(data: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(iter([data]), media_type=XLSX_MT, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def serial_code(seri: str) -> str:
    m = re.match(r"^([A-Za-z]*)", (seri or "").strip())
    return (m.group(1).upper() if m and m.group(1) else "POLOS")


# Auto-pemakaian stok: 1 nomor seri pembelian = -1 koli glangse + -0,5 kg tali putih (ledger stok utama).
TALI_PER_SERI = 0.5


async def _next_receipt_seq() -> int:
    doc = await db.counters.find_one_and_update({"_id": "receipt"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    return int(doc["seq"])


async def _sync_pemakaian(wh: str, pembelian_id: str, tanggal: str, n_seri: int, user: dict) -> None:
    """(Re)generate the auto 'pribadi' (pemakaian) ledger entries for a pembelian."""
    await db.transactions.delete_many({"auto_pembelian_id": pembelian_id})
    if n_seri <= 0:
        return
    gname = await wh_name(wh)
    base = {
        "warehouse_id": wh, "warehouse_name": gname, "type": "pribadi", "date": tanggal,
        "target_warehouse_id": None, "target_warehouse_name": None, "supplier_id": None, "supplier_name": None,
        "driver_name": "", "vehicle_number": "", "note": "PEMAKAIAN OTOMATIS PEMBELIAN",
        "created_by_name": user.get("name", ""), "created_at": now_iso(), "edited_by_name": None, "edited_at": None,
        "auto_pembelian_id": pembelian_id,
    }
    glangse_seq = await _next_receipt_seq()
    await db.transactions.insert_one({**base, "id": str(uuid.uuid4()), "receipt_seq": glangse_seq, "item": "glangse", "qty": float(n_seri), "input_qty": float(n_seri), "input_unit": "koli"})
    tali_seq = await _next_receipt_seq()
    tali_qty = round(n_seri * TALI_PER_SERI, 4)
    await db.transactions.insert_one({**base, "id": str(uuid.uuid4()), "receipt_seq": tali_seq, "item": "tali", "qty": tali_qty, "input_qty": tali_qty, "input_unit": "kg"})


# ========================= Harga =========================
@router.get("/harga-jual", response_model=list[HargaJual])
async def list_harga_jual(wh: str = Depends(active_wh)):
    docs = await db.harga_jual.find({"warehouse_id": wh}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    return [HargaJual(**d) for d in docs]


@router.post("/harga-jual", response_model=HargaJual, dependencies=[Depends(require_any("harga"))])
async def create_harga_jual(body: HargaJualIn, wh: str = Depends(active_wh)):
    grade = body.grade.strip().upper()
    if await db.harga_jual.find_one({"warehouse_id": wh, "grade": grade}):
        raise HTTPException(status_code=409, detail=f"Grade {grade} sudah ada")
    doc = {"id": str(uuid.uuid4()), "warehouse_id": wh, "grade": grade, "harga": body.harga, "created_at": now_iso()}
    await db.harga_jual.insert_one(dict(doc))
    return HargaJual(**doc)


@router.put("/harga-jual/{hid}", response_model=HargaJual, dependencies=[Depends(require_any("harga"))])
async def update_harga_jual(hid: str, body: HargaJualIn, wh: str = Depends(active_wh)):
    doc = await db.harga_jual.find_one({"id": hid, "warehouse_id": wh}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Harga tidak ditemukan")
    updates = {"grade": body.grade.strip().upper(), "harga": body.harga}
    await db.harga_jual.update_one({"id": hid}, {"$set": updates})
    doc.update(updates)
    return HargaJual(**doc)


@router.delete("/harga-jual/{hid}", dependencies=[Depends(require_any("harga"))])
async def delete_harga_jual(hid: str, wh: str = Depends(active_wh)):
    await db.harga_jual.delete_one({"id": hid, "warehouse_id": wh})
    return {"ok": True}


async def _list_potongan(coll: str, wh: str) -> list[Potongan]:
    docs = await db[coll].find({"warehouse_id": wh}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    return [Potongan(**d) for d in docs]


async def _create_potongan(coll: str, body: PotonganIn, wh: str) -> Potongan:
    doc = {"id": str(uuid.uuid4()), "warehouse_id": wh, "harga": body.harga, "created_at": now_iso()}
    await db[coll].insert_one(dict(doc))
    return Potongan(**doc)


@router.get("/potongan-kuli", response_model=list[Potongan])
async def list_pk(wh: str = Depends(active_wh)):
    return await _list_potongan("potongan_kuli", wh)


@router.post("/potongan-kuli", response_model=Potongan, dependencies=[Depends(require_any("harga"))])
async def create_pk(body: PotonganIn, wh: str = Depends(active_wh)):
    return await _create_potongan("potongan_kuli", body, wh)


@router.put("/potongan-kuli/{pid}", response_model=Potongan, dependencies=[Depends(require_any("harga"))])
async def update_pk(pid: str, body: PotonganIn, wh: str = Depends(active_wh)):
    doc = await db.potongan_kuli.find_one({"id": pid, "warehouse_id": wh}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Tidak ditemukan")
    await db.potongan_kuli.update_one({"id": pid}, {"$set": {"harga": body.harga}})
    doc["harga"] = body.harga
    return Potongan(**doc)


@router.delete("/potongan-kuli/{pid}", dependencies=[Depends(require_any("harga"))])
async def delete_pk(pid: str, wh: str = Depends(active_wh)):
    await db.potongan_kuli.delete_one({"id": pid, "warehouse_id": wh})
    return {"ok": True}


@router.get("/potongan-out", response_model=list[Potongan])
async def list_po(wh: str = Depends(active_wh)):
    return await _list_potongan("potongan_out", wh)


@router.post("/potongan-out", response_model=Potongan, dependencies=[Depends(require_any("harga"))])
async def create_po(body: PotonganIn, wh: str = Depends(active_wh)):
    return await _create_potongan("potongan_out", body, wh)


@router.put("/potongan-out/{pid}", response_model=Potongan, dependencies=[Depends(require_any("harga"))])
async def update_po(pid: str, body: PotonganIn, wh: str = Depends(active_wh)):
    doc = await db.potongan_out.find_one({"id": pid, "warehouse_id": wh}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Tidak ditemukan")
    await db.potongan_out.update_one({"id": pid}, {"$set": {"harga": body.harga}})
    doc["harga"] = body.harga
    return Potongan(**doc)


@router.delete("/potongan-out/{pid}", dependencies=[Depends(require_any("harga"))])
async def delete_po(pid: str, wh: str = Depends(active_wh)):
    await db.potongan_out.delete_one({"id": pid, "warehouse_id": wh})
    return {"ok": True}


# ========================= Files / KTP =========================
@router.post("/upload/ktp", dependencies=[Depends(require_any("bandul"))])
async def upload_ktp(file: UploadFile = File(...)):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    content_type = file.content_type or MIME.get(ext, "image/jpeg")
    data = await file.read()
    path = f"{APP_NAME}/ktp/{uuid.uuid4()}.{ext}"
    result = await asyncio.to_thread(put_object, path, data, content_type)
    final_path = result["path"]
    await db.files.insert_one({"id": str(uuid.uuid4()), "storage_path": final_path, "content_type": content_type, "is_deleted": False, "created_at": now_iso()})
    return {"path": final_path}


@router.get("/files/{path:path}")
async def serve_file(path: str):
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    data, content_type = await asyncio.to_thread(get_object, path)
    return Response(content=data, media_type=rec.get("content_type") or content_type)


# ========================= Bandul =========================
@router.get("/bandul", response_model=list[Bandul])
async def list_bandul(wh: str = Depends(active_wh)):
    docs = await db.bandul.find({"warehouse_id": wh}, {"_id": 0}).sort("nama", 1).to_list(20000)
    return [Bandul(**d) for d in docs]


async def _bandul_name_exists(wh: str, nama: str, exclude: Optional[str] = None) -> bool:
    q: dict = {"warehouse_id": wh, "nama": nama}
    if exclude:
        q["id"] = {"$ne": exclude}
    return await db.bandul.find_one(q) is not None


@router.post("/bandul", response_model=Bandul, dependencies=[Depends(require_any("bandul"))])
async def create_bandul(body: BandulIn, wh: str = Depends(active_wh)):
    nama = body.nama.strip().upper()
    if await _bandul_name_exists(wh, nama):
        raise HTTPException(status_code=409, detail=f"Nama bandul '{nama}' sudah ada")
    doc = {"id": str(uuid.uuid4()), "warehouse_id": wh, "nama": nama, "alamat": (body.alamat or "").strip().upper(), "ktp_path": body.ktp_path, "created_at": now_iso()}
    await db.bandul.insert_one(dict(doc))
    return Bandul(**doc)


@router.put("/bandul/{bid}", response_model=Bandul, dependencies=[Depends(require_any("bandul"))])
async def update_bandul(bid: str, body: BandulIn, wh: str = Depends(active_wh)):
    doc = await db.bandul.find_one({"id": bid, "warehouse_id": wh}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Bandul tidak ditemukan")
    nama = body.nama.strip().upper()
    if await _bandul_name_exists(wh, nama, exclude=bid):
        raise HTTPException(status_code=409, detail=f"Nama bandul '{nama}' sudah ada")
    updates = {"nama": nama, "alamat": (body.alamat or "").strip().upper(), "ktp_path": body.ktp_path}
    await db.bandul.update_one({"id": bid}, {"$set": updates})
    await db.pembelian.update_many({"bandul_id": bid}, {"$set": {"bandul_nama": nama}})
    doc.update(updates)
    return Bandul(**doc)


@router.delete("/bandul/{bid}", dependencies=[Depends(require_any("bandul"))])
async def delete_bandul(bid: str, wh: str = Depends(active_wh)):
    await db.bandul.delete_one({"id": bid, "warehouse_id": wh})
    return {"ok": True}


# ========================= Pembelian =========================
async def _resolve_pembelian(body: PembelianIn, wh: str) -> dict:
    bandul = await db.bandul.find_one({"id": body.bandul_id, "warehouse_id": wh}, {"_id": 0}) if body.bandul_id else None
    kuli = await db.potongan_kuli.find_one({"id": body.potongan_kuli_id, "warehouse_id": wh}, {"_id": 0}) if body.potongan_kuli_id else None
    out = await db.potongan_out.find_one({"id": body.potongan_out_id, "warehouse_id": wh}, {"_id": 0}) if body.potongan_out_id else None
    items = [{"nomor_seri": i.nomor_seri.strip().upper(), "harga": i.harga, "keterangan": i.keterangan} for i in body.items if (i.nomor_seri or "").strip()]
    jumlah_seri = len(items)
    kh = float(kuli["harga"]) if kuli else 0.0
    oh = float(out["harga"]) if out else 0.0
    return {
        "bandul_id": body.bandul_id, "bandul_nama": bandul["nama"] if bandul else "",
        "potongan_kuli_id": body.potongan_kuli_id, "potongan_kuli_harga": kh,
        "potongan_out_id": body.potongan_out_id, "potongan_out_harga": oh,
        "jumlah_out": body.jumlah_out, "items": items, "jumlah_seri": jumlah_seri,
        "total_potongan_kuli": round(kh * jumlah_seri, 2), "total_out": round(oh * body.jumlah_out, 2),
        "tanggal_beli": body.tanggal_beli, "nomor_kupon": (body.nomor_kupon or "").strip().upper(),
    }


async def _check_dupes(wh: str, kupon: str, items: list[dict], exclude_id: Optional[str]):
    if kupon:
        q = {"warehouse_id": wh, "nomor_kupon": kupon}
        if exclude_id:
            q["id"] = {"$ne": exclude_id}
        if await db.pembelian.find_one(q):
            raise HTTPException(status_code=409, detail=f"Nomor kupon '{kupon}' sudah pernah diinput")
    serials = [i["nomor_seri"] for i in items]
    seen = set()
    for s in serials:
        if s in seen:
            raise HTTPException(status_code=409, detail=f"Nomor seri '{s}' ganda dalam transaksi ini")
        seen.add(s)
    if serials:
        q = {"warehouse_id": wh, "items.nomor_seri": {"$in": serials}}
        if exclude_id:
            q["id"] = {"$ne": exclude_id}
        async for other in db.pembelian.find(q, {"_id": 0, "items.nomor_seri": 1}):
            for it in other.get("items", []):
                if it["nomor_seri"] in seen:
                    raise HTTPException(status_code=409, detail=f"Nomor seri '{it['nomor_seri']}' sudah ada di pembelian lain")


@router.get("/pembelian", response_model=list[Pembelian], dependencies=[Depends(require_any("pembelian"))])
async def list_pembelian(wh: str = Depends(active_wh), date_from: Optional[str] = None, date_to: Optional[str] = None):
    q: dict = {"warehouse_id": wh}
    if date_from or date_to:
        q["tanggal_beli"] = {}
        if date_from:
            q["tanggal_beli"]["$gte"] = date_from
        if date_to:
            q["tanggal_beli"]["$lte"] = date_to
    docs = await db.pembelian.find(q, {"_id": 0}).sort([("tanggal_beli", -1), ("created_at", -1)]).to_list(20000)
    return [Pembelian(**d) for d in docs]


@router.post("/pembelian", response_model=Pembelian, dependencies=[Depends(require_any("pembelian"))])
async def create_pembelian(body: PembelianIn, wh: str = Depends(active_wh), user: dict = Depends(get_current_user)):
    refs = await _resolve_pembelian(body, wh)
    if refs["jumlah_seri"] == 0:
        raise HTTPException(status_code=400, detail="Minimal satu nomor seri harus diisi")
    await _check_dupes(wh, refs["nomor_kupon"], refs["items"], None)
    doc = {"id": str(uuid.uuid4()), "warehouse_id": wh, **refs, "created_by_name": user["name"], "created_at": now_iso(), "edited_by_name": None, "edited_at": None}
    await db.pembelian.insert_one(dict(doc))
    await _sync_pemakaian(wh, doc["id"], doc["tanggal_beli"], refs["jumlah_seri"], user)
    return Pembelian(**doc)


@router.put("/pembelian/{pid}", response_model=Pembelian, dependencies=[Depends(require_any("pembelian"))])
async def update_pembelian(pid: str, body: PembelianIn, wh: str = Depends(active_wh), user: dict = Depends(get_current_user)):
    doc = await db.pembelian.find_one({"id": pid, "warehouse_id": wh}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Pembelian tidak ditemukan")
    refs = await _resolve_pembelian(body, wh)
    if refs["jumlah_seri"] == 0:
        raise HTTPException(status_code=400, detail="Minimal satu nomor seri harus diisi")
    await _check_dupes(wh, refs["nomor_kupon"], refs["items"], exclude_id=pid)
    refs["edited_by_name"] = user["name"]
    refs["edited_at"] = now_iso()
    await db.pembelian.update_one({"id": pid}, {"$set": refs})
    doc.update(refs)
    await _sync_pemakaian(wh, pid, refs["tanggal_beli"], refs["jumlah_seri"], user)
    return Pembelian(**doc)


@router.delete("/pembelian/{pid}", dependencies=[Depends(require_any("pembelian"))])
async def delete_pembelian(pid: str, wh: str = Depends(active_wh)):
    res = await db.pembelian.delete_one({"id": pid, "warehouse_id": wh})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pembelian tidak ditemukan")
    await db.transactions.delete_many({"auto_pembelian_id": pid})
    return {"ok": True}


@router.get("/pembelian/template", dependencies=[Depends(require_any("pembelian"))])
async def pembelian_template(wh: str = Depends(active_wh)):
    headers = ["tanggal_beli", "nomor_kupon", "nama_bandul", "potongan_kuli", "potongan_out", "jumlah_out", "nomor_seri", "harga", "bruto", "netto", "keterangan"]
    example = [[today_iso("Asia/Jakarta"), "K001", "PAK BUDI", 9000, 5000, 0, "S0001", 56000, 50, 48, ""]]
    return xlsx_response(build_xlsx(headers, example, "Pembelian"), "format_pembelian.xlsx")


@router.post("/pembelian/import", dependencies=[Depends(require_any("pembelian"))])
async def pembelian_import(file: UploadFile = File(...), wh: str = Depends(active_wh), user: dict = Depends(get_current_user)):
    rows = read_xlsx(await file.read())
    if not rows:
        raise HTTPException(status_code=400, detail="File kosong")
    groups: dict[str, list[dict]] = {}
    order: list[str] = []
    for r in rows:
        kupon = str(r.get("nomor_kupon") or "").strip().upper()
        key = kupon or f"__nok__{len(order)}"
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(r)
    created = 0
    for key in order:
        grp = groups[key]
        first = grp[0]
        kupon = str(first.get("nomor_kupon") or "").strip().upper()
        if kupon and await db.pembelian.find_one({"warehouse_id": wh, "nomor_kupon": kupon}):
            raise HTTPException(status_code=409, detail=f"Nomor kupon '{kupon}' sudah ada")
        tanggal = str(first.get("tanggal_beli") or today_iso("Asia/Jakarta"))[:10]
        bandul_id = None
        bandul_nama = str(first.get("nama_bandul") or "").strip().upper()
        if bandul_nama:
            b = await db.bandul.find_one({"warehouse_id": wh, "nama": bandul_nama}, {"_id": 0})
            if not b:
                b = {"id": str(uuid.uuid4()), "warehouse_id": wh, "nama": bandul_nama, "alamat": "", "ktp_path": None, "created_at": now_iso()}
                await db.bandul.insert_one(dict(b))
            bandul_id = b["id"]
        kh = float(first.get("potongan_kuli") or 0)
        oh = float(first.get("potongan_out") or 0)
        kuli = out = None
        if kh:
            kuli = await db.potongan_kuli.find_one({"warehouse_id": wh, "harga": kh}, {"_id": 0})
            if not kuli:
                raise HTTPException(status_code=400, detail=f"Potongan kuli {int(kh)} belum ada di sistem")
        if oh:
            out = await db.potongan_out.find_one({"warehouse_id": wh, "harga": oh}, {"_id": 0})
            if not out:
                raise HTTPException(status_code=400, detail=f"Potongan out {int(oh)} belum ada di sistem")
        jumlah_out = int(float(first.get("jumlah_out") or 0))
        items = []
        weights = []
        for r in grp:
            seri = str(r.get("nomor_seri") or "").strip().upper()
            if not seri:
                continue
            items.append({"nomor_seri": seri, "harga": float(r.get("harga") or 0), "keterangan": str(r.get("keterangan") or "")})
            if r.get("bruto") not in (None, ""):
                try:
                    b = float(r.get("bruto"))
                    n = float(r.get("netto")) if r.get("netto") not in (None, "") else round(b - 2, 4)
                    weights.append((seri, b, n))
                except (TypeError, ValueError):
                    pass
        if not items:
            continue
        if len(items) > 300:
            raise HTTPException(status_code=400, detail=f"Kupon {kupon or '(tanpa kupon)'} melebihi 300 nomor seri (berisi {len(items)})")
        await _check_dupes(wh, kupon, items, None)
        doc = {
            "id": str(uuid.uuid4()), "warehouse_id": wh, "tanggal_beli": tanggal, "nomor_kupon": kupon,
            "bandul_id": bandul_id, "bandul_nama": bandul_nama,
            "potongan_kuli_id": kuli["id"] if kuli else None, "potongan_kuli_harga": kh,
            "potongan_out_id": out["id"] if out else None, "potongan_out_harga": oh,
            "jumlah_out": jumlah_out, "items": items, "jumlah_seri": len(items),
            "total_potongan_kuli": round(kh * len(items), 2), "total_out": round(oh * jumlah_out, 2),
            "created_by_name": user["name"], "created_at": now_iso(), "edited_by_name": None, "edited_at": None,
        }
        await db.pembelian.insert_one(dict(doc))
        await _sync_pemakaian(wh, doc["id"], tanggal, len(items), user)
        for seri, b, n in weights:
            await db.berat_koli.update_one(
                {"warehouse_id": wh, "nomor_seri": seri},
                {"$set": {"bruto": b, "netto": n, "edited_at": now_iso()}, "$setOnInsert": {"id": str(uuid.uuid4()), "warehouse_id": wh, "nomor_seri": seri, "created_at": now_iso()}},
                upsert=True,
            )
        created += 1
    return {"ok": True, "created": created}


async def _match_or_make_potongan(coll: str, wh: str, harga: float) -> dict:
    found = await db[coll].find_one({"warehouse_id": wh, "harga": harga}, {"_id": 0})
    if found:
        return found
    doc = {"id": str(uuid.uuid4()), "warehouse_id": wh, "harga": harga, "created_at": now_iso()}
    await db[coll].insert_one(dict(doc))
    return doc


# ========================= Berat Koli =========================
async def _serial_in_pembelian(wh: str, seri: str) -> Optional[dict]:
    return await db.pembelian.find_one({"warehouse_id": wh, "items.nomor_seri": seri}, {"_id": 0})


@router.get("/berat-koli", response_model=list[BeratKoli], dependencies=[Depends(require_any("berat_koli"))])
async def list_berat(wh: str = Depends(active_wh)):
    docs = await db.berat_koli.find({"warehouse_id": wh}, {"_id": 0}).sort("created_at", -1).to_list(20000)
    pmap: dict[str, dict] = {}
    async for p in db.pembelian.find({"warehouse_id": wh}, {"_id": 0, "bandul_nama": 1, "items.nomor_seri": 1, "items.keterangan": 1}):
        for it in p.get("items", []):
            pmap[it["nomor_seri"]] = {"bandul_nama": p.get("bandul_nama", ""), "keterangan": it.get("keterangan", "")}
    out = []
    for d in docs:
        info = pmap.get(d["nomor_seri"], {})
        out.append(BeratKoli(**d, bandul_nama=info.get("bandul_nama", ""), keterangan=info.get("keterangan", "")))
    return out


@router.get("/berat-koli/lookup", dependencies=[Depends(require_any("berat_koli"))])
async def berat_lookup(seri: str, wh: str = Depends(active_wh)):
    s = seri.strip().upper()
    existing = await db.berat_koli.find_one({"warehouse_id": wh, "nomor_seri": s}, {"_id": 0})
    p = await _serial_in_pembelian(wh, s)
    in_beli = existing is not None or p is not None
    bandul_nama, keterangan = "", ""
    if p:
        bandul_nama = p.get("bandul_nama", "")
        keterangan = next((it.get("keterangan", "") for it in p.get("items", []) if it.get("nomor_seri") == s), "")
    return {"in_pembelian": in_beli, "existing": BeratKoli(**existing).model_dump() if existing else None, "bandul_nama": bandul_nama, "keterangan": keterangan}


@router.get("/berat-koli/pending", dependencies=[Depends(require_any("berat_koli"))])
async def berat_pending(wh: str = Depends(active_wh)):
    weighed = {d["nomor_seri"] async for d in db.berat_koli.find({"warehouse_id": wh}, {"_id": 0, "nomor_seri": 1})}
    pending = []
    async for p in db.pembelian.find({"warehouse_id": wh}, {"_id": 0, "items.nomor_seri": 1, "nomor_kupon": 1, "bandul_nama": 1, "tanggal_beli": 1}):
        for it in p.get("items", []):
            if it["nomor_seri"] not in weighed:
                pending.append({"nomor_seri": it["nomor_seri"], "nomor_kupon": p.get("nomor_kupon", ""), "bandul_nama": p.get("bandul_nama", ""), "tanggal_beli": p.get("tanggal_beli", "")})
    return pending


@router.post("/berat-koli", response_model=BeratKoli, dependencies=[Depends(require_any("berat_koli"))])
async def upsert_berat(body: BeratKoliIn, wh: str = Depends(active_wh)):
    seri = body.nomor_seri.strip().upper()
    if not await _serial_in_pembelian(wh, seri):
        raise HTTPException(status_code=400, detail=f"Nomor seri '{seri}' belum ada di pembelian gudang ini")
    netto = round(body.bruto - 2, 4)
    existing = await db.berat_koli.find_one({"warehouse_id": wh, "nomor_seri": seri}, {"_id": 0})
    if existing:
        await db.berat_koli.update_one({"id": existing["id"]}, {"$set": {"bruto": body.bruto, "netto": netto, "edited_at": now_iso()}})
        existing.update({"bruto": body.bruto, "netto": netto, "edited_at": now_iso()})
        return BeratKoli(**existing)
    doc = {"id": str(uuid.uuid4()), "warehouse_id": wh, "nomor_seri": seri, "bruto": body.bruto, "netto": netto, "created_at": now_iso(), "edited_at": None}
    await db.berat_koli.insert_one(dict(doc))
    return BeratKoli(**doc)


@router.put("/berat-koli/{bid}", response_model=BeratKoli, dependencies=[Depends(require_any("berat_koli"))])
async def update_berat(bid: str, body: BeratKoliIn, wh: str = Depends(active_wh)):
    doc = await db.berat_koli.find_one({"id": bid, "warehouse_id": wh}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Data tidak ditemukan")
    updates = {"bruto": body.bruto, "netto": round(body.bruto - 2, 4), "edited_at": now_iso()}
    await db.berat_koli.update_one({"id": bid}, {"$set": updates})
    doc.update(updates)
    return BeratKoli(**doc)


@router.delete("/berat-koli/{bid}", dependencies=[Depends(require_any("berat_koli"))])
async def delete_berat(bid: str, wh: str = Depends(active_wh)):
    await db.berat_koli.delete_one({"id": bid, "warehouse_id": wh})
    return {"ok": True}


# ========================= Kasir =========================
async def _netto_map(wh: str) -> dict[str, float]:
    return {d["nomor_seri"]: float(d["netto"]) async for d in db.berat_koli.find({"warehouse_id": wh}, {"_id": 0, "nomor_seri": 1, "netto": 1})}


async def _weight_map(wh: str) -> dict[str, dict]:
    return {d["nomor_seri"]: {"bruto": float(d["bruto"]), "netto": float(d["netto"])} async for d in db.berat_koli.find({"warehouse_id": wh}, {"_id": 0, "nomor_seri": 1, "bruto": 1, "netto": 1})}


MIN_PRINT_BRUTO = 11.0


async def _pajak_rate(wh: str) -> float:
    s = await db.internal_settings.find_one({"warehouse_id": wh}, {"_id": 0, "pajak_rate": 1})
    return float(s["pajak_rate"]) if s and s.get("pajak_rate") is not None else PAJAK_RATE


@router.get("/pajak", dependencies=[Depends(require_any("harga"))])
async def get_pajak(wh: str = Depends(active_wh)):
    return {"pajak_rate": await _pajak_rate(wh)}


@router.put("/pajak", dependencies=[Depends(require_any("harga"))])
async def set_pajak(body: PajakIn, wh: str = Depends(active_wh)):
    await db.internal_settings.update_one({"warehouse_id": wh}, {"$set": {"warehouse_id": wh, "pajak_rate": body.pajak_rate}}, upsert=True)
    return {"pajak_rate": body.pajak_rate}


async def _build_notas(wh: str, date_from=None, date_to=None) -> list[KasirNota]:
    q: dict = {"warehouse_id": wh}
    if date_from or date_to:
        q["tanggal_beli"] = {}
        if date_from:
            q["tanggal_beli"]["$gte"] = date_from
        if date_to:
            q["tanggal_beli"]["$lte"] = date_to
    pembelians = await db.pembelian.find(q, {"_id": 0}).sort([("tanggal_beli", -1), ("created_at", -1)]).to_list(20000)
    weights = await _weight_map(wh)
    prints = {p["nomor_kupon"]: p async for p in db.kasir_prints.find({"warehouse_id": wh}, {"_id": 0})}
    gname = await wh_name(wh)
    groups: dict[str, dict] = {}
    for p in pembelians:
        key = p.get("nomor_kupon") or f"__id__{p['id']}"
        label = p.get("nomor_kupon") or "TANPA KUPON"
        g = groups.setdefault(key, {"nomor_kupon": key, "label": label, "tanggal_beli": p["tanggal_beli"], "bandul_names": [], "items": [], "tk": 0.0, "to": 0.0, "jo": 0, "jk": 0})
        if p["tanggal_beli"] < g["tanggal_beli"]:
            g["tanggal_beli"] = p["tanggal_beli"]
        if p.get("bandul_nama") and p["bandul_nama"] not in g["bandul_names"]:
            g["bandul_names"].append(p["bandul_nama"])
        g["tk"] += float(p.get("total_potongan_kuli") or 0)
        g["to"] += float(p.get("total_out") or 0)
        g["jo"] += int(p.get("jumlah_out") or 0)
        if float(p.get("total_potongan_kuli") or 0) > 0:
            g["jk"] += len(p.get("items", []))
        for it in p.get("items", []):
            w = weights.get(it["nomor_seri"], {"bruto": 0.0, "netto": 0.0})
            h = float(it.get("harga") or 0)
            g["items"].append(KasirItem(nomor_seri=it["nomor_seri"], harga=h, bruto=w["bruto"], netto=w["netto"], subtotal=round(h * w["netto"], 2), keterangan=it.get("keterangan", "")))
    rate = await _pajak_rate(wh)
    notas = []
    for g in groups.values():
        total = round(sum(i.subtotal for i in g["items"]), 2)
        pajak = round(total * rate, 2)
        pr = prints.get(g["nomor_kupon"])
        can_print = bool(g["items"]) and all(i.bruto >= MIN_PRINT_BRUTO and i.harga > 0 for i in g["items"])
        notas.append(KasirNota(
            nomor_kupon=g["nomor_kupon"], label=g["label"], warehouse_nama=gname, tanggal_beli=g["tanggal_beli"],
            bandul_nama=", ".join(g["bandul_names"]), items=g["items"], total_harga=total, pajak=pajak,
            total_potongan_kuli=round(g["tk"], 2), total_out=round(g["to"], 2), jumlah_out=g["jo"], jumlah_kuli=g["jk"],
            total_pembayaran=round(total - pajak - g["tk"] - g["to"], 2), can_print=can_print,
            printed_at=pr["printed_at"] if pr else None, printed_by=pr["printed_by"] if pr else None,
        ))
    return notas


@router.get("/kasir", response_model=list[KasirNota], dependencies=[Depends(require_any("kasir"))])
async def kasir_list(wh: str = Depends(active_wh), date_from: Optional[str] = None, date_to: Optional[str] = None):
    return await _build_notas(wh, date_from, date_to)


@router.post("/kasir/print", response_model=KasirNota, dependencies=[Depends(require_any("kasir"))])
async def kasir_print(body: PrintIn, wh: str = Depends(active_wh), user: dict = Depends(get_current_user)):
    target = next((n for n in await _build_notas(wh) if n.nomor_kupon == body.nomor_kupon), None)
    if not target:
        raise HTTPException(status_code=404, detail="Nota tidak ditemukan")
    if not target.can_print:
        raise HTTPException(status_code=400, detail="Tidak bisa dicetak: ada nomor seri dengan bruto < 11 kg atau harga 0")
    await db.kasir_prints.update_one({"warehouse_id": wh, "nomor_kupon": body.nomor_kupon}, {"$set": {"warehouse_id": wh, "nomor_kupon": body.nomor_kupon, "printed_at": now_iso(), "printed_by": user["name"]}}, upsert=True)
    return next((n for n in await _build_notas(wh) if n.nomor_kupon == body.nomor_kupon), target)


# ========================= Detail Koli =========================
async def _detail_rows(wh: str, date_from, date_to, q_seri, q_kupon, q_bandul) -> list[DetailKoliRow]:
    q: dict = {"warehouse_id": wh}
    if date_from or date_to:
        q["tanggal_beli"] = {}
        if date_from:
            q["tanggal_beli"]["$gte"] = date_from
        if date_to:
            q["tanggal_beli"]["$lte"] = date_to
    if q_kupon:
        q["nomor_kupon"] = {"$regex": re.escape(q_kupon.strip()), "$options": "i"}
    if q_bandul:
        q["bandul_nama"] = {"$regex": re.escape(q_bandul.strip()), "$options": "i"}
    pembelians = await db.pembelian.find(q, {"_id": 0}).sort([("tanggal_beli", -1), ("created_at", -1)]).to_list(20000)
    bmap = {d["nomor_seri"]: d async for d in db.berat_koli.find({"warehouse_id": wh}, {"_id": 0})}
    sf = (q_seri or "").strip().lower()
    rows = []
    for p in pembelians:
        for it in p.get("items", []):
            seri = it["nomor_seri"]
            if sf and sf not in seri.lower():
                continue
            bk = bmap.get(seri)
            rows.append(DetailKoliRow(tanggal_beli=p["tanggal_beli"], nomor_kupon=p.get("nomor_kupon", ""), bandul_nama=p.get("bandul_nama", ""), nomor_seri=seri, harga=float(it.get("harga") or 0), bruto=bk["bruto"] if bk else None, netto=bk["netto"] if bk else None, keterangan=it.get("keterangan", "")))
    return rows


@router.get("/detail-koli", response_model=list[DetailKoliRow], dependencies=[Depends(require_any("detail_koli"))])
async def detail_koli(wh: str = Depends(active_wh), date_from: Optional[str] = None, date_to: Optional[str] = None, q_seri: Optional[str] = None, q_kupon: Optional[str] = None, q_bandul: Optional[str] = None):
    return await _detail_rows(wh, date_from, date_to, q_seri, q_kupon, q_bandul)


@router.get("/detail-koli/export", dependencies=[Depends(require_any("detail_koli"))])
async def detail_koli_export(wh: str = Depends(active_wh), date_from: Optional[str] = None, date_to: Optional[str] = None, q_seri: Optional[str] = None, q_kupon: Optional[str] = None, q_bandul: Optional[str] = None):
    rows = await _detail_rows(wh, date_from, date_to, q_seri, q_kupon, q_bandul)
    headers = ["Tanggal Beli", "Nomor Kupon", "Bandul", "Nomor Seri", "Harga/kg", "Total Harga", "Bruto", "Netto", "Keterangan"]
    data = [[r.tanggal_beli, r.nomor_kupon, r.bandul_nama, r.nomor_seri, r.harga, round((r.harga or 0) * (r.netto or 0), 2), r.bruto, r.netto, r.keterangan] for r in rows]
    return xlsx_response(build_xlsx(headers, data, "Laporan Pembelian"), "laporan_pembelian.xlsx")


# ========================= Dashboard =========================
@router.get("/dashboard", response_model=DashboardOut, dependencies=[Depends(require_any("dashboard"))])
async def dashboard(wh: str = Depends(active_wh), date_from: Optional[str] = None, date_to: Optional[str] = None):
    today = today_iso("Asia/Jakarta")
    df = date_from or today
    dt = date_to or today
    weights = await _weight_map(wh)
    rate = await _pajak_rate(wh)
    pembelians = await db.pembelian.find({"warehouse_id": wh, "tanggal_beli": {"$gte": df, "$lte": dt}}, {"_id": 0}).to_list(20000)
    days: dict[str, dict] = {}
    kode: dict[str, int] = {}
    for p in pembelians:
        d = p["tanggal_beli"]
        a = days.setdefault(d, {"trx": 0, "koli": 0, "bruto": 0.0, "netto": 0.0, "harga": 0.0, "tk": 0.0, "to": 0.0})
        a["trx"] += 1
        a["koli"] += len(p.get("items", []))
        a["tk"] += float(p.get("total_potongan_kuli") or 0)
        a["to"] += float(p.get("total_out") or 0)
        for it in p.get("items", []):
            w = weights.get(it["nomor_seri"], {"bruto": 0.0, "netto": 0.0})
            a["bruto"] += w["bruto"]
            a["netto"] += w["netto"]
            a["harga"] += float(it.get("harga") or 0) * w["netto"]
            kode[serial_code(it["nomor_seri"])] = kode.get(serial_code(it["nomor_seri"]), 0) + 1
    out_days = []
    tot = {"koli": 0, "bruto": 0.0, "netto": 0.0, "beli": 0.0, "pajak": 0.0, "tk": 0.0, "to": 0.0, "bayar": 0.0}
    for d in sorted(days.keys(), reverse=True):
        a = days[d]
        total = round(a["harga"], 2)
        pajak = round(total * rate, 2)
        bayar = round(total - pajak - a["tk"] - a["to"], 2)
        out_days.append(DaySummary(tanggal=d, jumlah_transaksi=a["trx"], jumlah_koli=a["koli"], total_bruto=round(a["bruto"], 2), total_netto=round(a["netto"], 2), total_pembelian=total, total_pajak=pajak, total_kuli=round(a["tk"], 2), total_out=round(a["to"], 2), total_pembayaran=bayar))
        tot["koli"] += a["koli"]; tot["bruto"] += a["bruto"]; tot["netto"] += a["netto"]; tot["beli"] += total; tot["pajak"] += pajak; tot["tk"] += a["tk"]; tot["to"] += a["to"]; tot["bayar"] += bayar
    kode_list = [KodeCount(kode=k, jumlah=v) for k, v in sorted(kode.items(), key=lambda x: (-x[1], x[0]))]
    totals = DashboardTotals(jumlah_koli=tot["koli"], total_bruto=round(tot["bruto"], 2), total_netto=round(tot["netto"], 2), total_pembelian=round(tot["beli"], 2), total_pajak=round(tot["pajak"], 2), total_kuli=round(tot["tk"], 2), total_out=round(tot["to"], 2), total_pembayaran=round(tot["bayar"], 2))
    return DashboardOut(date_from=df, date_to=dt, days=out_days, kode=kode_list, totals=totals)


# ========================= Busai =========================
async def _serial_sold(wh: str, seri: str, exclude_id: Optional[str] = None) -> bool:
    q: dict = {"warehouse_id": wh, "items.nomor_seri": seri}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    return await db.penjualan.find_one(q, {"_id": 0, "id": 1}) is not None


async def _purchase_snapshot(wh: str, seri: str) -> dict:
    p = await _serial_in_pembelian(wh, seri)
    bk = await db.berat_koli.find_one({"warehouse_id": wh, "nomor_seri": seri}, {"_id": 0})
    item = next((i for i in (p.get("items", []) if p else []) if i["nomor_seri"] == seri), {}) if p else {}
    return {"tanggal_beli": p["tanggal_beli"] if p else "", "bandul_nama": p.get("bandul_nama", "") if p else "", "harga_beli": float(item.get("harga") or 0), "bruto_beli": bk["bruto"] if bk else None, "netto_beli": bk["netto"] if bk else None, "keterangan_beli": item.get("keterangan", "") if item else ""}


@router.get("/busai", response_model=list[Busai], dependencies=[Depends(require_any("busai"))])
async def list_busai(wh: str = Depends(active_wh)):
    docs = await db.busai.find({"warehouse_id": wh}, {"_id": 0}).sort("created_at", -1).to_list(20000)
    return [Busai(**d) for d in docs]


@router.get("/busai/info", dependencies=[Depends(require_any("busai"))])
async def busai_info(seri: str, wh: str = Depends(active_wh)):
    s = seri.strip().upper()
    p = await _serial_in_pembelian(wh, s)
    if not p:
        raise HTTPException(status_code=404, detail=f"Nomor seri '{s}' belum ada di pembelian")
    if await _serial_sold(wh, s):
        raise HTTPException(status_code=400, detail=f"Nomor seri '{s}' sudah terjual, tidak bisa dibongkar")
    existing = await db.busai.find_one({"warehouse_id": wh, "nomor_seri": s}, {"_id": 0})
    snap = await _purchase_snapshot(wh, s)
    return {"nomor_seri": s, **snap, "busai_status": existing["status"] if existing else None}


@router.post("/busai/bongkar", response_model=Busai, dependencies=[Depends(require_any("busai"))])
async def busai_bongkar(body: BusaiBongkarIn, wh: str = Depends(active_wh)):
    s = body.nomor_seri.strip().upper()
    if not await _serial_in_pembelian(wh, s):
        raise HTTPException(status_code=400, detail=f"Nomor seri '{s}' belum ada di pembelian")
    if await _serial_sold(wh, s):
        raise HTTPException(status_code=400, detail=f"Nomor seri '{s}' sudah terjual")
    if await db.busai.find_one({"warehouse_id": wh, "nomor_seri": s}):
        raise HTTPException(status_code=409, detail=f"Nomor seri '{s}' sudah dibongkar")
    snap = await _purchase_snapshot(wh, s)
    doc = {"id": str(uuid.uuid4()), "warehouse_id": wh, "nomor_seri": s, "status": "bongkar", "is_cc": False, "tanggal_busai": None, "bruto_busai": None, "netto_busai": None, "keterangan": "", "created_at": now_iso(), **snap}
    await db.busai.insert_one(dict(doc))
    return Busai(**doc)


@router.post("/busai/bungkus", response_model=Busai, dependencies=[Depends(require_any("busai"))])
async def busai_bungkus(body: BusaiBungkusIn, wh: str = Depends(active_wh)):
    s = body.nomor_seri.strip().upper()
    doc = await db.busai.find_one({"warehouse_id": wh, "nomor_seri": s}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Nomor seri belum dibongkar")
    updates = {"status": "bungkus", "bruto_busai": body.bruto, "netto_busai": round(body.bruto - 2, 4), "keterangan": "HASIL BUSAI", "tanggal_busai": today_iso("Asia/Jakarta")}
    await db.busai.update_one({"id": doc["id"]}, {"$set": updates})
    doc.update(updates)
    return Busai(**doc)


@router.post("/busai/cc", response_model=Busai, dependencies=[Depends(require_any("busai"))])
async def busai_cc(body: BusaiCCIn, wh: str = Depends(active_wh)):
    s = body.nomor_seri.strip().upper()
    if await db.busai.find_one({"warehouse_id": wh, "nomor_seri": s}):
        raise HTTPException(status_code=409, detail=f"Nomor seri '{s}' sudah ada")
    doc = {"id": str(uuid.uuid4()), "warehouse_id": wh, "nomor_seri": s, "status": "cc", "is_cc": True, "tanggal_beli": "", "bandul_nama": "", "harga_beli": 0, "bruto_beli": None, "netto_beli": None, "bruto_busai": body.bruto, "netto_busai": round(body.bruto - 2, 4), "keterangan": "BUSAI CC", "tanggal_busai": today_iso("Asia/Jakarta"), "created_at": now_iso()}
    await db.busai.insert_one(dict(doc))
    return Busai(**doc)


@router.delete("/busai/{bid}", dependencies=[Depends(require_any("busai"))])
async def delete_busai(bid: str, wh: str = Depends(active_wh)):
    await db.busai.delete_one({"id": bid, "warehouse_id": wh})
    return {"ok": True}


@router.put("/busai/{bid}", response_model=Busai, dependencies=[Depends(require_any("busai"))])
async def update_busai(bid: str, body: BusaiUpdateIn, wh: str = Depends(active_wh)):
    doc = await db.busai.find_one({"id": bid, "warehouse_id": wh}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Data busai tidak ditemukan")
    if doc["status"] == "bongkar":
        raise HTTPException(status_code=400, detail="Koli belum dibungkus, tidak bisa diedit")
    updates = {"bruto_busai": body.bruto, "netto_busai": round(body.bruto - 2, 4), "keterangan": body.keterangan.strip()}
    await db.busai.update_one({"id": bid}, {"$set": updates})
    doc.update(updates)
    return Busai(**doc)


async def _busai_detail_rows(wh: str, date_from=None, date_to=None, q_seri=None) -> list[dict]:
    q: dict = {"warehouse_id": wh, "status": {"$in": ["bungkus", "cc"]}}
    if date_from or date_to:
        q["tanggal_busai"] = {}
        if date_from:
            q["tanggal_busai"]["$gte"] = date_from
        if date_to:
            q["tanggal_busai"]["$lte"] = date_to
    docs = await db.busai.find(q, {"_id": 0}).sort("created_at", -1).to_list(20000)
    sf = (q_seri or "").strip().lower()
    rows = []
    for d in docs:
        if sf and sf not in d["nomor_seri"].lower():
            continue
        cc = bool(d.get("is_cc"))
        rows.append({"tanggal_busai": d.get("tanggal_busai"), "nomor_seri": d["nomor_seri"], "jenis": "BUSAI CC" if cc else "BUSAI SERI",
                     "bruto_beli": None if cc else d.get("bruto_beli"), "netto_beli": None if cc else d.get("netto_beli"),
                     "bruto_busai": d.get("bruto_busai"), "netto_busai": d.get("netto_busai"), "keterangan": d.get("keterangan", "")})
    return rows


@router.get("/detail-koli-cc", dependencies=[Depends(require_any("detail_koli_cc"))])
async def detail_koli_busai(wh: str = Depends(active_wh), date_from: Optional[str] = None, date_to: Optional[str] = None, q_seri: Optional[str] = None):
    return await _busai_detail_rows(wh, date_from, date_to, q_seri)


@router.get("/detail-koli-cc/export", dependencies=[Depends(require_any("detail_koli_cc"))])
async def detail_koli_busai_export(wh: str = Depends(active_wh), date_from: Optional[str] = None, date_to: Optional[str] = None, q_seri: Optional[str] = None):
    rows = await _busai_detail_rows(wh, date_from, date_to, q_seri)
    headers = ["Tgl Busai", "Nomor Seri", "Jenis", "Bruto Beli", "Netto Beli", "Bruto Busai", "Netto Busai", "Keterangan"]
    data = [[r["tanggal_busai"], r["nomor_seri"], r["jenis"], r["bruto_beli"], r["netto_beli"], r["bruto_busai"], r["netto_busai"], r["keterangan"]] for r in rows]
    return xlsx_response(build_xlsx(headers, data, "Detail Koli Busai"), "detail_koli_busai.xlsx")


async def _sisa_rows(wh: str, q_seri=None, q_bandul=None) -> list[dict]:
    sold = set()
    async for s in db.penjualan.find({"warehouse_id": wh}, {"_id": 0, "items.nomor_seri": 1}):
        for it in s.get("items", []):
            sold.add(it["nomor_seri"])
    weights = {d["nomor_seri"]: d async for d in db.berat_koli.find({"warehouse_id": wh}, {"_id": 0})}
    busais = {d["nomor_seri"]: d async for d in db.busai.find({"warehouse_id": wh, "status": "bungkus"}, {"_id": 0})}
    fs = (q_seri or "").strip().lower()
    fb = (q_bandul or "").strip().lower()
    rows = []
    async for p in db.pembelian.find({"warehouse_id": wh}, {"_id": 0}).sort([("tanggal_beli", -1)]):
        for it in p.get("items", []):
            seri = it["nomor_seri"]
            if seri in sold:
                continue
            if fs and fs not in seri.lower():
                continue
            if fb and fb not in (p.get("bandul_nama", "")).lower():
                continue
            bk = weights.get(seri)
            bz = busais.get(seri)
            rows.append({"tanggal_beli": p["tanggal_beli"], "nomor_kupon": p.get("nomor_kupon", ""), "bandul_nama": p.get("bandul_nama", ""), "nomor_seri": seri,
                         "harga_beli": float(it.get("harga") or 0), "bruto_beli": bk["bruto"] if bk else None, "netto_beli": bk["netto"] if bk else None,
                         "bruto_busai": bz["bruto_busai"] if bz else None, "netto_busai": bz["netto_busai"] if bz else None, "keterangan": it.get("keterangan", "")})
    return rows


@router.get("/sisa-stock", dependencies=[Depends(require_any("sisa_stock"))])
async def sisa_stock(wh: str = Depends(active_wh), q_seri: Optional[str] = None, q_bandul: Optional[str] = None):
    return await _sisa_rows(wh, q_seri, q_bandul)


@router.get("/sisa-stock/export", dependencies=[Depends(require_any("sisa_stock"))])
async def sisa_stock_export(wh: str = Depends(active_wh), q_seri: Optional[str] = None, q_bandul: Optional[str] = None):
    rows = await _sisa_rows(wh, q_seri, q_bandul)
    headers = ["Tgl Beli", "Kupon", "Bandul", "Nomor Seri", "Bruto", "Netto", "Harga Beli", "Total Harga Beli", "Bruto Busai", "Netto Busai", "Keterangan"]
    data = [[r["tanggal_beli"], r["nomor_kupon"], r["bandul_nama"], r["nomor_seri"], (r["bruto_busai"] if r["bruto_busai"] is not None else r["bruto_beli"]), (r["netto_busai"] if r["netto_busai"] is not None else r["netto_beli"]), r["harga_beli"], round(r["harga_beli"] * (r["netto_beli"] or 0), 2), r["bruto_busai"], r["netto_busai"], r["keterangan"]] for r in rows]
    return xlsx_response(build_xlsx(headers, data, "Sisa Stock"), "sisa_stock.xlsx")


# ========================= Penjualan =========================
async def _resolve_sale(wh: str, seri: str, jadi: str, grade: str, grades: dict, bruto_override=None) -> dict:
    seri = (seri or "").strip().upper()
    jadi = (jadi or "").strip().upper()
    grade = (grade or "").strip().upper()
    if not jadi:
        raise HTTPException(status_code=400, detail=f"Nomor jadi untuk seri '{seri}' wajib diisi")
    if grade not in grades:
        raise HTTPException(status_code=400, detail=f"Grade '{grade}' tidak ada di menu Harga")
    if not await _serial_in_pembelian(wh, seri):
        raise HTTPException(status_code=400, detail=f"Nomor seri '{seri}' belum ada di pembelian")
    bk = await db.berat_koli.find_one({"warehouse_id": wh, "nomor_seri": seri}, {"_id": 0})
    if not bk:
        raise HTTPException(status_code=400, detail=f"Nomor seri '{seri}' belum ada berat koli-nya")
    busai = await db.busai.find_one({"warehouse_id": wh, "nomor_seri": seri}, {"_id": 0})
    if busai and busai["status"] == "bongkar":
        raise HTTPException(status_code=400, detail=f"Nomor seri '{seri}' sedang dibongkar (belum dibungkus)")
    if bruto_override is not None:
        bruto = float(bruto_override)
    elif busai and busai.get("bruto_busai"):
        bruto = float(busai["bruto_busai"])
    else:
        bruto = float(bk["bruto"])
    if bruto <= 0 or bruto > MAX_BRUTO:
        raise HTTPException(status_code=400, detail=f"Bruto seri '{seri}' harus 0-{int(MAX_BRUTO)} kg")
    snap = await _purchase_snapshot(wh, seri)
    return {
        "nomor_seri": seri, "nomor_jadi": jadi, "bruto": bruto, "netto": round(bruto - 2, 4), "grade": grade,
        "keterangan": (busai["keterangan"] if busai and busai.get("keterangan") else snap.get("keterangan_beli", "")),
        "harga_jual": float(grades[grade]), **snap,
    }


@router.get("/penjualan", response_model=list[Penjualan], dependencies=[Depends(require_any("penjualan"))])
async def list_penjualan(wh: str = Depends(active_wh)):
    docs = await db.penjualan.find({"warehouse_id": wh}, {"_id": 0}).sort([("tanggal_jual", -1), ("created_at", -1)]).to_list(20000)
    return [Penjualan(**d) for d in docs]


async def _build_sale_items(wh: str, body: PenjualanIn, exclude_id: Optional[str] = None):
    if not body.items:
        raise HTTPException(status_code=400, detail="Minimal satu nomor seri")
    if len(body.items) > 50:
        raise HTTPException(status_code=400, detail="Maksimal 50 nomor seri per gulungan")
    grades = {g["grade"]: g["harga"] async for g in db.harga_jual.find({"warehouse_id": wh}, {"_id": 0})}
    jadis, seris, items = set(), set(), []
    for it in body.items:
        resolved = await _resolve_sale(wh, it.nomor_seri, it.nomor_jadi, it.grade, grades, it.bruto)
        jadi, seri = resolved["nomor_jadi"], resolved["nomor_seri"]
        if jadi in jadis:
            raise HTTPException(status_code=409, detail=f"Nomor jadi '{jadi}' ganda dalam input ini")
        if seri in seris:
            raise HTTPException(status_code=409, detail=f"Nomor seri '{seri}' ganda dalam input ini")
        jadis.add(jadi)
        seris.add(seri)
        jq: dict = {"warehouse_id": wh, "items.nomor_jadi": jadi}
        if exclude_id:
            jq["id"] = {"$ne": exclude_id}
        if await db.penjualan.find_one(jq):
            raise HTTPException(status_code=409, detail=f"Nomor jadi '{jadi}' sudah pernah diinput")
        if await db.out_records.find_one({"warehouse_id": wh, "nomor_jadi": jadi}):
            raise HTTPException(status_code=409, detail=f"Nomor jadi '{jadi}' sudah di-OUT, tidak bisa dipakai lagi")
        if await _serial_sold(wh, seri, exclude_id):
            raise HTTPException(status_code=409, detail=f"Nomor seri '{seri}' sudah terjual")
        items.append(resolved)
    total = round(sum(i["harga_jual"] * i["netto"] for i in items), 2)
    return items, total


@router.post("/penjualan", response_model=Penjualan, dependencies=[Depends(require_any("penjualan"))])
async def create_penjualan(body: PenjualanIn, wh: str = Depends(active_wh), user: dict = Depends(get_current_user)):
    items, total = await _build_sale_items(wh, body)
    doc = {"id": str(uuid.uuid4()), "warehouse_id": wh, "tanggal_jual": body.tanggal_jual, "gulungan": body.gulungan.strip().upper(), "pembeli": body.pembeli.strip().upper(), "items": items, "jumlah_seri": len(items), "total_harga_jual": total, "created_by_name": user["name"], "created_at": now_iso()}
    await db.penjualan.insert_one(dict(doc))
    return Penjualan(**doc)


@router.put("/penjualan/{sid}", response_model=Penjualan, dependencies=[Depends(require_any("penjualan"))])
async def update_penjualan(sid: str, body: PenjualanIn, wh: str = Depends(active_wh), user: dict = Depends(get_current_user)):
    doc = await db.penjualan.find_one({"id": sid, "warehouse_id": wh}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Penjualan tidak ditemukan")
    items, total = await _build_sale_items(wh, body, exclude_id=sid)
    updates = {"tanggal_jual": body.tanggal_jual, "gulungan": body.gulungan.strip().upper(), "pembeli": body.pembeli.strip().upper(), "items": items, "jumlah_seri": len(items), "total_harga_jual": total}
    await db.penjualan.update_one({"id": sid}, {"$set": updates})
    doc.update(updates)
    return Penjualan(**doc)


@router.delete("/penjualan/{sid}", dependencies=[Depends(require_any("penjualan"))])
async def delete_penjualan(sid: str, wh: str = Depends(active_wh)):
    await db.penjualan.delete_one({"id": sid, "warehouse_id": wh})
    return {"ok": True}


@router.get("/penjualan/lookup", dependencies=[Depends(require_any("penjualan"))])
async def penjualan_lookup(seri: str, wh: str = Depends(active_wh)):
    s = seri.strip().upper()
    if not await _serial_in_pembelian(wh, s):
        return {"valid": False, "error": f"'{s}' belum ada di pembelian"}
    bk = await db.berat_koli.find_one({"warehouse_id": wh, "nomor_seri": s}, {"_id": 0})
    if not bk:
        return {"valid": False, "error": f"'{s}' belum ada berat koli"}
    if await _serial_sold(wh, s):
        return {"valid": False, "error": f"'{s}' sudah terjual"}
    busai = await db.busai.find_one({"warehouse_id": wh, "nomor_seri": s}, {"_id": 0})
    if busai and busai["status"] == "bongkar":
        return {"valid": False, "error": f"'{s}' sedang dibongkar (belum dibungkus)"}
    bruto = float(busai["bruto_busai"]) if busai and busai.get("bruto_busai") else float(bk["bruto"])
    snap = await _purchase_snapshot(wh, s)
    ket = busai["keterangan"] if busai and busai.get("keterangan") else snap.get("keterangan_beli", "")
    return {"valid": True, "bruto": bruto, "keterangan": ket, "harga_beli": snap.get("harga_beli", 0)}


@router.get("/penjualan/template", dependencies=[Depends(require_any("penjualan"))])
async def penjualan_template(wh: str = Depends(active_wh)):
    headers = ["tanggal_jual", "gulungan", "nomor_seri", "nomor_jadi", "grade"]
    example = [[today_iso("Asia/Jakarta"), "G1", "S0001", "J0001", "A"]]
    return xlsx_response(build_xlsx(headers, example, "Penjualan"), "format_penjualan.xlsx")


@router.post("/penjualan/import", dependencies=[Depends(require_any("penjualan"))])
async def penjualan_import(file: UploadFile = File(...), wh: str = Depends(active_wh), user: dict = Depends(get_current_user)):
    rows = read_xlsx(await file.read())
    if not rows:
        raise HTTPException(status_code=400, detail="File kosong")
    grades = {g["grade"]: g["harga"] async for g in db.harga_jual.find({"warehouse_id": wh}, {"_id": 0})}
    groups: dict[tuple, list[dict]] = {}
    order: list[tuple] = []
    for r in rows:
        key = (str(r.get("tanggal_jual") or today_iso("Asia/Jakarta"))[:10], str(r.get("gulungan") or "").strip().upper())
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(r)
    created = 0
    for key in order:
        grp = groups[key]
        if len(grp) > 50:
            raise HTTPException(status_code=400, detail=f"Gulungan {key[1]} melebihi 50 nomor seri")
        if key[1] and await db.penjualan.find_one({"warehouse_id": wh, "gulungan": key[1]}):
            raise HTTPException(status_code=409, detail=f"Gulungan '{key[1]}' sudah ada di sistem")
        items, jadis, seris = [], set(), set()
        for r in grp:
            resolved = await _resolve_sale(wh, str(r.get("nomor_seri") or ""), str(r.get("nomor_jadi") or ""), str(r.get("grade") or ""), grades, None)
            jadi, seri = resolved["nomor_jadi"], resolved["nomor_seri"]
            if jadi in jadis or await db.penjualan.find_one({"warehouse_id": wh, "items.nomor_jadi": jadi}):
                raise HTTPException(status_code=409, detail=f"Nomor jadi '{jadi}' ganda / sudah ada")
            if await db.out_records.find_one({"warehouse_id": wh, "nomor_jadi": jadi}):
                raise HTTPException(status_code=409, detail=f"Nomor jadi '{jadi}' sudah di-OUT")
            if seri in seris or await _serial_sold(wh, seri):
                raise HTTPException(status_code=409, detail=f"Nomor seri '{seri}' ganda / sudah terjual")
            jadis.add(jadi)
            seris.add(seri)
            items.append(resolved)
        if not items:
            continue
        total = round(sum(i["harga_jual"] * i["netto"] for i in items), 2)
        doc = {"id": str(uuid.uuid4()), "warehouse_id": wh, "tanggal_jual": key[0], "gulungan": key[1], "items": items, "jumlah_seri": len(items), "total_harga_jual": total, "created_by_name": user["name"], "created_at": now_iso()}
        await db.penjualan.insert_one(dict(doc))
        created += 1
    return {"ok": True, "created": created}


async def _laporan_rows(wh, date_from, date_to, q_seri, q_jadi, q_bandul) -> list[LaporanPenjualanRow]:
    q: dict = {"warehouse_id": wh}
    if date_from or date_to:
        q["tanggal_jual"] = {}
        if date_from:
            q["tanggal_jual"]["$gte"] = date_from
        if date_to:
            q["tanggal_jual"]["$lte"] = date_to
    sales = await db.penjualan.find(q, {"_id": 0}).sort([("tanggal_jual", -1), ("created_at", -1)]).to_list(20000)
    fs, fj, fb = (q_seri or "").strip().lower(), (q_jadi or "").strip().lower(), (q_bandul or "").strip().lower()
    rows = []
    for s in sales:
        for it in s.get("items", []):
            if fs and fs not in it["nomor_seri"].lower():
                continue
            if fj and fj not in it["nomor_jadi"].lower():
                continue
            if fb and fb not in (it.get("bandul_nama", "")).lower():
                continue
            nb = it.get("netto_beli")
            tb = round(float(it.get("harga_beli") or 0) * (nb or 0), 2)
            tj = round(float(it.get("harga_jual") or 0) * (it.get("netto") or 0), 2)
            rows.append(LaporanPenjualanRow(
                tanggal_beli=it.get("tanggal_beli", ""), tanggal_jual=s["tanggal_jual"], nomor_seri=it["nomor_seri"],
                bandul_nama=it.get("bandul_nama", ""), nomor_jadi=it["nomor_jadi"], grade=it.get("grade", ""),
                bruto_beli=it.get("bruto_beli"), netto_beli=nb, bruto_jual=it.get("bruto") or 0, netto_jual=it.get("netto") or 0,
                harga_beli=float(it.get("harga_beli") or 0), total_harga_beli=tb, harga_jual=float(it.get("harga_jual") or 0),
                total_harga_jual=tj, selisih=round(tj - tb, 2),
            ))
    return rows


@router.get("/laporan-penjualan", response_model=list[LaporanPenjualanRow], dependencies=[Depends(require_any("laporan_penjualan"))])
async def laporan_penjualan(wh: str = Depends(active_wh), date_from: Optional[str] = None, date_to: Optional[str] = None, q_seri: Optional[str] = None, q_jadi: Optional[str] = None, q_bandul: Optional[str] = None):
    return await _laporan_rows(wh, date_from, date_to, q_seri, q_jadi, q_bandul)


@router.get("/laporan-penjualan/export", dependencies=[Depends(require_any("laporan_penjualan"))])
async def laporan_export(wh: str = Depends(active_wh), date_from: Optional[str] = None, date_to: Optional[str] = None, q_seri: Optional[str] = None, q_jadi: Optional[str] = None, q_bandul: Optional[str] = None):
    rows = await _laporan_rows(wh, date_from, date_to, q_seri, q_jadi, q_bandul)
    headers = ["Tanggal Beli", "Tanggal Jual", "Nomor Seri", "Bandul", "Nomor Jadi", "Grade", "Bruto Beli", "Netto Beli", "Bruto Jual", "Netto Jual", "Harga Beli", "Total Harga Beli", "Harga Jual", "Total Harga Jual", "Selisih"]
    data = [[r.tanggal_beli, r.tanggal_jual, r.nomor_seri, r.bandul_nama, r.nomor_jadi, r.grade, r.bruto_beli, r.netto_beli, r.bruto_jual, r.netto_jual, r.harga_beli, r.total_harga_beli, r.harga_jual, r.total_harga_jual, r.selisih] for r in rows]
    return xlsx_response(build_xlsx(headers, data, "Laporan Penjualan"), "laporan_penjualan.xlsx")


# ========================= Out =========================
def _recompute_sale_total(items: list[dict]) -> float:
    return round(sum(float(i.get("harga_jual") or 0) * float(i.get("netto") or 0) for i in items), 2)


def _build_out_record(wh: str, sale: dict, item: dict, tanggal_out: str, user: dict) -> dict:
    nb = item.get("netto_beli")
    tb = round(float(item.get("harga_beli") or 0) * (nb or 0), 2)
    tj = round(float(item.get("harga_jual") or 0) * (item.get("netto") or 0), 2)
    return {
        "id": str(uuid.uuid4()), "warehouse_id": wh, "tanggal_out": tanggal_out,
        "penjualan_id": sale["id"], "gulungan": sale.get("gulungan", ""), "pembeli": sale.get("pembeli", ""),
        "tanggal_jual": sale.get("tanggal_jual", ""), "tanggal_beli": item.get("tanggal_beli", ""),
        "nomor_seri": item["nomor_seri"], "nomor_jadi": item["nomor_jadi"], "bandul_nama": item.get("bandul_nama", ""),
        "grade": item.get("grade", ""), "bruto_beli": item.get("bruto_beli"), "netto_beli": nb,
        "bruto_jual": item.get("bruto") or 0, "netto_jual": item.get("netto") or 0,
        "harga_beli": float(item.get("harga_beli") or 0), "total_harga_beli": tb,
        "harga_jual": float(item.get("harga_jual") or 0), "total_harga_jual": tj, "selisih": round(tj - tb, 2),
        "item": item, "created_by_name": user.get("name", ""), "created_at": now_iso(),
    }


async def _out_query(wh: str, date_from=None, date_to=None) -> list[dict]:
    q: dict = {"warehouse_id": wh}
    if date_from or date_to:
        q["tanggal_out"] = {}
        if date_from:
            q["tanggal_out"]["$gte"] = date_from
        if date_to:
            q["tanggal_out"]["$lte"] = date_to
    return await db.out_records.find(q, {"_id": 0}).sort([("tanggal_out", -1), ("created_at", -1)]).to_list(50000)


@router.get("/out", response_model=list[OutRecord], dependencies=[Depends(require_any("out"))])
async def list_out(wh: str = Depends(active_wh), date_from: Optional[str] = None, date_to: Optional[str] = None):
    return [OutRecord(**d) for d in await _out_query(wh, date_from, date_to)]


@router.get("/out/template", dependencies=[Depends(require_any("out"))])
async def out_template(wh: str = Depends(active_wh)):
    return xlsx_response(build_xlsx(["nomor_jadi"], [["J0001"]], "Out"), "format_out.xlsx")


@router.post("/out/import", dependencies=[Depends(require_any("out"))])
async def out_import(file: UploadFile = File(...), wh: str = Depends(active_wh), user: dict = Depends(get_current_user)):
    rows = read_xlsx(await file.read())
    if not rows:
        raise HTTPException(status_code=400, detail="File kosong")
    jadis, seen = [], set()
    for r in rows:
        j = str(r.get("nomor_jadi") or "").strip().upper()
        if not j:
            continue
        if j in seen:
            raise HTTPException(status_code=409, detail=f"Nomor jadi '{j}' ganda dalam file")
        seen.add(j)
        jadis.append(j)
    if not jadis:
        raise HTTPException(status_code=400, detail="Tidak ada nomor jadi pada file")
    today = today_iso("Asia/Jakarta")
    created = 0
    for jadi in jadis:
        if await db.out_records.find_one({"warehouse_id": wh, "nomor_jadi": jadi}):
            raise HTTPException(status_code=409, detail=f"Nomor jadi '{jadi}' sudah di-OUT")
        sale = await db.penjualan.find_one({"warehouse_id": wh, "items.nomor_jadi": jadi}, {"_id": 0})
        if not sale:
            raise HTTPException(status_code=400, detail=f"Nomor jadi '{jadi}' tidak ditemukan di penjualan")
        item = next(it for it in sale["items"] if it["nomor_jadi"] == jadi)
        await db.out_records.insert_one(dict(_build_out_record(wh, sale, item, today, user)))
        remaining = [it for it in sale["items"] if it["nomor_jadi"] != jadi]
        if remaining:
            await db.penjualan.update_one({"id": sale["id"]}, {"$set": {"items": remaining, "jumlah_seri": len(remaining), "total_harga_jual": _recompute_sale_total(remaining)}})
        else:
            await db.penjualan.delete_one({"id": sale["id"]})
        created += 1
    return {"ok": True, "created": created}


@router.delete("/out/{oid}", dependencies=[Depends(require_any("out"))])
async def delete_out(oid: str, wh: str = Depends(active_wh)):
    rec = await db.out_records.find_one({"id": oid, "warehouse_id": wh}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Data out tidak ditemukan")
    item = rec.get("item") or {}
    sale = await db.penjualan.find_one({"id": rec.get("penjualan_id"), "warehouse_id": wh}, {"_id": 0}) if rec.get("penjualan_id") else None
    if sale:
        if not any(it.get("nomor_jadi") == item.get("nomor_jadi") for it in sale["items"]):
            items = sale["items"] + [item]
            await db.penjualan.update_one({"id": sale["id"]}, {"$set": {"items": items, "jumlah_seri": len(items), "total_harga_jual": _recompute_sale_total(items)}})
    else:
        doc = {
            "id": rec.get("penjualan_id") or str(uuid.uuid4()), "warehouse_id": wh, "tanggal_jual": rec.get("tanggal_jual", ""),
            "gulungan": rec.get("gulungan", ""), "pembeli": rec.get("pembeli", ""), "items": [item], "jumlah_seri": 1,
            "total_harga_jual": _recompute_sale_total([item]), "created_by_name": rec.get("created_by_name", ""), "created_at": now_iso(),
        }
        await db.penjualan.insert_one(dict(doc))
    await db.out_records.delete_one({"id": oid})
    return {"ok": True}


@router.get("/out/export", dependencies=[Depends(require_any("out"))])
async def out_export(wh: str = Depends(active_wh), date_from: Optional[str] = None, date_to: Optional[str] = None):
    rows = [OutRecord(**d) for d in await _out_query(wh, date_from, date_to)]
    headers = ["Tgl Out", "Tgl Beli", "Tgl Jual", "Nomor Seri", "Bandul", "Nomor Jadi", "Grade", "Bruto Beli", "Netto Beli", "Bruto Jual", "Netto Jual", "Harga Beli", "Total Harga Beli", "Harga Jual", "Total Harga Jual", "Selisih"]
    data = [[r.tanggal_out, r.tanggal_beli, r.tanggal_jual, r.nomor_seri, r.bandul_nama, r.nomor_jadi, r.grade, r.bruto_beli, r.netto_beli, r.bruto_jual, r.netto_jual, r.harga_beli, r.total_harga_beli, r.harga_jual, r.total_harga_jual, r.selisih] for r in rows]
    return xlsx_response(build_xlsx(headers, data, "Out"), "laporan_out.xlsx")


# ========================= Revisi =========================
async def _revisi_query(wh: str, date_from=None, date_to=None) -> list[dict]:
    q: dict = {"warehouse_id": wh}
    if date_from or date_to:
        q["tanggal_revisi"] = {}
        if date_from:
            q["tanggal_revisi"]["$gte"] = date_from
        if date_to:
            q["tanggal_revisi"]["$lte"] = date_to
    return await db.revisi_records.find(q, {"_id": 0}).sort([("tanggal_revisi", -1), ("created_at", -1)]).to_list(50000)


@router.get("/revisi", response_model=list[RevisiRecord], dependencies=[Depends(require_any("revisi"))])
async def list_revisi(wh: str = Depends(active_wh), date_from: Optional[str] = None, date_to: Optional[str] = None):
    return [RevisiRecord(**d) for d in await _revisi_query(wh, date_from, date_to)]


@router.get("/revisi/template", dependencies=[Depends(require_any("revisi"))])
async def revisi_template(wh: str = Depends(active_wh)):
    return xlsx_response(build_xlsx(["nomor_jadi", "grade"], [["J0001", "A"]], "Revisi"), "format_revisi.xlsx")


@router.post("/revisi/import", dependencies=[Depends(require_any("revisi"))])
async def revisi_import(file: UploadFile = File(...), wh: str = Depends(active_wh), user: dict = Depends(get_current_user)):
    rows = read_xlsx(await file.read())
    if not rows:
        raise HTTPException(status_code=400, detail="File kosong")
    grades = {g["grade"]: g["harga"] async for g in db.harga_jual.find({"warehouse_id": wh}, {"_id": 0})}
    today = today_iso("Asia/Jakarta")
    seen, created = set(), 0
    for r in rows:
        jadi = str(r.get("nomor_jadi") or "").strip().upper()
        grade = str(r.get("grade") or "").strip().upper()
        if not jadi:
            continue
        if jadi in seen:
            raise HTTPException(status_code=409, detail=f"Nomor jadi '{jadi}' ganda dalam file")
        seen.add(jadi)
        if grade not in grades:
            raise HTTPException(status_code=400, detail=f"Grade '{grade}' tidak ada di menu Harga")
        sale = await db.penjualan.find_one({"warehouse_id": wh, "items.nomor_jadi": jadi}, {"_id": 0})
        if not sale:
            raise HTTPException(status_code=400, detail=f"Nomor jadi '{jadi}' tidak ditemukan di penjualan")
        item = next(it for it in sale["items"] if it["nomor_jadi"] == jadi)
        old_grade = item.get("grade", "")
        old_harga = float(item.get("harga_jual") or 0)
        new_harga = float(grades[grade])
        netto = float(item.get("netto") or 0)
        new_items = [({**it, "grade": grade, "harga_jual": new_harga} if it["nomor_jadi"] == jadi else it) for it in sale["items"]]
        await db.penjualan.update_one({"id": sale["id"]}, {"$set": {"items": new_items, "total_harga_jual": _recompute_sale_total(new_items)}})
        rec = {
            "id": str(uuid.uuid4()), "warehouse_id": wh, "tanggal_revisi": today, "penjualan_id": sale["id"],
            "gulungan": sale.get("gulungan", ""), "tanggal_jual": sale.get("tanggal_jual", ""), "nomor_seri": item["nomor_seri"],
            "nomor_jadi": jadi, "bandul_nama": item.get("bandul_nama", ""), "netto": netto,
            "grade_lama": old_grade, "harga_lama": old_harga, "grade_baru": grade, "harga_baru": new_harga,
            "total_lama": round(old_harga * netto, 2), "total_baru": round(new_harga * netto, 2), "selisih": round((new_harga - old_harga) * netto, 2),
            "created_by_name": user.get("name", ""), "created_at": now_iso(),
        }
        await db.revisi_records.insert_one(dict(rec))
        created += 1
    return {"ok": True, "created": created}


@router.delete("/revisi/{rid}", dependencies=[Depends(require_any("revisi"))])
async def delete_revisi(rid: str, wh: str = Depends(active_wh)):
    rec = await db.revisi_records.find_one({"id": rid, "warehouse_id": wh}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Data revisi tidak ditemukan")
    sale = await db.penjualan.find_one({"warehouse_id": wh, "items.nomor_jadi": rec["nomor_jadi"]}, {"_id": 0})
    if sale:
        new_items = [({**it, "grade": rec.get("grade_lama", ""), "harga_jual": float(rec.get("harga_lama") or 0)} if it["nomor_jadi"] == rec["nomor_jadi"] else it) for it in sale["items"]]
        await db.penjualan.update_one({"id": sale["id"]}, {"$set": {"items": new_items, "total_harga_jual": _recompute_sale_total(new_items)}})
    await db.revisi_records.delete_one({"id": rid})
    return {"ok": True}


@router.get("/revisi/export", dependencies=[Depends(require_any("revisi"))])
async def revisi_export(wh: str = Depends(active_wh), date_from: Optional[str] = None, date_to: Optional[str] = None):
    rows = [RevisiRecord(**d) for d in await _revisi_query(wh, date_from, date_to)]
    headers = ["Tgl Revisi", "Tgl Jual", "Gulungan", "Nomor Seri", "Nomor Jadi", "Bandul", "Netto", "Grade Lama", "Harga Lama", "Grade Baru", "Harga Baru", "Total Lama", "Total Baru", "Selisih"]
    data = [[r.tanggal_revisi, r.tanggal_jual, r.gulungan, r.nomor_seri, r.nomor_jadi, r.bandul_nama, r.netto, r.grade_lama, r.harga_lama, r.grade_baru, r.harga_baru, r.total_lama, r.total_baru, r.selisih] for r in rows]
    return xlsx_response(build_xlsx(headers, data, "Revisi"), "laporan_revisi.xlsx")
