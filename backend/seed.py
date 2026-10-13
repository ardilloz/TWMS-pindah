"""Idempotent seed: only the main admin account. Gudang, supplier, and stock start empty."""

import asyncio
import uuid

from lib.auth import hash_password, now_iso
from lib.db import db, ensure_indexes


async def main() -> None:
    await ensure_indexes()
    if not await db.users.find_one({"username": "admin"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "username": "admin", "name": "Admin Utama", "role": "admin",
            "permissions": [], "password_hash": hash_password("admin123"), "created_at": now_iso(),
        })
        print("seeded admin")


if __name__ == "__main__":
    asyncio.run(main())
