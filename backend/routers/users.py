import re
import uuid

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import hash_password, now_iso, require_admin
from lib.db import db
from models.schemas import UserCreate, UserPublic, UserUpdate

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(require_admin)])

USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,40}$")


def _clean_username(raw: str) -> str:
    u = raw.strip().lower()
    if not USERNAME_RE.match(u):
        raise HTTPException(status_code=400, detail="Username 3-40 karakter: huruf kecil, angka, titik, strip, atau garis bawah (tanpa spasi)")
    return u


async def _ensure_unique(username: str | None, name: str | None, exclude_id: str | None = None) -> None:
    ex = {"id": {"$ne": exclude_id}} if exclude_id else {}
    if username and await db.users.find_one({"username": username, **ex}):
        raise HTTPException(status_code=409, detail="Username sudah digunakan")
    if name and await db.users.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}, **ex}):
        raise HTTPException(status_code=409, detail="Nama sudah digunakan akun lain")


@router.get("", response_model=list[UserPublic])
async def list_users():
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(1000)
    return [UserPublic(**d) for d in docs]


@router.post("", response_model=UserPublic)
async def create_user(body: UserCreate):
    username, name = _clean_username(body.username), body.name.strip()
    await _ensure_unique(username, name)
    doc = {
        "id": str(uuid.uuid4()),
        "username": username,
        "name": name,
        "role": body.role,
        "permissions": [] if body.role == "admin" else sorted(set(body.permissions)),
        "warehouse_ids": [] if body.role == "admin" else list(dict.fromkeys(body.warehouse_ids)),
        "password_hash": hash_password(body.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(dict(doc))
    return UserPublic(**doc)


@router.patch("/{user_id}", response_model=UserPublic)
async def update_user(user_id: str, body: UserUpdate, admin: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    updates: dict = {}
    if body.username is not None:
        updates["username"] = _clean_username(body.username)
    if body.name is not None:
        updates["name"] = body.name.strip()
    await _ensure_unique(updates.get("username"), updates.get("name"), user_id)
    if body.role is not None and body.role != user["role"]:
        if user_id == admin["id"]:
            raise HTTPException(status_code=400, detail="Anda tidak dapat mengubah role akun sendiri")
        updates["role"] = body.role
    role = updates.get("role", user["role"])
    if role == "admin":
        updates["permissions"] = []
        updates["warehouse_ids"] = []
    else:
        if body.permissions is not None:
            updates["permissions"] = sorted(set(body.permissions))
        if body.warehouse_ids is not None:
            updates["warehouse_ids"] = list(dict.fromkeys(body.warehouse_ids))
    if body.password:
        updates["password_hash"] = hash_password(body.password)
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
    if ("password_hash" in updates or "role" in updates) and user_id != admin["id"]:
        await db.sessions.delete_many({"user_id": user_id})  # force re-login after reset / role change
    updates.pop("password_hash", None)
    user.update(updates)
    return UserPublic(**user)


@router.delete("/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Anda tidak dapat menghapus akun sendiri")
    res = await db.users.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    await db.sessions.delete_many({"user_id": user_id})
    return {"ok": True}
