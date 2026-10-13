"""Session-cookie auth: bcrypt passwords, opaque session tokens in Mongo, role checks."""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from passlib.context import CryptContext

from lib.db import db

COOKIE_NAME = "session"
SESSION_DAYS = 7

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _pwd.verify(password, hashed)
    except Exception:
        return False


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    await db.sessions.insert_one(
        {
            "token": token,
            "user_id": user_id,
            "expires_at": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
        }
    )
    return token


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Silakan login terlebih dahulu")
    session = await db.sessions.find_one({"token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Sesi tidak valid")
    expires = session["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        await db.sessions.delete_one({"token": token})
        raise HTTPException(status_code=401, detail="Sesi telah berakhir")
    # Re-read the user every request so role changes / deletion take effect immediately.
    user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Pengguna tidak ditemukan")
    return user


PERMISSIONS = [
    "stok", "masuk", "transfer", "pribadi", "riwayat", "gudang", "supplier",
    "harga", "bandul", "pembelian", "berat_koli", "kasir", "detail_koli",
    "dashboard", "penjualan", "laporan_penjualan", "busai", "detail_koli_cc", "sisa_stock",
    "out", "revisi",
]


def has_perm(user: dict, perm: str) -> bool:
    return user.get("role") == "admin" or perm in (user.get("permissions") or [])


def allowed_warehouses(user: dict) -> set[str] | None:
    """None = akses semua gudang (admin, atau staff tanpa pembatasan). Set = hanya id ini."""
    if user.get("role") == "admin":
        return None
    ids = user.get("warehouse_ids") or []
    return set(ids) if ids else None


def ensure_warehouse_allowed(user: dict, warehouse_id: str) -> None:
    allowed = allowed_warehouses(user)
    if allowed is not None and warehouse_id not in allowed:
        raise HTTPException(status_code=403, detail="Anda tidak memiliki akses ke gudang ini")


def require_any(*perms: str):
    """Dependency: the main admin always passes; staff need at least one of `perms`."""

    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if not any(has_perm(user, p) for p in perms):
            raise HTTPException(status_code=403, detail="Anda tidak memiliki akses ke fitur ini")
        return user

    return dep


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Hanya admin yang dapat melakukan aksi ini")
    return user
