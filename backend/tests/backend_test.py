"""GAMA Backend end-to-end API tests.

Covers:
- Auth (system admin login, me, invalid cred, logout)
- Company CRUD + company admin creation + key validation
- User creation (auto-login) + permissions
- Cadastros CRUD (product, address, inv-group, trigger)
- Inventory lifecycle + Excel imports (cutoff, physical) + validation engine
- Dashboards, pendencias, excel export, pdf report
- Multi-tenant isolation + audit
"""
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
SAMPLE_DIR = "/app/sample_data"

TEST_RUN_ID = uuid.uuid4().hex[:6].upper()


# ---------- helpers ----------
def _login(session: requests.Session, username: str, password: str):
    r = session.post(f"{API}/auth/login", json={"username": username, "password": password})
    return r


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = _login(s, "admin", "admin123")
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["role"] == "system_admin"
    return s


@pytest.fixture(scope="module")
def company_ctx(admin_session):
    """Create a company + company admin, return context dict."""
    nome = f"TEST_Empresa_{TEST_RUN_ID}"
    cnpj = f"00.000.000/{TEST_RUN_ID[:4]}-{TEST_RUN_ID[4:6]}"
    r = admin_session.post(f"{API}/companies", json={
        "nome": nome, "nome_fantasia": "TestCo", "cnpj": cnpj, "ramo": "Industrial"
    })
    assert r.status_code == 200, r.text
    comp = r.json()
    assert comp["key"] and "-" in comp["key"]
    cid = comp["id"]

    admin_login = f"testadm_{TEST_RUN_ID.lower()}"
    r = admin_session.post(f"{API}/companies/{cid}/admin", json={
        "nome": "Admin Teste", "funcao": "Gestor", "login": admin_login, "senha": "Senha@123"
    })
    assert r.status_code == 200, r.text

    return {"cid": cid, "key": comp["key"], "admin_login": admin_login, "admin_pwd": "Senha@123",
            "nome": nome}


@pytest.fixture(scope="module")
def company_session(company_ctx):
    """Logged + key-validated company admin session."""
    s = requests.Session()
    r = _login(s, company_ctx["admin_login"], company_ctx["admin_pwd"])
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["role"] == "company_admin"
    assert me["validated"] is False

    # wrong key
    r = s.post(f"{API}/auth/validate-key", json={"key": "XXX-XXXXXX"})
    assert r.status_code == 400
    assert "inv" in r.json().get("detail", "").lower()

    # correct key
    r = s.post(f"{API}/auth/validate-key", json={"key": company_ctx["key"]})
    assert r.status_code == 200, r.text
    assert r.json()["validated"] is True
    return s


# ============ Auth ============
class TestAuth:
    def test_login_admin_success(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["username"] == "admin"

    def test_login_invalid(self):
        s = requests.Session()
        r = _login(s, "admin", "wrong_pwd")
        assert r.status_code == 401

    def test_me_requires_cookie(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ============ Companies ============
class TestCompanies:
    def test_company_created_and_persisted(self, admin_session, company_ctx):
        r = admin_session.get(f"{API}/companies")
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert company_ctx["cid"] in ids

        r = admin_session.get(f"{API}/companies/{company_ctx['cid']}")
        assert r.status_code == 200
        d = r.json()
        assert d["nome"] == company_ctx["nome"]
        assert d["key"] == company_ctx["key"]

    def test_duplicate_cnpj_rejected(self, admin_session, company_ctx):
        r = admin_session.get(f"{API}/companies/{company_ctx['cid']}")
        cnpj = r.json()["cnpj"]
        r = admin_session.post(f"{API}/companies", json={
            "nome": "Outra", "nome_fantasia": "X", "cnpj": cnpj, "ramo": "x"})
        assert r.status_code == 400


# ============ Company admin flow + user ============
class TestUsersAndPerms:
    def test_company_admin_validate_and_create_user(self, company_session, company_ctx):
        # me reflects validated
        me = company_session.get(f"{API}/auth/me").json()
        assert me["validated"] is True

        r = company_session.post(f"{API}/users", json={
            "nome": "João da Silva", "funcao": "Operador"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["username"].startswith("joao_silva")
        assert d["senha_inicial"]
        company_ctx["user_id"] = d["id"]
        company_ctx["user_login"] = d["username"]
        company_ctx["user_pwd"] = d["senha_inicial"]

    def test_list_users_scoped(self, company_session, company_ctx):
        r = company_session.get(f"{API}/users")
        assert r.status_code == 200
        logins = [u["username"] for u in r.json()]
        assert company_ctx["user_login"] in logins

    def test_update_permissions(self, company_session, company_ctx):
        perms = {"inventario": {"cadastros": ["ver", "criar", "editar"]}}
        r = company_session.put(f"{API}/users/{company_ctx['user_id']}/permissions",
                                json={"permissions": perms})
        assert r.status_code == 200

    def test_other_company_cannot_read(self, admin_session, company_ctx):
        # create another company + admin and ensure it cannot read first company's users
        r = admin_session.post(f"{API}/companies", json={
            "nome": f"TEST_Empresa2_{TEST_RUN_ID}", "nome_fantasia": "X",
            "cnpj": f"11.111.111/{TEST_RUN_ID[:4]}-{TEST_RUN_ID[4:6]}", "ramo": "y"})
        assert r.status_code == 200
        cid2 = r.json()["id"]
        key2 = r.json()["key"]
        r = admin_session.post(f"{API}/companies/{cid2}/admin", json={
            "nome": "Adm2", "funcao": "g", "login": f"adm2_{TEST_RUN_ID.lower()}", "senha": "Senha@123"})
        assert r.status_code == 200
        s2 = requests.Session()
        assert _login(s2, f"adm2_{TEST_RUN_ID.lower()}", "Senha@123").status_code == 200
        assert s2.post(f"{API}/auth/validate-key", json={"key": key2}).status_code == 200
        # cannot access first company's detail
        r = s2.get(f"{API}/companies/{company_ctx['cid']}")
        assert r.status_code == 403


# ============ Cadastros ============
class TestCadastros:
    def test_create_product(self, company_session, company_ctx):
        r = company_session.post(f"{API}/products", json={
            "cod_material": "MAT001", "descricao": "Bobina Teste", "grupo_produtos": "Metais"})
        assert r.status_code == 200
        company_ctx["prod_id"] = r.json()["id"]
        r = company_session.get(f"{API}/products")
        assert any(p["cod_material"] == "MAT001" for p in r.json())

    def test_create_address(self, company_session):
        r = company_session.post(f"{API}/addresses", json={"nome_posicao": "A-01-01"})
        assert r.status_code == 200

    def test_create_inv_group(self, company_session, company_ctx):
        r = company_session.post(f"{API}/inv-groups", json={"nome": "Mensal"})
        assert r.status_code == 200
        company_ctx["inv_group"] = r.json()["nome"]

    def test_create_trigger(self, company_session):
        r = company_session.post(f"{API}/triggers", json={
            "nome": "Lançamento esquecido", "motivo": "SKU faltante"})
        assert r.status_code == 200
        r = company_session.post(f"{API}/triggers", json={
            "nome": "Fora de contagem", "motivo": "Motivo inválido"})
        assert r.status_code == 400

    def test_product_groups(self, company_session):
        r = company_session.get(f"{API}/product-groups")
        assert r.status_code == 200
        assert "Metais" in r.json()


# ============ Inventory ============
class TestInventory:
    def test_create_inventory(self, company_session, company_ctx):
        r = company_session.post(f"{API}/inventories", json={
            "tipo": "Mensal", "grupo_produtos": "Metais", "data": "2026-01-15"})
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["codigo"].startswith("INV-")
        assert inv["status"] == "Planejado"
        company_ctx["iid"] = inv["id"]

    def test_import_cutoff_preview_and_commit(self, company_session, company_ctx):
        with open(f"{SAMPLE_DIR}/ponto_corte_exemplo.xlsx", "rb") as f:
            data = f.read()
        # preview
        r = company_session.post(
            f"{API}/inventories/{company_ctx['iid']}/import-cutoff?commit=false",
            files={"file": ("ponto_corte.xlsx", data,
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["valid"] is True
        assert d["total"] > 0
        # commit
        r = company_session.post(
            f"{API}/inventories/{company_ctx['iid']}/import-cutoff?commit=true",
            files={"file": ("ponto_corte.xlsx", data,
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        assert r.status_code == 200, r.text
        assert r.json()["imported"] > 0

    def test_import_physical_runs_validation(self, company_session, company_ctx):
        with open(f"{SAMPLE_DIR}/coleta_fisica_exemplo.xlsx", "rb") as f:
            data = f.read()
        r = company_session.post(
            f"{API}/inventories/{company_ctx['iid']}/import-physical?commit=true",
            files={"file": ("coleta.xlsx", data,
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        assert r.status_code == 200, r.text
        assert r.json()["imported"] > 0

    def test_dashboard_kpis(self, company_session, company_ctx):
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}/dashboard")
        assert r.status_code == 200
        k = r.json()["kpis"]
        for key in ("cutoff_total", "physical_total", "faltantes", "fora_sistema",
                    "duplicadas", "sem_etiqueta", "perc_posicao", "perc_acuracidade"):
            assert key in k
        # expected per prompt: at least 1 faltante, 1 fora, 1 duplicada, 1 sem_etiqueta
        assert k["faltantes"] >= 1, f"expected faltantes>=1 got {k}"
        assert k["fora_sistema"] >= 1, f"expected fora>=1 got {k}"
        assert k["duplicadas"] >= 1, f"expected duplicadas>=1 got {k}"
        assert k["sem_etiqueta"] >= 1, f"expected sem_etiqueta>=1 got {k}"
        assert k["contagem_ok"] >= 1

    def test_pendencia_tabs(self, company_session, company_ctx):
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}/pendencia-tabs")
        assert r.status_code == 200
        tabs = r.json()
        assert len(tabs) >= 1  # non-empty only

    def test_resumo_material_and_dados_gerais(self, company_session, company_ctx):
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}/resumo-material")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}/dados-gerais")
        assert r.status_code == 200
        assert r.json()["total"] > 0

    def test_update_record_pendencia(self, company_session, company_ctx):
        # grab a pendencia record
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}/records?status=SKU FALTANTE")
        assert r.status_code == 200
        rows = r.json()["rows"]
        assert rows, "expected at least one faltante record"
        rid = rows[0]["rid"]
        r = company_session.put(f"{API}/records/{rid}", json={
            "gatilho": "Lançamento esquecido", "resolucao": "Ajuste manual",
            "resolucao_status": "Concluído"})
        assert r.status_code == 200
        # verify persistence via pendencias global
        r = company_session.get(f"{API}/pendencias")
        assert r.status_code == 200
        match = [p for p in r.json() if p["rid"] == rid]
        assert match and match[0]["status"] == "Concluído"
        assert match[0]["data_resolucao"]

    def test_export_excel(self, company_session, company_ctx):
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}/export-excel")
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "")
        assert r.content[:2] == b"PK"  # xlsx is a zip

    def test_report_pdf(self, company_session, company_ctx):
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}/report-pdf")
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"


# ============ Audit ============
class TestAudit:
    def test_audit_has_entries(self, company_session):
        r = company_session.get(f"{API}/audit")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        actions = {a.get("action") for a in rows}
        assert any("Criação" in a or "Login" in a or "Importação" in a for a in actions)
