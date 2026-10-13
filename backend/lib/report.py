"""Dashboard report: per-warehouse movements (period) + ending stock, supplier deliveries. Base units throughout."""

from collections import defaultdict
from typing import Iterator, Optional

from lib.db import db

ITEMS = ("glangse", "tali", "kertas")
METRICS = ("masuk", "transfer_in", "transfer_out", "pribadi", "stok")


def _z() -> dict[str, float]:
    return {k: 0.0 for k in ITEMS}


def _metrics() -> dict[str, dict[str, float]]:
    return {m: _z() for m in METRICS}


def _round(d: dict[str, float]) -> dict[str, float]:
    return {k: round(v, 4) for k, v in d.items()}


def _row(w: dict, m: dict, level: int = 0, parent: Optional[dict] = None) -> dict:
    return {
        "warehouse_id": w["id"],
        "warehouse_name": w["name"],
        "parent_id": parent["id"] if parent else None,
        "parent_name": parent["name"] if parent else None,
        "level": level,
        **{k: _round(m[k]) for k in METRICS},
    }


def _sum(ms: list[dict]) -> dict:
    out = _metrics()
    for m in ms:
        for k in METRICS:
            for i in ITEMS:
                out[k][i] += m[k][i]
    return out


# ---------- aggregation ----------
def _apply_stock(metrics: dict, t: dict) -> None:
    item, q = t["item"], float(t["qty"])
    if t["type"] == "masuk":
        metrics[t["warehouse_id"]]["stok"][item] += q
        return
    metrics[t["warehouse_id"]]["stok"][item] -= q
    if t["type"] == "transfer" and t.get("target_warehouse_id"):
        metrics[t["target_warehouse_id"]]["stok"][item] += q


def _apply_movement(metrics: dict, sups: dict, t: dict) -> None:
    item, q, wid = t["item"], float(t["qty"]), t["warehouse_id"]
    if t["type"] == "masuk":
        metrics[wid]["masuk"][item] += q
        _add_supplier(sups, t, item, q)
    elif t["type"] == "transfer":
        metrics[wid]["transfer_out"][item] += q
        if t.get("target_warehouse_id"):
            metrics[t["target_warehouse_id"]]["transfer_in"][item] += q
    else:
        metrics[wid]["pribadi"][item] += q


def _add_supplier(sups: dict, t: dict, item: str, q: float) -> None:
    key = t.get("supplier_id") or t.get("supplier_name") or "-"
    s = sups.setdefault(
        key,
        {"supplier_id": t.get("supplier_id"), "supplier_name": t.get("supplier_name") or "-", "total": _z(), "per": defaultdict(_z)},
    )
    s["total"][item] += q
    s["per"][t["warehouse_id"]][item] += q


async def _aggregate(date_from: Optional[str], date_to: Optional[str]) -> tuple[dict, dict]:
    """Ending stock uses every transaction up to date_to; movements only those inside [date_from, date_to]."""
    metrics: dict[str, dict] = defaultdict(_metrics)
    sups: dict[str, dict] = {}
    async for t in db.transactions.find({}, {"_id": 0}):
        if date_to and t["date"] > date_to:
            continue
        _apply_stock(metrics, t)
        if not date_from or t["date"] >= date_from:
            _apply_movement(metrics, sups, t)
    return metrics, sups


# ---------- shaping ----------
def _tree(whs: list[dict]) -> list[tuple[dict, list[dict]]]:
    """Induk sorted by name with their ranting. Ranting whose induk is missing are treated as induk."""
    ids = {w["id"] for w in whs}
    children: dict[str, list[dict]] = defaultdict(list)
    roots = []
    for w in whs:
        if w.get("parent_id") and w["parent_id"] in ids:
            children[w["parent_id"]].append(w)
        else:
            roots.append(w)
    key = lambda x: x["name"].lower()  # noqa: E731
    return [(p, sorted(children[p["id"]], key=key)) for p in sorted(roots, key=key)]


def _warehouse_rows(whs: list[dict], metrics: dict) -> tuple[list[dict], list[dict]]:
    rows, groups = [], []
    for parent, kids in _tree(whs):
        rows.append(_row(parent, metrics[parent["id"]]))
        rows.extend(_row(k, metrics[k["id"]], 1, parent) for k in kids)
        if kids:
            combined = _sum([metrics[parent["id"]]] + [metrics[k["id"]] for k in kids])
            groups.append(_row({"id": parent["id"], "name": f"{parent['name']} + ranting"}, combined))
    return rows, groups


def _supplier_rows(sups: dict, names: dict[str, str], allowed: Optional[set] = None) -> list[dict]:
    out = []
    for s in sorted(sups.values(), key=lambda x: x["supplier_name"].lower()):
        per_items = [(wid, v) for wid, v in s["per"].items() if allowed is None or wid in allowed]
        if allowed is not None and not per_items:
            continue
        per = [
            {"warehouse_id": wid, "warehouse_name": names.get(wid, "(gudang terhapus)"), "totals": _round(v)}
            for wid, v in per_items
        ]
        per.sort(key=lambda x: x["warehouse_name"].lower())
        if allowed is None:
            total = _round(s["total"])
        else:
            agg = _z()
            for _, v in per_items:
                for i in ITEMS:
                    agg[i] += v[i]
            total = _round(agg)
        out.append({"supplier_id": s["supplier_id"], "supplier_name": s["supplier_name"], "total": total, "per_warehouse": per})
    return out


async def build_report(date_from: Optional[str], date_to: Optional[str], allowed: Optional[set] = None) -> dict:
    whs = await db.warehouses.find({}, {"_id": 0}).to_list(5000)
    if allowed is not None:
        whs = [w for w in whs if w["id"] in allowed]
    metrics, sups = await _aggregate(date_from, date_to)
    rows, groups = _warehouse_rows(whs, metrics)
    total = _row({"id": "", "name": "Total Seluruh Gudang"}, _sum([metrics[w["id"]] for w in whs]))
    suppliers = _supplier_rows(sups, {w["id"]: w["name"] for w in whs}, allowed)
    return {"date_from": date_from, "date_to": date_to, "rows": rows, "groups": groups, "total": total, "suppliers": suppliers}


def iter_report_rows(r: dict) -> Iterator[tuple[dict, str]]:
    """Rows in display order with kind Induk/Ranting/Subtotal/Total; a subtotal follows the last ranting of each group."""
    group_by_id = {g["warehouse_id"]: g for g in r["groups"]}
    rows = r["rows"]
    for i, row in enumerate(rows):
        yield row, ("Ranting" if row["level"] else "Induk")
        nxt = rows[i + 1] if i + 1 < len(rows) else None
        induk_id = row["parent_id"] or row["warehouse_id"]
        if induk_id in group_by_id and (nxt is None or nxt["level"] == 0):
            yield group_by_id[induk_id], "Subtotal"
    yield r["total"], "Total"


def supplier_grand_total(r: dict) -> dict[str, float]:
    grand = _z()
    for s in r["suppliers"]:
        for k in ITEMS:
            grand[k] += s["total"][k]
    return grand
