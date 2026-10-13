"""Stock is derived from the transaction ledger. Base units: glangse=lembar, tali=kg, kertas=roll."""

from collections import defaultdict

from fastapi import HTTPException

from lib.db import db

LEMBAR_PER_GULUNG = 5
UNIT_FACTORS: dict[str, dict[str, float]] = {
    "glangse": {"gulung": LEMBAR_PER_GULUNG, "koli": 1},
    "tali": {"kg": 1},
    "kertas": {"roll": 1},
}
ITEM_LABELS = {"glangse": "Glangse", "tali": "Tali Putih", "kertas": "Kertas Coklat"}
BASE_UNIT = {"glangse": "koli", "tali": "kg", "kertas": "roll"}


def to_base_qty(item: str, qty: float, unit: str) -> float:
    factors = UNIT_FACTORS[item]
    if unit not in factors:
        raise HTTPException(status_code=400, detail=f"Satuan '{unit}' tidak valid untuk {ITEM_LABELS[item]}")
    if item == "kertas" and abs(qty - round(qty)) > 1e-9:
        raise HTTPException(status_code=400, detail="Kertas Coklat harus dalam bilangan bulat (roll)")
    return round(qty * factors[unit], 4)


def _empty() -> dict[str, float]:
    return {"glangse": 0.0, "tali": 0.0, "kertas": 0.0}


def _apply(stock: dict, t: dict) -> None:
    item, qty = t["item"], float(t["qty"])
    if t["type"] == "masuk":
        stock[t["warehouse_id"]][item] += qty
    else:
        stock[t["warehouse_id"]][item] -= qty
        if t["type"] == "transfer" and t.get("target_warehouse_id"):
            stock[t["target_warehouse_id"]][item] += qty


async def compute_stock(exclude_id: str | None = None, extra: dict | None = None) -> dict[str, dict[str, float]]:
    """Ledger balance per warehouse. `exclude_id`/`extra` simulate a delete or an edit before committing it."""
    stock: dict[str, dict[str, float]] = defaultdict(_empty)
    cursor = db.transactions.find(
        {}, {"_id": 0, "id": 1, "type": 1, "item": 1, "qty": 1, "warehouse_id": 1, "target_warehouse_id": 1}
    )
    async for t in cursor:
        if exclude_id and t.get("id") == exclude_id:
            continue
        _apply(stock, t)
    if extra:
        _apply(stock, extra)
    for wh in stock.values():
        for k in wh:
            wh[k] = round(wh[k], 4)
    return stock


def has_negative(stock: dict[str, dict[str, float]]) -> bool:
    return any(v < -1e-9 for wh in stock.values() for v in wh.values())
