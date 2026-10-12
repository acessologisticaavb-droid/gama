import os
import re
import io
import uuid
import secrets
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pymongo import UpdateOne
from unidecode import unidecode
import pandas as pd

import auth as auth_lib
import bootstrap
from models import (
    LoginInput, ValidateKeyInput, ChangePasswordInput, CompanyCreate, CompanyAdminCreate,
    UserCreate, UserEdit, ProfileUpdate, PermissionUpdate, ProductIn, AddressIn, InvGroupIn, TriggerIn,
    InventoryCreate, RecordUpdate, now_iso,
)
import engine
import reports

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("gama")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="GAMA")
api = APIRouter(prefix="/api")

MAX_ATTEMPTS = 5
LOCK_MINUTES = 15


# ======================= Helpers =======================
def oid(v):
    try:
        return ObjectId(v)
    except Exception:
        raise HTTPException(status_code=400, detail="Identificador inválido.")


def public_user(u: dict) -> dict:
    return {
        "id": str(u["_id"]),
        "username": u.get("username"),
        "nome": u.get("nome"),
        "funcao": u.get("funcao", ""),
        "role": u.get("role"),
        "company_id": u.get("company_id"),
        "validated": u.get("validated", False),
        "must_change_password": u.get("must_change_password", False),
        "permissions": u.get("permissions", {}),
        "email": u.get("email"),
        "foto": u.get("foto"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            token = header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado.")
    try:
        payload = auth_lib.decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token inválido.")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não encontrado.")
        return user
    except auth_lib.jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessão expirada.")
    except auth_lib.jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido.")


async def require_validated(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") == "system_admin":
        return user
    if not user.get("validated"):
        raise HTTPException(status_code=403, detail="Empresa não validada.")
    return user


def is_admin(user) -> bool:
    return user.get("role") in ("system_admin", "company_admin")


def check_perm(user, module, submodule, perm):
    if is_admin(user):
        return
    perms = (user.get("permissions") or {}).get(module, {}).get(submodule, [])
    if perm not in perms and "administrar" not in perms:
        raise HTTPException(status_code=403, detail="Sem permissão para esta operação.")


def company_scope(user) -> str:
    cid = user.get("company_id")
    if not cid:
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada.")
    return cid


def set_auth_cookies(response: Response, user_id: str, username: str):
    access = auth_lib.create_access_token(user_id, username)
    refresh = auth_lib.create_refresh_token(user_id)
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=604800, path="/")


# ======================= Auth =======================
@api.post("/auth/login")
async def login(body: LoginInput, request: Request, response: Response):
    username = body.username.strip().lower()
    ident = username
    attempt = await db.login_attempts.find_one({"identifier": ident})
    if attempt and attempt.get("count", 0) >= MAX_ATTEMPTS:
        locked = attempt.get("locked_until")
        if locked and datetime.fromisoformat(locked) > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Muitas tentativas. Tente novamente mais tarde.")
    user = await db.users.find_one({"username": username})
    if not user or not auth_lib.verify_password(body.password, user["password_hash"]):
        cnt = (attempt.get("count", 0) if attempt else 0) + 1
        upd = {"count": cnt}
        if cnt >= MAX_ATTEMPTS:
            upd["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOCK_MINUTES)).isoformat()
        await db.login_attempts.update_one({"identifier": ident}, {"$set": upd}, upsert=True)
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos.")
    await db.login_attempts.delete_one({"identifier": ident})
    set_auth_cookies(response, str(user["_id"]), username)
    await audit(user.get("company_id"), user, "Login", "auth")
    return public_user(user)


@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)
