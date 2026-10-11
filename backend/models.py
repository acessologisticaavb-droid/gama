from datetime import datetime, timezone
from typing import Optional, List, Any, Annotated
from bson import ObjectId
from pydantic import BaseModel, Field, BeforeValidator, ConfigDict


def _to_str_id(v: Any) -> Any:
    if isinstance(v, ObjectId):
        return str(v)
    return v


PyObjectId = Annotated[str, BeforeValidator(_to_str_id)]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    @classmethod
    def from_mongo(cls, doc: dict):
        if not doc:
            return None
        return cls(**doc)

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=True, exclude_none=True)
        d.pop("_id", None)
        return d


# ---------- Auth / Users ----------
class LoginInput(BaseModel):
    username: str
    password: str


class ValidateKeyInput(BaseModel):
    key: str


class ChangePasswordInput(BaseModel):
    new_password: str


class CompanyCreate(BaseModel):
    nome: str
    nome_fantasia: str
    cnpj: str
    ramo: str
    logo: Optional[str] = None


class CompanyAdminCreate(BaseModel):
    nome: str
    funcao: str
    login: str
    senha: str


class UserCreate(BaseModel):
    nome: str
    funcao: str
    senha: Optional[str] = None


class UserEdit(BaseModel):
    nome: Optional[str] = None
    funcao: Optional[str] = None
    senha: Optional[str] = None
    active: Optional[bool] = None
    foto: Optional[str] = None
    permissions: Optional[dict] = None


class ProfileUpdate(BaseModel):
    foto: Optional[str] = None


class PermissionUpdate(BaseModel):
    permissions: dict


# ---------- Cadastros ----------
class ProductIn(BaseModel):
    cod_material: str
    descricao: str
    grupo_produtos: str


class AddressIn(BaseModel):
    nome_posicao: str


class InvGroupIn(BaseModel):
    nome: str


class TriggerIn(BaseModel):
    nome: str
    motivo: str  # "SKU faltante" | "SKU fora do sistema"


# ---------- Inventory ----------
class InventoryCreate(BaseModel):
    tipo: str
    grupo_produtos: str
    data: Optional[str] = None
    periodo: Optional[str] = None


class RecordUpdate(BaseModel):
    gatilho: Optional[str] = None
    resolucao: Optional[str] = None
    resolucao_status: Optional[str] = None
