from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.auth import COOKIE_NAME, SESSION_DAYS, create_session, get_current_user, verify_password
from lib.db import db
from models.schemas import LoginIn, UserPublic

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserPublic)
async def login(body: LoginIn, response: Response):
    user = await db.users.find_one({"username": body.username.strip().lower()}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Username atau password salah")
    token = await create_session(user["id"])
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_DAYS * 86400,
        path="/",
    )
    return UserPublic(**user)


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        await db.sessions.delete_one({"token": token})
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return UserPublic(**user)
