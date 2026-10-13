"""Asisten AI: tanya-jawab data gudang via Claude (streaming SSE), riwayat tersimpan per pengguna."""

import json
import os
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from lib.auth import get_current_user, now_iso
from lib.db import db
from lib.stock import ITEM_LABELS, compute_stock

router = APIRouter(prefix="/assistant", tags=["assistant"], dependencies=[Depends(get_current_user)])

MODEL_PROVIDER, MODEL_NAME = "anthropic", "claude-sonnet-5-5"
HISTORY_LIMIT = 50

SYSTEM_PROMPT = """Kamu adalah Asisten AI untuk TWMS (Tobacco Warehouse Management System), aplikasi manajemen gudang tembakau/bahan rokok.

Tugasmu: menjawab pertanyaan pengguna tentang data gudang — stok, transaksi barang masuk/keluar/transfer/pemakaian, supplier, gudang, serta data internal pembelian & penjualan.

Aturan:
- Jawab SELALU dalam Bahasa Indonesia yang sopan dan mudah dipahami.
- Jawab berdasarkan DATA GUDANG SAAT INI yang disertakan di bawah. Jika jawabannya tidak ada di data, katakan jujur bahwa data tersebut tidak tersedia — jangan mengarang angka.
- Satuan: Glangse dalam lembar, Tali Putih dalam kg, Kertas Coklat dalam roll.
- Format angka dengan pemisah ribuan titik (gaya Indonesia). Mata uang dalam Rupiah (Rp).
- Jawaban ringkas dan langsung. Gunakan daftar poin bila membantu. Markdown sederhana (bold, list) boleh dipakai.
- Jika ditanya hal di luar data gudang, jawab singkat bahwa kamu hanya bisa membantu seputar data gudang aplikasi ini.
"""


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


def _num(v: float) -> str:
    """Indonesian-style number: 1234.5 -> '1.234,5'."""
    s = f"{v:,.4f}".rstrip("0").rstrip(".")
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


async def build_data_context() -> str:
    stock = await compute_stock()
    whs = await db.warehouses.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    suppliers = await db.suppliers.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    txs = await db.transactions.find({}, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(25)
    pembelian = await db.pembelian.find({}, {"_id": 0}).sort([("tanggal_beli", -1), ("created_at", -1)]).to_list(10)
    penjualan = await db.penjualan.find({}, {"_id": 0}).sort([("tanggal_jual", -1), ("created_at", -1)]).to_list(10)

    wh_names = {w["id"]: w["name"] for w in whs}
    today = datetime.now(timezone.utc).strftime("%d-%m-%Y")
    lines = [f"DATA GUDANG SAAT INI (diambil {today}):"]

    lines.append("\nDAFTAR GUDANG:")
    if not whs:
        lines.append("- (belum ada gudang)")
    for w in whs:
        parent = wh_names.get(w.get("parent_id"), "")
        label = f"{w['name']} (ranting dari {parent})" if parent else w["name"]
        loc = w.get("location", "")
        lines.append(f"- {label}" + (f" — lokasi: {loc}" if loc else ""))

    lines.append("\nSTOK PER GUDANG (Glangse=lembar, Tali Putih=kg, Kertas Coklat=roll):")
    tot = {"glangse": 0.0, "tali": 0.0, "kertas": 0.0}
    for w in whs:
        s = stock.get(w["id"], {"glangse": 0.0, "tali": 0.0, "kertas": 0.0})
        for k in tot:
            tot[k] += s[k]
        lines.append(
            f"- {w['name']}: Glangse {_num(s['glangse'])} lembar, Tali Putih {_num(s['tali'])} kg, "
            f"Kertas Coklat {_num(s['kertas'])} roll"
        )
    lines.append(
        f"- TOTAL SEMUA GUDANG: Glangse {_num(tot['glangse'])} lembar, Tali Putih {_num(tot['tali'])} kg, "
        f"Kertas Coklat {_num(tot['kertas'])} roll"
    )

    lines.append("\nDAFTAR SUPPLIER:")
    if not suppliers:
        lines.append("- (belum ada supplier)")
    for s in suppliers:
        phone = s.get("phone", "")
        lines.append(f"- {s['name']}" + (f" — telp {phone}" if phone else ""))

    type_id = {"masuk": "Barang Masuk", "transfer": "Transfer", "pribadi": "Pemakaian Pribadi"}
    lines.append("\nTRANSAKSI TERAKHIR (maks 25 — tanggal | jenis | barang | jumlah | gudang | keterangan):")
    if not txs:
        lines.append("- (belum ada transaksi)")
    for t in txs:
        item = ITEM_LABELS.get(t.get("item", ""), t.get("item", ""))
        extra = ""
        if t.get("type") == "masuk" and t.get("supplier_name"):
            extra = f"dari supplier {t['supplier_name']}"
        elif t.get("type") == "transfer" and t.get("target_warehouse_name"):
            extra = f"ke {t['target_warehouse_name']}"
        lines.append(
            f"- {t.get('date', '')} | {type_id.get(t.get('type', ''), t.get('type', ''))} | {item} | "
            f"{_num(float(t.get('qty', 0)))} | {t.get('warehouse_name', '')}" + (f" | {extra}" if extra else "")
        )

    lines.append("\nPEMBELIAN INTERNAL TERAKHIR (maks 10 — tanggal | kupon | gudang | jumlah seri | bandul):")
    if not pembelian:
        lines.append("- (belum ada pembelian)")
    for p in pembelian:
        wh = wh_names.get(p.get("warehouse_id", ""), p.get("warehouse_id", ""))
        lines.append(
            f"- {p.get('tanggal_beli', '')} | kupon {p.get('nomor_kupon') or '-'} | {wh} | "
            f"{p.get('jumlah_seri', 0)} seri | bandul {p.get('bandul_nama') or '-'}"
        )

    lines.append("\nPENJUALAN TERAKHIR (maks 10 — tanggal | gudang | jumlah item | total harga jual):")
    if not penjualan:
        lines.append("- (belum ada penjualan)")
    for p in penjualan:
        wh = wh_names.get(p.get("warehouse_id", ""), p.get("warehouse_id", ""))
        items = p.get("items") or []
        lines.append(
            f"- {p.get('tanggal_jual', '')} | {wh} | {len(items)} item | Rp {_num(float(p.get('total_harga_jual', 0)))}"
        )

    return "\n".join(lines)


@router.post("/chat")
async def chat(body: ChatIn, user: dict = Depends(get_current_user)):
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Asisten AI belum dikonfigurasi (kunci tidak tersedia)")

    context = await build_data_context()
    chat_client = LlmChat(
        api_key=api_key,
        session_id=f"assistant-{user['id']}",
        system_message=SYSTEM_PROMPT + "\n\n" + context,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)

    async def stream():
        parts: list[str] = []
        try:
            async for ev in chat_client.stream_message(UserMessage(text=body.message)):
                if isinstance(ev, TextDelta):
                    parts.append(ev.content)
                    yield f"data: {json.dumps({'token': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception:
            yield f"data: {json.dumps({'error': 'Asisten sedang tidak dapat dihubungi. Silakan coba lagi.'})}\n\n"
            return
        answer = "".join(parts)
        await db.assistant_messages.insert_many([
            {"id": str(uuid.uuid4()), "user_id": user["id"], "role": "user", "content": body.message, "created_at": now_iso()},
            {"id": str(uuid.uuid4()), "user_id": user["id"], "role": "assistant", "content": answer, "created_at": now_iso()},
        ])
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/history")
async def history(user: dict = Depends(get_current_user)):
    docs = (
        await db.assistant_messages.find({"user_id": user["id"]}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(HISTORY_LIMIT)
    )
    docs.reverse()
    return docs


@router.delete("/history")
async def clear_history(user: dict = Depends(get_current_user)):
    await db.assistant_messages.delete_many({"user_id": user["id"]})
    return {"ok": True}
