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


async def audit(company_id, user, action, module, record="", old="", new=""):
    await db.audit.insert_one({
        "company_id": company_id,
        "user_id": str(user["_id"]),
        "username": user.get("username"),
        "action": action,
        "module": module,
        "record": record,
        "old_value": str(old),
        "new_value": str(new),
        "timestamp": now_iso(),
    })


def gen_sigla(nome: str) -> str:
    words = [w for w in re.split(r"\s+", unidecode(nome).strip()) if w and w.lower() not in ("de", "do", "da", "dos", "das", "e")]
    if not words:
        return "EMP"
    if len(words) == 1:
        return words[0][:3].upper()
    return "".join(w[0] for w in words)[:4].upper()


def gen_company_key(nome: str) -> str:
    sigla = gen_sigla(nome)
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    code = "".join(secrets.choice(alphabet) for _ in range(6))
    return f"{sigla}-{code}"


def base_login(nome: str) -> str:
    parts = [p for p in re.split(r"\s+", unidecode(nome).strip().lower()) if p]
    if not parts:
        return "usuario"
    if len(parts) == 1:
        first, last = parts[0], ""
    else:
        first, last = parts[0], parts[-1]
    raw = f"{first}_{last}" if last else first
    raw = re.sub(r"[^a-z0-9_]", "", raw)
    return raw.strip("_") or "usuario"


async def unique_login(nome: str) -> str:
    base = base_login(nome)
    if not await db.users.find_one({"username": base}):
        return base
    i = 2
    while await db.users.find_one({"username": f"{base}{i}"}):
        i += 1
    return f"{base}{i}"


async def next_inventory_code(company_id: str) -> str:
    doc = await db.counters.find_one_and_update(
        {"company_id": company_id, "name": "inventory"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return f"INV-{doc['seq']:06d}"


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


@api.post("/auth/validate-key")
async def validate_key(body: ValidateKeyInput, user: dict = Depends(get_current_user)):
    if user.get("role") == "system_admin":
        raise HTTPException(status_code=400, detail="Administrador do sistema não requer validação.")
    cid = user.get("company_id")
    company = await db.companies.find_one({"_id": ObjectId(cid)}) if cid else None
    if not company:
        raise HTTPException(status_code=400, detail="Empresa não encontrada.")
    if body.key.strip().upper() != company["key"].upper():
        raise HTTPException(status_code=400, detail="Chave de empresa inválida.")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"validated": True, "validated_at": now_iso()}})
    await audit(cid, user, "Validação da empresa", "auth")
    u = await db.users.find_one({"_id": user["_id"]})
    return public_user(u)


@api.post("/auth/change-password")
async def change_password(body: ChangePasswordInput, user: dict = Depends(get_current_user)):
    if len(body.new_password) < 4:
        raise HTTPException(status_code=400, detail="A senha deve ter ao menos 4 caracteres.")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {
        "password_hash": auth_lib.hash_password(body.new_password), "must_change_password": False}})
    return {"ok": True}


@api.put("/auth/profile")
async def update_profile(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    # Users may change their own photo and cadastral "função" only — never permissions/role.
    data = body.model_dump(exclude_unset=True)
    upd = {}
    if "foto" in data:
        upd["foto"] = data["foto"]
    if "funcao" in data:
        upd["funcao"] = data["funcao"]
    if upd:
        await db.users.update_one({"_id": user["_id"]}, {"$set": upd})
    u = await db.users.find_one({"_id": user["_id"]})
    return public_user(u)


# ======================= Companies (system admin) =======================
def require_system_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "system_admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador do sistema.")
    return user


@api.post("/companies")
async def create_company(body: CompanyCreate, user: dict = Depends(require_system_admin)):
    if await db.companies.find_one({"cnpj": body.cnpj}):
        raise HTTPException(status_code=400, detail="Já existe empresa com este CNPJ.")
    key = gen_company_key(body.nome)
    while await db.companies.find_one({"key": key}):
        key = gen_company_key(body.nome)
    doc = body.model_dump()
    doc["key"] = key
    doc["created_at"] = now_iso()
    res = await db.companies.insert_one(doc)
    await audit(str(res.inserted_id), user, "Cadastro de empresa", "empresas", body.nome)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc


@api.get("/companies")
async def list_companies(user: dict = Depends(require_system_admin)):
    out = []
    async for c in db.companies.find():
        admins = await db.users.count_documents({"company_id": str(c["_id"]), "role": "company_admin"})
        users = await db.users.count_documents({"company_id": str(c["_id"])})
        out.append({"id": str(c["_id"]), "nome": c["nome"], "nome_fantasia": c.get("nome_fantasia"),
                    "cnpj": c["cnpj"], "ramo": c.get("ramo"), "logo": c.get("logo"),
                    "key": c["key"], "admins": admins, "users": users, "created_at": c.get("created_at")})
    return out


@api.get("/companies/{cid}")
async def get_company(cid: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "system_admin" and user.get("company_id") != cid:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    c = await db.companies.find_one({"_id": oid(cid)})
    if not c:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    data = {"id": str(c["_id"]), "nome": c["nome"], "nome_fantasia": c.get("nome_fantasia"),
            "cnpj": c["cnpj"], "ramo": c.get("ramo"), "logo": c.get("logo"), "created_at": c.get("created_at")}
    if user.get("role") in ("system_admin", "company_admin"):
        data["key"] = c["key"]
    return data


@api.get("/companies/{cid}/key")
async def get_company_key(cid: str, user: dict = Depends(get_current_user)):
    if user.get("role") == "system_admin" or (user.get("role") == "company_admin" and user.get("company_id") == cid):
        c = await db.companies.find_one({"_id": oid(cid)})
        if not c:
            raise HTTPException(status_code=404, detail="Empresa não encontrada.")
        return {"key": c["key"]}
    raise HTTPException(status_code=403, detail="Sem permissão para visualizar a chave.")


@api.put("/companies/{cid}")
async def update_company(cid: str, body: CompanyCreate, user: dict = Depends(require_system_admin)):
    await db.companies.update_one({"_id": oid(cid)}, {"$set": body.model_dump()})
    await audit(cid, user, "Edição de empresa", "empresas", body.nome)
    return {"ok": True}


@api.post("/companies/{cid}/admin")
async def create_company_admin(cid: str, body: CompanyAdminCreate, user: dict = Depends(require_system_admin)):
    c = await db.companies.find_one({"_id": oid(cid)})
    if not c:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    uname = body.login.strip().lower()
    if await db.users.find_one({"username": uname}):
        raise HTTPException(status_code=400, detail="Login já existente.")
    doc = {
        "username": uname, "password_hash": auth_lib.hash_password(body.senha),
        "nome": body.nome, "funcao": body.funcao, "role": "company_admin",
        "company_id": cid, "validated": False, "must_change_password": False,
        "permissions": {}, "active": True, "created_at": now_iso(),
    }
    res = await db.users.insert_one(doc)
    await audit(cid, user, "Criação de administrador da empresa", "usuarios", body.nome)
    return {"id": str(res.inserted_id), "username": uname}


@api.delete("/companies/{cid}")
async def delete_company(cid: str, confirm: str = Query(""), user: dict = Depends(require_system_admin)):
    c = await db.companies.find_one({"_id": oid(cid)})
    if not c:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    if confirm.strip() != c["nome"].strip():
        raise HTTPException(status_code=400, detail="Confirmação inválida: digite o nome exato da empresa.")
    # Cascade: remove all data owned exclusively by this company
    inv_ids = [str(i["_id"]) async for i in db.inventories.find({"company_id": cid}, {"_id": 1})]
    for coll in (db.inv_cutoff_rows, db.inv_physical_rows, db.inv_records):
        await coll.delete_many({"company_id": cid})
    if inv_ids:
        for coll in (db.inv_cutoff_rows, db.inv_physical_rows, db.inv_records):
            await coll.delete_many({"inventory_id": {"$in": inv_ids}})
    await db.inventories.delete_many({"company_id": cid})
    await db.products.delete_many({"company_id": cid})
    await db.addresses.delete_many({"company_id": cid})
    await db.inv_groups.delete_many({"company_id": cid})
    await db.triggers.delete_many({"company_id": cid})
    await db.counters.delete_many({"company_id": cid})
    await db.users.delete_many({"company_id": cid})
    await db.companies.delete_one({"_id": oid(cid)})
    await audit(cid, user, "Exclusão de empresa", "empresas", c["nome"], c.get("cnpj"), "excluída (cascata)")
    return {"ok": True, "message": "Empresa excluída com sucesso."}


# ======================= Users (company admin) =======================
def require_company_admin(user: dict = Depends(require_validated)):
    if user.get("role") not in ("company_admin",):
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador da empresa.")
    return user


@api.post("/users")
async def create_user(body: UserCreate, user: dict = Depends(require_company_admin)):
    cid = company_scope(user)
    login = await unique_login(body.nome)
    senha = body.senha or secrets.token_hex(3)
    doc = {
        "username": login, "password_hash": auth_lib.hash_password(senha),
        "nome": body.nome, "funcao": body.funcao, "role": "user", "company_id": cid,
        "validated": False, "must_change_password": True, "permissions": {},
        "active": True, "created_at": now_iso(),
    }
    res = await db.users.insert_one(doc)
    await audit(cid, user, "Criação de usuário", "usuarios", body.nome)
    return {"id": str(res.inserted_id), "username": login, "senha_inicial": senha}


@api.get("/users")
async def list_users(user: dict = Depends(require_company_admin)):
    cid = company_scope(user)
    out = []
    async for u in db.users.find({"company_id": cid}):
        out.append({"id": str(u["_id"]), "username": u["username"], "nome": u["nome"],
                    "funcao": u.get("funcao", ""), "role": u["role"], "validated": u.get("validated", False),
                    "active": u.get("active", True), "permissions": u.get("permissions", {}),
                    "foto": u.get("foto")})
    return out


@api.put("/users/{uid}/permissions")
async def update_permissions(uid: str, body: PermissionUpdate, user: dict = Depends(require_company_admin)):
    cid = company_scope(user)
    target = await db.users.find_one({"_id": oid(uid), "company_id": cid})
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    await db.users.update_one({"_id": oid(uid)}, {"$set": {"permissions": body.permissions}})
    await audit(cid, user, "Atualização de permissões", "usuarios", target["nome"], target.get("permissions"), body.permissions)
    return {"ok": True}


@api.put("/users/{uid}")
async def edit_user(uid: str, body: UserEdit, user: dict = Depends(require_company_admin)):
    cid = company_scope(user)
    target = await db.users.find_one({"_id": oid(uid), "company_id": cid})
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    upd = {}
    if body.nome is not None:
        upd["nome"] = body.nome
    if body.funcao is not None:
        upd["funcao"] = body.funcao
    if body.active is not None:
        upd["active"] = body.active
    if body.foto is not None:
        upd["foto"] = body.foto
    if body.permissions is not None:
        upd["permissions"] = body.permissions
    if body.senha:
        upd["password_hash"] = auth_lib.hash_password(body.senha)
        upd["must_change_password"] = True
    if upd:
        await db.users.update_one({"_id": oid(uid), "company_id": cid}, {"$set": upd})
    await audit(cid, user, "Edição de usuário", "usuarios", target["nome"])
    return {"ok": True}


@api.delete("/users/{uid}")
async def delete_user(uid: str, user: dict = Depends(require_company_admin)):
    cid = company_scope(user)
    target = await db.users.find_one({"_id": oid(uid), "company_id": cid})
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if target["role"] == "company_admin":
        raise HTTPException(status_code=400, detail="Não é possível excluir o administrador da empresa.")
    await db.users.delete_one({"_id": oid(uid)})
    await audit(cid, user, "Exclusão de usuário", "usuarios", target["nome"])
    return {"ok": True}


# ======================= Cadastros =======================
def _crud_out(doc):
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    doc.pop("company_id", None)
    return doc


@api.get("/products")
async def list_products(user: dict = Depends(require_validated), search: str = "", grupo: str = ""):
    cid = company_scope(user)
    q = {"company_id": cid}
    if search:
        q["$or"] = [{"cod_material": {"$regex": re.escape(search), "$options": "i"}},
                    {"descricao": {"$regex": re.escape(search), "$options": "i"}}]
    if grupo:
        q["grupo_produtos"] = grupo
    return [_crud_out(d) async for d in db.products.find(q).limit(2000)]


@api.post("/products")
async def create_product(body: ProductIn, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "cadastros", "criar")
    cid = company_scope(user)
    doc = body.model_dump()
    doc["company_id"] = cid
    res = await db.products.insert_one(doc)
    await audit(cid, user, "Criação de produto", "cadastros", body.cod_material)
    return _crud_out({**doc, "_id": res.inserted_id})


@api.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "cadastros", "editar")
    cid = company_scope(user)
    await db.products.update_one({"_id": oid(pid), "company_id": cid}, {"$set": body.model_dump()})
    return {"ok": True}


@api.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "cadastros", "excluir")
    cid = company_scope(user)
    await db.products.delete_one({"_id": oid(pid), "company_id": cid})
    await audit(cid, user, "Exclusão de produto", "cadastros", pid)
    return {"ok": True}


@api.post("/products/import")
async def import_products(user: dict = Depends(require_validated), file: UploadFile = File(...)):
    check_perm(user, "inventario", "cadastros", "importar")
    cid = company_scope(user)
    df = await _read_excel(file)
    cols, missing = engine.map_columns(list(df.columns), {
        "Cód. de Material": "cod_material", "Descrição Breve do Material": "descricao",
        "Grupo de Produtos": "grupo_produtos"})
    if missing:
        raise HTTPException(status_code=400, detail=f"Coluna obrigatória não encontrada: {missing[0]}")
    docs = []
    for _, row in df.iterrows():
        docs.append({"company_id": cid,
                     "cod_material": str(row[cols["cod_material"]]),
                     "descricao": str(row[cols["descricao"]]),
                     "grupo_produtos": str(row[cols["grupo_produtos"]])})
    if docs:
        await db.products.insert_many(docs)
    await audit(cid, user, "Importação de produtos", "cadastros", f"{len(docs)} registros")
    return {"imported": len(docs)}


@api.get("/addresses")
async def list_addresses(user: dict = Depends(require_validated)):
    cid = company_scope(user)
    return [_crud_out(d) async for d in db.addresses.find({"company_id": cid}).limit(2000)]


@api.post("/addresses")
async def create_address(body: AddressIn, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "cadastros", "criar")
    cid = company_scope(user)
    doc = {"company_id": cid, "nome_posicao": body.nome_posicao}
    res = await db.addresses.insert_one(doc)
    return _crud_out({**doc, "_id": res.inserted_id})


@api.delete("/addresses/{aid}")
async def delete_address(aid: str, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "cadastros", "excluir")
    cid = company_scope(user)
    await db.addresses.delete_one({"_id": oid(aid), "company_id": cid})
    return {"ok": True}


@api.get("/inv-groups")
async def list_groups(user: dict = Depends(require_validated)):
    cid = company_scope(user)
    return [_crud_out(d) async for d in db.inv_groups.find({"company_id": cid}).limit(500)]


@api.post("/inv-groups")
async def create_group(body: InvGroupIn, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "cadastros", "criar")
    cid = company_scope(user)
    doc = {"company_id": cid, "nome": body.nome}
    res = await db.inv_groups.insert_one(doc)
    return _crud_out({**doc, "_id": res.inserted_id})


@api.delete("/inv-groups/{gid}")
async def delete_group(gid: str, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "cadastros", "excluir")
    cid = company_scope(user)
    await db.inv_groups.delete_one({"_id": oid(gid), "company_id": cid})
    return {"ok": True}


@api.get("/triggers")
async def list_triggers(user: dict = Depends(require_validated), motivo: str = ""):
    cid = company_scope(user)
    q = {"company_id": cid}
    if motivo:
        q["motivo"] = motivo
    return [_crud_out(d) async for d in db.triggers.find(q).limit(500)]


@api.post("/triggers")
async def create_trigger(body: TriggerIn, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "cadastros", "criar")
    cid = company_scope(user)
    if body.motivo not in ("SKU faltante", "SKU fora do sistema"):
        raise HTTPException(status_code=400, detail="Motivo inválido.")
    doc = {"company_id": cid, "nome": body.nome, "motivo": body.motivo}
    res = await db.triggers.insert_one(doc)
    return _crud_out({**doc, "_id": res.inserted_id})


@api.delete("/triggers/{tid}")
async def delete_trigger(tid: str, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "cadastros", "excluir")
    cid = company_scope(user)
    await db.triggers.delete_one({"_id": oid(tid), "company_id": cid})
    return {"ok": True}


@api.get("/product-groups")
async def product_groups(user: dict = Depends(require_validated)):
    cid = company_scope(user)
    return sorted([g for g in await db.products.distinct("grupo_produtos", {"company_id": cid}) if g])


# ======================= Excel helpers =======================
async def _read_excel(file: UploadFile) -> pd.DataFrame:
    content = await file.read()
    try:
        return pd.read_excel(io.BytesIO(content), dtype=str, keep_default_na=False)
    except Exception:
        try:
            return pd.read_csv(io.BytesIO(content), dtype=str, keep_default_na=False)
        except Exception:
            raise HTTPException(status_code=400, detail="Não foi possível processar o arquivo. Verifique o formato (.xlsx).")


# ======================= Inventory =======================
async def _get_inventory(iid, cid):
    inv = await db.inventories.find_one({"_id": oid(iid), "company_id": cid})
    if not inv:
        raise HTTPException(status_code=404, detail="Inventário não encontrado.")
    return inv


def _inv_out(inv):
    return {"id": str(inv["_id"]), "codigo": inv["codigo"], "tipo": inv.get("tipo"),
            "grupo_produtos": inv.get("grupo_produtos"), "data": inv.get("data"),
            "periodo": inv.get("periodo"), "status": inv.get("status"),
            "qtd_uds": inv.get("qtd_uds", 0), "pendencias": inv.get("pendencias", 0),
            "acuracidade": inv.get("acuracidade", 0), "has_cutoff": inv.get("has_cutoff", False),
            "has_physical": inv.get("has_physical", False), "created_at": inv.get("created_at"),
            "created_by": inv.get("created_by")}


@api.post("/inventories")
async def create_inventory(body: InventoryCreate, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "lancamentos", "criar")
    cid = company_scope(user)
    data = body.data or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        dt = datetime.fromisoformat(data)
        periodo = body.periodo or dt.strftime("%m/%Y")
    except Exception:
        periodo = body.periodo or datetime.now(timezone.utc).strftime("%m/%Y")
    code = await next_inventory_code(cid)
    doc = {"company_id": cid, "codigo": code, "tipo": body.tipo, "grupo_produtos": body.grupo_produtos,
           "data": data, "periodo": periodo, "status": "Planejado", "qtd_uds": 0, "pendencias": 0,
           "acuracidade": 0, "has_cutoff": False, "has_physical": False,
           "created_by": user.get("username"), "created_at": now_iso()}
    res = await db.inventories.insert_one(doc)
    await audit(cid, user, "Criação de inventário", "lancamentos", code)
    return _inv_out({**doc, "_id": res.inserted_id})


@api.get("/inventories")
async def list_inventories(user: dict = Depends(require_validated)):
    cid = company_scope(user)
    return [_inv_out(inv) async for inv in db.inventories.find({"company_id": cid}).sort("created_at", -1)]


@api.get("/inventories/{iid}")
async def get_inventory(iid: str, user: dict = Depends(require_validated)):
    cid = company_scope(user)
    return _inv_out(await _get_inventory(iid, cid))


@api.delete("/inventories/{iid}")
async def delete_inventory(iid: str, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "lancamentos", "excluir")
    cid = company_scope(user)
    inv = await _get_inventory(iid, cid)
    await db.inventories.delete_one({"_id": oid(iid)})
    for coll in (db.inv_cutoff_rows, db.inv_physical_rows, db.inv_records):
        await coll.delete_many({"inventory_id": iid})
    await audit(cid, user, "Exclusão de inventário", "lancamentos", inv["codigo"])
    return {"ok": True}


@api.post("/inventories/{iid}/import-cutoff")
async def import_cutoff(iid: str, commit: bool = Query(False), user: dict = Depends(require_validated), file: UploadFile = File(...)):
    check_perm(user, "inventario", "lancamentos", "importar")
    cid = company_scope(user)
    inv = await _get_inventory(iid, cid)
    df = await _read_excel(file)
    cols, missing = engine.map_columns(list(df.columns), engine.CUTOFF_COLUMNS)
    if missing:
        return {"valid": False, "missing": missing,
                "message": f"Coluna obrigatória não encontrada: {missing[0]}", "total": 0}
    rows = []
    for _, row in df.iterrows():
        rec = {sys: str(row[orig]) for sys, orig in cols.items()}
        rec["peso"] = engine.compute_peso(rec.get("um"), rec.get("peso_bruto"), rec.get("estoque_disponivel"))
        rows.append(rec)
    preview = [{k: r.get(k) for k in list(cols.keys()) + ["peso"]} for r in rows[:10]]
    if not commit:
        return {"valid": True, "total": len(rows), "preview": preview,
                "message": f"Arquivo validado com sucesso. {len(rows)} registros encontrados."}
    await db.inv_cutoff_rows.delete_many({"inventory_id": iid})
    for r in rows:
        r["inventory_id"] = iid
        r["company_id"] = cid
    if rows:
        await db.inv_cutoff_rows.insert_many(rows)
    await db.inventories.update_one({"_id": oid(iid)}, {"$set": {
        "has_cutoff": True, "qtd_uds": len(rows), "status": "Em andamento",
        "cutoff_file": file.filename, "cutoff_imported_at": now_iso()}})
    await db.inv_records.delete_many({"inventory_id": iid})
    await audit(cid, user, "Importação Ponto de Corte", "lancamentos", inv["codigo"], "", f"{len(rows)} registros")
    return {"valid": True, "total": len(rows), "imported": len(rows), "message": "Importação concluída."}


@api.post("/inventories/{iid}/import-physical")
async def import_physical(iid: str, commit: bool = Query(False), user: dict = Depends(require_validated), file: UploadFile = File(...)):
    check_perm(user, "inventario", "lancamentos", "importar")
    cid = company_scope(user)
    inv = await _get_inventory(iid, cid)
    if not inv.get("has_cutoff"):
        raise HTTPException(status_code=400, detail="Importe o Ponto de Corte antes da Coleta Física.")
    df = await _read_excel(file)
    cols, missing = engine.map_columns(list(df.columns), engine.PHYSICAL_COLUMNS)
    if missing:
        return {"valid": False, "missing": missing,
                "message": "Arquivo inválido. As colunas Cód. de Barras e Posição Física são obrigatórias.", "total": 0}
    rows = []
    for _, row in df.iterrows():
        barcode = str(row[cols["cod_barras"]])
        rows.append({"cod_barras": barcode, "pos_fisica": str(row[cols["pos_fisica"]]),
                     "sku_fisico": engine.sku_fisico_from_barcode(barcode)})
    if not commit:
        return {"valid": True, "total": len(rows), "preview": rows[:10],
                "message": f"Arquivo validado com sucesso. {len(rows)} registros encontrados."}
    for r in rows:
        r["inventory_id"] = iid
        r["company_id"] = cid
    await db.inv_physical_rows.delete_many({"inventory_id": iid})
    if rows:
        await db.inv_physical_rows.insert_many(rows)
    await _process_validation(iid, cid, user)
    await audit(cid, user, "Importação Coleta Física", "lancamentos", inv["codigo"], "", f"{len(rows)} registros")
    return {"valid": True, "total": len(rows), "imported": len(rows), "message": "Coleta importada e validada."}


async def _process_validation(iid, cid, user):
    cutoff = [dict(r) async for r in db.inv_cutoff_rows.find({"inventory_id": iid})]
    physical = [dict(r) async for r in db.inv_physical_rows.find({"inventory_id": iid})]

    # Build lookups for cross-validation / enrichment
    cutoff_by_sku = {}
    for c in cutoff:
        sku = _norm_sku(c.get("sku_sistema", ""))
        if sku and sku not in cutoff_by_sku:
            cutoff_by_sku[sku] = c
    physical_sku_set = {_norm_sku(p.get("sku_fisico", "")) for p in physical}

    # Ponto de Corte: Validação do SKU
    cut_ops = []
    for c in cutoff:
        sku = _norm_sku(c.get("sku_sistema", ""))
        val = "SKU no fisico" if sku in physical_sku_set else "SKU faltante"
        cut_ops.append(UpdateOne({"_id": c["_id"]}, {"$set": {"validacao_sku": val}}))
    if cut_ops:
        await db.inv_cutoff_rows.bulk_write(cut_ops)

    # Coleta Física: complementação automática a partir do Ponto de Corte
    FORA = "SKU fora do sistema"
    phy_ops = []
    for p in physical:
        skuf = _norm_sku(p.get("sku_fisico", ""))
        c = cutoff_by_sku.get(skuf)
        if c:
            enr = {"cod_material": str(c.get("cod_material", "")), "descricao": str(c.get("descricao", "")),
                   "lote": str(c.get("lote", "")), "pos_sistema": str(c.get("pos_sistema", "")),
                   "dias_estoque": str(c.get("dias_estoque", "")), "peso": c.get("peso", 0)}
        else:
            enr = {"cod_material": FORA, "descricao": FORA, "lote": FORA,
                   "pos_sistema": FORA, "dias_estoque": FORA, "peso": FORA}
        phy_ops.append(UpdateOne({"_id": p["_id"]}, {"$set": enr}))
    if phy_ops:
        await db.inv_physical_rows.bulk_write(phy_ops)

    records, counters = engine.run_validation(cutoff, physical)
    for r in records:
        r["inventory_id"] = iid
        r["company_id"] = cid
    await db.inv_records.delete_many({"inventory_id": iid})
    if records:
        await db.inv_records.insert_many(records)
    pend = counters["faltantes"] + counters["fora_sistema"] + counters["duplicadas"] + counters["sem_etiqueta"]
    acuracidade = round((counters["contagem_ok"] / counters["cutoff_total"] * 100), 1) if counters["cutoff_total"] else 0
    await db.inventories.update_one({"_id": oid(iid)}, {"$set": {
        "has_physical": True, "pendencias": pend, "acuracidade": acuracidade}})
    await _recompute_status(iid)


async def _recompute_status(iid):
    """Status é consequência automática do estado das pendências — nunca manual."""
    inv = await db.inventories.find_one({"_id": oid(iid)})
    if not inv or not inv.get("has_physical"):
        return
    pend_open = await db.inv_records.count_documents(
        {"inventory_id": iid, "is_pendencia": True, "resolucao_status": {"$ne": "Concluído"}})
    status = "Concluído" if pend_open == 0 else "Com pendências"
    await db.inventories.update_one({"_id": oid(iid)}, {"$set": {"status": status}})


def _proj(d):
    d = dict(d)
    d.pop("_id", None)
    d.pop("company_id", None)
    return d


def _norm_sku(v):
    """Normalize a SKU for cross-matching: trim and drop trailing '.0' from numeric reads."""
    s = str(v if v is not None else "").strip()
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    return s


@api.get("/inventories/{iid}/cutoff")
async def get_cutoff(iid: str, user: dict = Depends(require_validated), skip: int = 0, limit: int = 50, search: str = ""):
    cid = company_scope(user)
    await _get_inventory(iid, cid)
    q = {"inventory_id": iid}
    if search:
        q["$or"] = [{"cod_material": {"$regex": re.escape(search), "$options": "i"}},
                    {"sku_sistema": {"$regex": re.escape(search), "$options": "i"}},
                    {"descricao": {"$regex": re.escape(search), "$options": "i"}}]
    total = await db.inv_cutoff_rows.count_documents(q)
    rows = [_proj(r) async for r in db.inv_cutoff_rows.find(q).skip(skip).limit(min(limit, 200))]
    return {"total": total, "rows": rows}


@api.get("/inventories/{iid}/physical")
async def get_physical(iid: str, user: dict = Depends(require_validated), skip: int = 0, limit: int = 50):
    cid = company_scope(user)
    await _get_inventory(iid, cid)
    # Ponto de Corte é a fonte única: enriquecemos a Coleta Física em tempo de leitura,
    # cruzando exclusivamente SKU Físico == Unidade de depósito / SKU Sistema do MESMO inventário.
    cutoff_by_sku = {}
    async for c in db.inv_cutoff_rows.find({"inventory_id": iid}):
        sku = _norm_sku(c.get("sku_sistema"))
        if sku and sku not in cutoff_by_sku:
            cutoff_by_sku[sku] = c
    FORA = "SKU fora do sistema"
    enrich_keys = ["cod_material", "descricao", "lote", "pos_sistema", "dias_estoque", "peso"]
    q = {"inventory_id": iid}
    total = await db.inv_physical_rows.count_documents(q)
    rows = []
    async for p in db.inv_physical_rows.find(q).skip(skip).limit(min(limit, 500)):
        row = _proj(p)
        c = cutoff_by_sku.get(_norm_sku(row.get("sku_fisico")))
        if c:
            row["cod_material"] = str(c.get("cod_material", ""))
            row["descricao"] = str(c.get("descricao", ""))
            row["lote"] = str(c.get("lote", ""))
            row["pos_sistema"] = str(c.get("pos_sistema", ""))
            row["dias_estoque"] = c.get("dias_estoque", "")
            row["peso"] = c.get("peso", 0)
        else:
            for k in enrich_keys:
                row[k] = FORA
        rows.append(row)
    return {"total": total, "rows": rows}


@api.get("/inventories/{iid}/records")
async def get_records(iid: str, user: dict = Depends(require_validated), status: str = "", gatilho: str = "", skip: int = 0, limit: int = 100):
    cid = company_scope(user)
    await _get_inventory(iid, cid)
    q = {"inventory_id": iid}
    if gatilho:
        q["gatilho"] = gatilho
        q["status_inventario"] = {"$in": [engine.STATUS_FALTANTE, engine.STATUS_FORA]}
    elif status:
        q["status_inventario"] = status
        if status in (engine.STATUS_FALTANTE, engine.STATUS_FORA):
            q["gatilho"] = ""
    total = await db.inv_records.count_documents(q)
    rows = [_proj(r) async for r in db.inv_records.find(q).skip(skip).limit(min(limit, 500))]
    return {"total": total, "rows": rows}


@api.get("/inventories/{iid}/pendencia-tabs")
async def pendencia_tabs(iid: str, user: dict = Depends(require_validated)):
    cid = company_scope(user)
    await _get_inventory(iid, cid)
    base = {}
    for st in [engine.STATUS_FALTANTE, engine.STATUS_FORA]:
        c = await db.inv_records.count_documents({"inventory_id": iid, "status_inventario": st, "gatilho": ""})
        if c > 0:
            base[st] = c
    for st in [engine.STATUS_DUPLICADA, engine.STATUS_SEM_ETIQUETA]:
        c = await db.inv_records.count_documents({"inventory_id": iid, "status_inventario": st})
        if c > 0:
            base[st] = c
    gatilhos = {}
    async for g in db.inv_records.aggregate([
        {"$match": {"inventory_id": iid, "status_inventario": {"$in": [engine.STATUS_FALTANTE, engine.STATUS_FORA]}, "gatilho": {"$ne": ""}}},
        {"$group": {"_id": "$gatilho", "count": {"$sum": 1}}}]):
        if g["_id"]:
            gatilhos[g["_id"]] = g["count"]
    return {"base": base, "gatilhos": gatilhos}


@api.put("/records/{rid}")
async def update_record(rid: str, body: RecordUpdate, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "pendencias", "editar")
    cid = company_scope(user)
    rec = await db.inv_records.find_one({"rid": rid, "company_id": cid})
    if not rec:
        raise HTTPException(status_code=404, detail="Registro não encontrado.")
    upd = {}
    if body.gatilho is not None:
        upd["gatilho"] = body.gatilho
    if body.resolucao is not None:
        upd["resolucao"] = body.resolucao
    if body.resolucao_status is not None:
        upd["resolucao_status"] = body.resolucao_status
        if body.resolucao_status == "Concluído":
            upd["data_resolucao"] = now_iso()
            upd["concluido_por"] = user.get("nome")
        else:
            upd["data_resolucao"] = None
            upd["concluido_por"] = ""
    await db.inv_records.update_one({"rid": rid}, {"$set": upd})
    await _recompute_status(rec["inventory_id"])
    inv = await db.inventories.find_one({"_id": oid(rec["inventory_id"])})
    await audit(cid, user, "Atualização de pendência", "pendencias",
                f"{inv['codigo']} / {rec.get('sku_fisico') or rec.get('sku_sistema')}", rec.get("resolucao_status"), upd)
    return {"ok": True}


@api.delete("/records/{rid}")
async def delete_record(rid: str, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "pendencias", "excluir")
    cid = company_scope(user)
    rec = await db.inv_records.find_one({"rid": rid, "company_id": cid})
    if not rec:
        raise HTTPException(status_code=404, detail="Registro não encontrado.")
    await db.inv_records.delete_one({"rid": rid})
    await _recompute_status(rec["inventory_id"])
    await audit(cid, user, "Exclusão de registro", "pendencias", rid)
    return {"ok": True}


async def _compute_kpis(iid):
    async def cnt(st):
        return await db.inv_records.count_documents({"inventory_id": iid, "status_inventario": st})
    cutoff_total = await db.inv_cutoff_rows.count_documents({"inventory_id": iid})
    physical_total = await db.inv_physical_rows.count_documents({"inventory_id": iid})
    contagem_ok = await cnt(engine.STATUS_OK)
    faltantes = await cnt(engine.STATUS_FALTANTE)
    fora = await cnt(engine.STATUS_FORA)
    dup = await cnt(engine.STATUS_DUPLICADA)
    sem = await cnt(engine.STATUS_SEM_ETIQUETA)
    pos_ok = await db.inv_records.count_documents({"inventory_id": iid, "validacao_posicao": "POSIÇÃO CORRETA"})
    pos_err = await db.inv_records.count_documents({"inventory_id": iid, "validacao_posicao": "POSIÇÃO ERRADA"})
    perc_pos = round(pos_ok / physical_total * 100, 1) if physical_total else 0
    perc_acc = round(contagem_ok / cutoff_total * 100, 1) if cutoff_total else 0
    return {"cutoff_total": cutoff_total, "physical_total": physical_total, "contagem_ok": contagem_ok,
            "faltantes": faltantes, "fora_sistema": fora, "duplicadas": dup, "sem_etiqueta": sem,
            "posicao_correta": pos_ok, "posicao_errada": pos_err, "perc_posicao": perc_pos,
            "perc_acuracidade": perc_acc}


async def _trigger_kpis(iid):
    pipeline = [{"$match": {"inventory_id": iid, "is_pendencia": True, "gatilho": {"$ne": ""}}},
                {"$group": {"_id": "$gatilho", "count": {"$sum": 1}}}]
    out = {}
    async for g in db.inv_records.aggregate(pipeline):
        out[g["_id"]] = g["count"]
    return out


@api.get("/inventories/{iid}/dashboard")
async def inventory_dashboard(iid: str, user: dict = Depends(require_validated)):
    cid = company_scope(user)
    await _get_inventory(iid, cid)
    kpis = await _compute_kpis(iid)
    triggers = await _trigger_kpis(iid)
    pend_status = {"Pendente": await db.inv_records.count_documents({"inventory_id": iid, "is_pendencia": True, "resolucao_status": "Pendente"}),
                   "Concluído": await db.inv_records.count_documents({"inventory_id": iid, "is_pendencia": True, "resolucao_status": "Concluído"})}
    return {"kpis": kpis, "trigger_kpis": triggers, "pend_status": pend_status}


@api.get("/inventories/{iid}/resumo-material")
async def resumo_material(iid: str, user: dict = Depends(require_validated)):
    cid = company_scope(user)
    await _get_inventory(iid, cid)
    return await _resumo_material_data(iid)


async def _resumo_material_data(iid):
    sis = {}
    async for g in db.inv_cutoff_rows.aggregate([{"$match": {"inventory_id": iid}},
            {"$group": {"_id": "$cod_material", "qtd": {"$sum": 1}, "descricao": {"$first": "$descricao"}}}]):
        sis[g["_id"]] = {"qtd": g["qtd"], "descricao": g.get("descricao", "")}
    fis = {}
    async for g in db.inv_records.aggregate([{"$match": {"inventory_id": iid, "status_inventario": engine.STATUS_OK}},
            {"$group": {"_id": "$cod_material", "qtd": {"$sum": 1}}}]):
        fis[g["_id"]] = g["qtd"]
    out = []
    for mat, info in sis.items():
        qs = info["qtd"]
        qf = fis.get(mat, 0)
        acc = round(qf / qs * 100, 1) if qs else 0
        out.append({"cod_material": mat, "descricao": info["descricao"], "qtd_sistema": qs,
                    "qtd_fisica": qf, "acuracidade": acc})
    out.sort(key=lambda x: x["acuracidade"])
    return out


@api.get("/inventories/{iid}/dados-gerais")
async def dados_gerais(iid: str, user: dict = Depends(require_validated), skip: int = 0, limit: int = 100):
    cid = company_scope(user)
    await _get_inventory(iid, cid)
    total = await db.inv_records.count_documents({"inventory_id": iid})
    sd = {"CONTAGEM OK": "SKU no fisico", "SKU FALTANTE": "SKU faltante",
          "SKU FORA DO SISTEMA": "SKU fora do sistema", "UD DUPLICADA": "UD duplicada",
          "SEM ETIQUETA": "Sem etiqueta"}
    rows = []
    async for r in db.inv_records.find({"inventory_id": iid}).skip(skip).limit(min(limit, 500)):
        row = _proj(r)
        row["status_dados"] = sd.get(row.get("status_inventario"), row.get("status_inventario"))
        rows.append(row)
    return {"total": total, "rows": rows}


@api.get("/inventories/{iid}/export-excel")
async def export_excel(iid: str, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "dados_gerais", "exportar")
    cid = company_scope(user)
    inv = await _get_inventory(iid, cid)
    company = await db.companies.find_one({"_id": oid(cid)})
    records = [dict(r) async for r in db.inv_records.find({"inventory_id": iid})]
    data = reports.build_excel(company, _inv_out(inv), records)
    await audit(cid, user, "Exportação Excel", "dados_gerais", inv["codigo"])
    return StreamingResponse(io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{inv["codigo"]}.xlsx"'})


@api.get("/inventories/{iid}/report-pdf")
async def report_pdf(iid: str, user: dict = Depends(require_validated)):
    check_perm(user, "inventario", "relatorios", "exportar")
    cid = company_scope(user)
    inv = await _get_inventory(iid, cid)
    company = await db.companies.find_one({"_id": oid(cid)})
    kpis = await _compute_kpis(iid)
    resumo = await _resumo_material_data(iid)
    triggers = await _trigger_kpis(iid)
    pend = [dict(r) async for r in db.inv_records.find({"inventory_id": iid, "is_pendencia": True}).limit(100)]
    data = reports.build_pdf(company, _inv_out(inv), kpis, resumo, pend, triggers)
    await audit(cid, user, "Geração de relatório PDF", "relatorios", inv["codigo"])
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{inv["codigo"]}.pdf"'})


# ======================= Pendências globais =======================
@api.get("/pendencias")
async def global_pendencias(user: dict = Depends(require_validated), status_resolucao: str = "", gatilho: str = "", tipo: str = "", search: str = ""):
    cid = company_scope(user)
    q = {"company_id": cid, "is_pendencia": True}
    if status_resolucao:
        q["resolucao_status"] = status_resolucao
    if gatilho:
        q["gatilho"] = gatilho
    inv_map = {}
    async for inv in db.inventories.find({"company_id": cid}):
        inv_map[str(inv["_id"])] = inv
    s = search.strip().lower()
    out = []
    async for r in db.inv_records.find(q).limit(5000):
        inv = inv_map.get(r["inventory_id"], {})
        if tipo and inv.get("tipo") != tipo:
            continue
        data_inv = inv.get("data")
        dias = ""
        try:
            base = datetime.fromisoformat(data_inv)
            end = datetime.fromisoformat(r["data_resolucao"]).replace(tzinfo=None) if r.get("data_resolucao") else datetime.now(timezone.utc).replace(tzinfo=None)
            dias = (end - base).days
        except Exception:
            dias = ""
        item = {"rid": r["rid"], "codigo": inv.get("codigo"), "data_inventario": data_inv,
                "tipo": inv.get("tipo"), "grupo_produtos": inv.get("grupo_produtos"),
                "cod_material": r.get("cod_material"), "descricao": r.get("descricao"),
                "sku": r.get("sku_fisico") or r.get("sku_sistema"), "lote": r.get("lote"),
                "gatilho": r.get("gatilho"), "motivo": r.get("motivo"), "resolucao": r.get("resolucao"),
                "status": r.get("resolucao_status"), "status_inventario": r.get("status_inventario"),
                "data_resolucao": r.get("data_resolucao"), "concluido_por": r.get("concluido_por", ""),
                "dias_pendencia": dias}
        if s:
            hay = " ".join(str(v or "") for v in [item["codigo"], item["cod_material"], item["descricao"],
                           item["sku"], item["lote"], item["gatilho"], item["resolucao"],
                           item["concluido_por"], item["status"], item["status_inventario"]]).lower()
            if s not in hay:
                continue
        out.append(item)
    return out


@api.get("/classificacoes")
async def classificacoes(user: dict = Depends(require_validated)):
    cid = company_scope(user)
    vals = await db.inv_records.distinct("gatilho", {"company_id": cid, "is_pendencia": True, "gatilho": {"$ne": ""}})
    return sorted([v for v in vals if v])


# ======================= GAMA Dashboard =======================
@api.get("/dashboard")
async def gama_dashboard(user: dict = Depends(require_validated)):
    cid = company_scope(user)
    em_andamento = await db.inventories.count_documents({"company_id": cid, "status": {"$in": ["Em andamento", "Em validação", "Com pendências"]}})
    concluidos = await db.inventories.count_documents({"company_id": cid, "status": "Concluído"})
    pend_abertas = await db.inv_records.count_documents({"company_id": cid, "is_pendencia": True, "resolucao_status": "Pendente"})
    total_uds = 0
    accs = []
    async for inv in db.inventories.find({"company_id": cid}):
        total_uds += inv.get("qtd_uds", 0)
        if inv.get("has_physical"):
            accs.append(inv.get("acuracidade", 0))
    acc_media = round(sum(accs) / len(accs), 1) if accs else 0
    recent = [_inv_out(inv) async for inv in db.inventories.find({"company_id": cid}).sort("created_at", -1).limit(6)]
    return {"em_andamento": em_andamento, "concluidos": concluidos, "pendencias_abertas": pend_abertas,
            "acuracidade_media": acc_media, "total_uds": total_uds, "recentes": recent}


# ======================= Audit =======================
@api.get("/audit")
async def get_audit(user: dict = Depends(require_validated), limit: int = 200):
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Acesso restrito.")
    cid = company_scope(user) if user.get("role") != "system_admin" else None
    q = {} if cid is None else {"company_id": cid}
    out = []
    async for a in db.audit.find(q).sort("timestamp", -1).limit(min(limit, 500)):
        a["id"] = str(a.pop("_id"))
        out.append(a)
    return out


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("username", unique=True)
    await db.companies.create_index("key", unique=True)
    await db.companies.create_index("cnpj", unique=True)
    for coll in ("inv_cutoff_rows", "inv_physical_rows", "inv_records"):
        await db[coll].create_index("inventory_id")
    await db.inv_records.create_index("rid")
    await db.inv_records.create_index([("company_id", 1), ("is_pendencia", 1)])
    await db.audit.create_index([("company_id", 1), ("timestamp", -1)])
    uname = os.environ.get("ADMIN_USERNAME", "admin")
    pwd = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"username": uname})
    if not existing:
        await db.users.insert_one({
            "username": uname, "password_hash": auth_lib.hash_password(pwd),
            "nome": "Administrador do Sistema", "funcao": "Administrador Global",
            "role": "system_admin", "company_id": None, "validated": True,
            "must_change_password": False, "permissions": {}, "active": True,
            "email": os.environ.get("ADMIN_EMAIL"), "created_at": now_iso()})
        logger.info("System admin seeded.")
    elif not auth_lib.verify_password(pwd, existing["password_hash"]):
        await db.users.update_one({"username": uname}, {"$set": {"password_hash": auth_lib.hash_password(pwd)}})
    # Additional named system administrator
    alan = await db.users.find_one({"username": "alan_teixeira"})
    if not alan:
        await db.users.insert_one({
            "username": "alan_teixeira", "password_hash": auth_lib.hash_password("ifma2013"),
            "nome": "Alan Teixeira", "funcao": "Administrador do Sistema",
            "role": "system_admin", "company_id": None, "validated": True,
            "must_change_password": False, "permissions": {}, "active": True,
            "created_at": now_iso()})
        logger.info("System admin 'alan_teixeira' seeded.")
    elif alan.get("role") != "system_admin":
        await db.users.update_one({"username": "alan_teixeira"}, {"$set": {"role": "system_admin", "company_id": None, "validated": True}})


@app.on_event("shutdown")
async def shutdown():
    client.close()
