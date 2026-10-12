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



# ============ Alan admin seed ============
class TestAlanSeed:
    def test_alan_login(self):
        s = requests.Session()
        r = _login(s, "alan_teixeira", "ifma2013")
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "system_admin"


# ============ Delete Company (cascade) ============
class TestDeleteCompany:
    def test_delete_company_flow(self, admin_session):
        run = uuid.uuid4().hex[:6].upper()
        nome = f"TEST_DelEmp_{run}"
        cnpj = f"22.222.222/{run[:4]}-{run[4:6]}"
        r = admin_session.post(f"{API}/companies", json={
            "nome": nome, "nome_fantasia": "Del", "cnpj": cnpj, "ramo": "x"})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        key = r.json()["key"]
        # create admin
        login = f"deladm_{run.lower()}"
        r = admin_session.post(f"{API}/companies/{cid}/admin", json={
            "nome": "Del Adm", "funcao": "g", "login": login, "senha": "Senha@123"})
        assert r.status_code == 200
        # company admin session should NOT be able to delete
        s_other = requests.Session()
        assert _login(s_other, login, "Senha@123").status_code == 200
        assert s_other.post(f"{API}/auth/validate-key", json={"key": key}).status_code == 200
        r = s_other.delete(f"{API}/companies/{cid}?confirm={nome}")
        assert r.status_code == 403

        # wrong confirm fails
        r = admin_session.delete(f"{API}/companies/{cid}?confirm=NOME_ERRADO")
        assert r.status_code == 400

        # correct deletes
        r = admin_session.delete(f"{API}/companies/{cid}?confirm={nome}")
        assert r.status_code == 200
        # verify gone
        r = admin_session.get(f"{API}/companies/{cid}")
        assert r.status_code == 404
        # user also gone - login fails
        s2 = requests.Session()
        assert _login(s2, login, "Senha@123").status_code == 401


# ============ Brute force lockout ============
class TestBruteForce:
    def test_lockout_after_5_fails(self):
        s = requests.Session()
        uname = f"nouser_{uuid.uuid4().hex[:6]}"
        codes = []
        for _ in range(6):
            r = _login(s, uname, "wrong")
            codes.append(r.status_code)
        # after 5 wrongs, 6th should be 429
        assert codes[-1] == 429, f"expected final 429 lockout, got {codes}"


# =============================================================================
# ====================== NEW FEATURES — ITERATION 2 ===========================
# =============================================================================

# ============ created_by on inventories (§10) ============
class TestInventoryCreatedBy:
    def test_created_by_recorded(self, company_session, company_ctx):
        # fixture already created company_ctx['iid'] via admin_login
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}")
        assert r.status_code == 200
        inv = r.json()
        assert inv.get("created_by") == company_ctx["admin_login"], \
            f"expected created_by={company_ctx['admin_login']} got {inv.get('created_by')}"

        r = company_session.get(f"{API}/inventories")
        assert r.status_code == 200
        matches = [i for i in r.json() if i["id"] == company_ctx["iid"]]
        assert matches and matches[0].get("created_by") == company_ctx["admin_login"]


# ============ Ponto de Corte — validacao_sku (§3) ============
class TestCutoffValidacaoSku:
    def test_cutoff_rows_have_validacao_sku(self, company_session, company_ctx):
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}/cutoff?limit=200")
        assert r.status_code == 200
        rows = r.json()["rows"]
        assert rows, "cutoff should have rows"
        for row in rows:
            assert "validacao_sku" in row, f"missing validacao_sku: {row}"
            assert row["validacao_sku"] in ("SKU no fisico", "SKU faltante"), \
                f"invalid value: {row['validacao_sku']}"
        # at least one of each expected (per prompt sample has faltante)
        vals = {r["validacao_sku"] for r in rows}
        assert "SKU no fisico" in vals
        assert "SKU faltante" in vals


# ============ Coleta Física — enrichment (§4) ============
class TestPhysicalEnrichment:
    def test_physical_rows_enriched(self, company_session, company_ctx):
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}/physical?limit=200")
        assert r.status_code == 200
        rows = r.json()["rows"]
        assert rows
        required = ["cod_material", "descricao", "lote", "pos_sistema", "dias_estoque", "peso"]
        for row in rows:
            for k in required:
                assert k in row, f"physical row missing enriched field {k}: {row}"
                assert row[k] not in (None, ""), f"physical row field {k} is empty"
        # expect at least one 'SKU fora do sistema' marker since sample has fora
        fora_rows = [r for r in rows if r["cod_material"] == "SKU fora do sistema"]
        assert fora_rows, "expected at least one physical row marked 'SKU fora do sistema'"


# ============ Pendencia tabs base + gatilhos (§7) ============
class TestPendenciaTabsBaseAndGatilhos:
    def test_base_and_gatilhos_shape(self, company_session, company_ctx):
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}/pendencia-tabs")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)
        assert "base" in data and "gatilhos" in data
        assert isinstance(data["base"], dict)
        assert isinstance(data["gatilhos"], dict)
        # base should contain at least SKU FALTANTE (sample)
        assert "SKU FALTANTE" in data["base"] or "SKU FORA DO SISTEMA" in data["base"]
        company_ctx["_base_before"] = dict(data["base"])

    def test_moving_record_to_gatilho_creates_tab(self, company_session, company_ctx):
        # fetch a SKU FALTANTE record without gatilho
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}/records?status=SKU FALTANTE")
        assert r.status_code == 200
        rows = r.json()["rows"]
        # existing TestInventory already attached a gatilho to the first faltante; pick an untouched one
        untouched = [x for x in rows if not x.get("gatilho")]
        if not untouched:
            # all were marked, re-import physical would reset — skip
            pytest.skip("no untouched faltante record available in this run")
        rid = untouched[0]["rid"]
        gname = "Lançamento esquecido"
        r = company_session.put(f"{API}/records/{rid}", json={"gatilho": gname})
        assert r.status_code == 200

        # record should no longer appear in base status filter
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}/records?status=SKU FALTANTE")
        rids_in_base = {x["rid"] for x in r.json()["rows"]}
        assert rid not in rids_in_base

        # but should appear in gatilho filter
        r = company_session.get(
            f"{API}/inventories/{company_ctx['iid']}/records?gatilho={gname}")
        assert r.status_code == 200
        rids_in_gat = {x["rid"] for x in r.json()["rows"]}
        assert rid in rids_in_gat

        # pendencia-tabs should expose it under gatilhos
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}/pendencia-tabs")
        tabs = r.json()
        assert gname in tabs["gatilhos"], f"expected gatilho tab '{gname}' in {tabs}"


# ============ Delete Inventory with permissions (§22) ============
class TestDeleteInventory:
    def test_user_without_perm_cannot_delete(self, company_ctx):
        # login as common user (created in TestUsersAndPerms); may need pwd change
        if "user_login" not in company_ctx:
            pytest.skip("user not created yet")
        s = requests.Session()
        r = _login(s, company_ctx["user_login"], company_ctx["user_pwd"])
        assert r.status_code == 200
        # force password change if required
        if r.json().get("must_change_password"):
            r = s.post(f"{API}/auth/change-password", json={"new_password": "NovaSenha@1"})
            assert r.status_code == 200
            company_ctx["user_pwd"] = "NovaSenha@1"
        # validate key
        key_resp = s.post(f"{API}/auth/validate-key",
                          json={"key": _fetch_key_as_admin(company_ctx)})
        assert key_resp.status_code == 200
        # try delete — user has only ver/criar/editar on cadastros, no excluir on lancamentos
        r = s.delete(f"{API}/inventories/{company_ctx['iid']}")
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text[:200]}"

    def test_admin_can_delete_cascade(self, admin_session, company_session, company_ctx):
        # create a throw-away inventory as company_admin, then delete it
        r = company_session.post(f"{API}/inventories", json={
            "tipo": "Mensal", "grupo_produtos": "Metais", "data": "2026-01-20"})
        assert r.status_code == 200
        iid = r.json()["id"]
        r = company_session.delete(f"{API}/inventories/{iid}")
        assert r.status_code == 200
        # verify gone
        r = company_session.get(f"{API}/inventories/{iid}")
        assert r.status_code == 404


def _fetch_key_as_admin(company_ctx):
    """Helper: fetch the company key again (we have it in ctx)."""
    return company_ctx["key"]


# ============ PUT /users/{uid} (edit user by admin da empresa) (§1) ============
class TestEditUser:
    def test_admin_edits_user(self, company_session, company_ctx):
        uid = company_ctx["user_id"]
        r = company_session.put(f"{API}/users/{uid}", json={
            "nome": "João da Silva Editado", "funcao": "Supervisor", "active": True,
            "foto": "data:image/png;base64,AAA"})
        assert r.status_code == 200

        r = company_session.get(f"{API}/users")
        rec = next(u for u in r.json() if u["id"] == uid)
        assert rec["nome"] == "João da Silva Editado"
        assert rec["funcao"] == "Supervisor"
        assert rec["foto"] == "data:image/png;base64,AAA"
        assert rec["active"] is True

    def test_cross_company_edit_blocked(self, admin_session, company_ctx):
        # create 2nd company + admin and try to edit user from company 1
        run = uuid.uuid4().hex[:6].upper()
        r = admin_session.post(f"{API}/companies", json={
            "nome": f"TEST_EmpEdit_{run}", "nome_fantasia": "x",
            "cnpj": f"33.333.333/{run[:4]}-{run[4:6]}", "ramo": "x"})
        assert r.status_code == 200
        cid2 = r.json()["id"]
        key2 = r.json()["key"]
        login = f"editadm_{run.lower()}"
        r = admin_session.post(f"{API}/companies/{cid2}/admin", json={
            "nome": "E", "funcao": "g", "login": login, "senha": "Senha@123"})
        assert r.status_code == 200
        s = requests.Session()
        assert _login(s, login, "Senha@123").status_code == 200
        assert s.post(f"{API}/auth/validate-key", json={"key": key2}).status_code == 200
        # cross company edit — should 404 (not found in own scope)
        r = s.put(f"{API}/users/{company_ctx['user_id']}", json={"nome": "hack"})
        assert r.status_code in (403, 404), f"expected 403/404 got {r.status_code}"


# ============ PUT /auth/profile — foto only (§2) ============
class TestProfilePhoto:
    def test_user_updates_own_photo(self, company_session):
        r = company_session.put(f"{API}/auth/profile",
                                json={"foto": "data:image/png;base64,ZZZ"})
        assert r.status_code == 200
        assert r.json().get("foto") == "data:image/png;base64,ZZZ"
        r = company_session.get(f"{API}/auth/me")
        assert r.json().get("foto") == "data:image/png;base64,ZZZ"


# ============ Global pendencias — search & classificacoes (§19,20) ============
class TestPendenciasSearchAndClassificacoes:
    def test_search_filters(self, company_session):
        # existing suite marked a record as Concluído by 'Admin Teste'
        r = company_session.get(f"{API}/pendencias?search=Admin Teste")
        assert r.status_code == 200
        rows = r.json()
        assert rows, "expected at least one pendencia matching concluido_por 'Admin Teste'"
        for row in rows:
            assert "concluido_por" in row and "data_resolucao" in row

    def test_classificacoes_lists_gatilhos(self, company_session):
        r = company_session.get(f"{API}/classificacoes")
        assert r.status_code == 200
        vals = r.json()
        assert isinstance(vals, list)
        assert "Lançamento esquecido" in vals

    def test_gatilho_filter(self, company_session):
        r = company_session.get(f"{API}/pendencias?gatilho=Lançamento esquecido")
        assert r.status_code == 200
        rows = r.json()
        assert rows
        assert all(x["gatilho"] == "Lançamento esquecido" for x in rows)


# ============ Export Excel contains 'Concluído Por' column (§14) ============
class TestExcelConcluidoPor:
    def test_excel_has_concluido_por_column(self, company_session, company_ctx):
        import openpyxl
        r = company_session.get(f"{API}/inventories/{company_ctx['iid']}/export-excel")
        assert r.status_code == 200
        wb = openpyxl.load_workbook(io.BytesIO(r.content), read_only=True, data_only=True)
        found = False
        for sh in wb.sheetnames:
            ws = wb[sh]
            for row in ws.iter_rows(max_row=30, values_only=True):
                cells = [str(c or "").strip().lower() for c in row]
                if "concluído por" in cells or "concluido por" in cells:
                    found = True
                    break
            if found:
                break
        assert found, "expected a sheet with 'Concluído Por' column in export"
