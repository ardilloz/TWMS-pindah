"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "users": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("username", ASCENDING)], name="username", unique=True),
    ],
    "sessions": [
        IndexModel([("token", ASCENDING)], name="token", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0),
    ],
    "warehouses": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("name", ASCENDING)], name="name"),
        IndexModel([("parent_id", ASCENDING)], name="parent_id"),
    ],
    "suppliers": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("name", ASCENDING)], name="name"),
    ],
    "transactions": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("date", DESCENDING), ("created_at", DESCENDING)], name="date_created"),
        IndexModel([("warehouse_id", ASCENDING)], name="warehouse_id"),
        IndexModel([("target_warehouse_id", ASCENDING)], name="target_warehouse_id"),
        IndexModel([("supplier_id", ASCENDING)], name="supplier_id"),
    ],
    "bandul": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("warehouse_id", ASCENDING), ("nama", ASCENDING)], name="wh_nama")],
    "harga_jual": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("warehouse_id", ASCENDING)], name="wh")],
    "potongan_kuli": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("warehouse_id", ASCENDING)], name="wh")],
    "potongan_out": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("warehouse_id", ASCENDING)], name="wh")],
    "pembelian": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("warehouse_id", ASCENDING), ("tanggal_beli", DESCENDING), ("created_at", DESCENDING)], name="wh_date"),
        IndexModel([("warehouse_id", ASCENDING), ("nomor_kupon", ASCENDING)], name="wh_kupon"),
    ],
    "berat_koli": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("warehouse_id", ASCENDING), ("nomor_seri", ASCENDING)], name="wh_seri", unique=True),
    ],
    "penjualan": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("warehouse_id", ASCENDING), ("tanggal_jual", DESCENDING), ("created_at", DESCENDING)], name="wh_date"),
    ],
    "busai": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("warehouse_id", ASCENDING), ("nomor_seri", ASCENDING)], name="wh_seri", unique=True),
        IndexModel([("warehouse_id", ASCENDING), ("status", ASCENDING)], name="wh_status"),
    ],
    "kasir_prints": [IndexModel([("warehouse_id", ASCENDING), ("nomor_kupon", ASCENDING)], name="wh_kupon", unique=True)],
    "out_records": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("warehouse_id", ASCENDING), ("tanggal_out", DESCENDING), ("created_at", DESCENDING)], name="wh_date"),
        IndexModel([("warehouse_id", ASCENDING), ("nomor_jadi", ASCENDING)], name="wh_jadi"),
    ],
    "revisi_records": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("warehouse_id", ASCENDING), ("tanggal_revisi", DESCENDING), ("created_at", DESCENDING)], name="wh_date"),
        IndexModel([("warehouse_id", ASCENDING), ("nomor_jadi", ASCENDING)], name="wh_jadi"),
    ],
    "pembelian_drafts": [IndexModel([("user_id", ASCENDING)], name="user_id", unique=True)],
    "files": [IndexModel([("storage_path", ASCENDING)], name="storage_path")],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
