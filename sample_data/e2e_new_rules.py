"""E2E validation of the new rules against the live API."""
import io, os, sys, random, string
import requests
from openpyxl import Workbook

BASE = os.popen("grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2").read().strip() + "/api"
RID = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))

def login(s, u, p):
    r = s.post(f"{BASE}/auth/login", json={"username": u, "password": p}); r.raise_for_status(); return r.json()

sa = requests.Session(); login(sa, "admin", "admin123")
# create company
c = sa.post(f"{BASE}/companies", json={"nome": f"Teste GAMA {RID}", "nome_fantasia": "TG", "cnpj": f"{random.randint(10,99)}.{random.randint(100,999)}.{random.randint(100,999)}/0001-{random.randint(10,99)}", "ramo": "Siderurgia", "logo": None}).json()
cid = c["id"]
key = sa.get(f"{BASE}/companies/{cid}/key").json()["key"]
# create company admin
adm_login = f"adm_{RID.lower()}"
sa.post(f"{BASE}/companies/{cid}/admin", json={"nome": "Admin Teste", "funcao": "Gestor", "login": adm_login, "senha": "Senha@123"})

ca = requests.Session(); login(ca, adm_login, "Senha@123")
ca.post(f"{BASE}/auth/validate-key", json={"key": key})

# cadastros: inv group + product group
ca.post(f"{BASE}/inv-groups", json={"nome": "Inventário Geral"})
ca.post(f"{BASE}/products", json={"cod_material": "MAT001", "descricao": "Bobina", "grupo_produtos": "Metais"})

# create inventory
inv = ca.post(f"{BASE}/inventories", json={"tipo": "Inventário Geral", "grupo_produtos": "Metais", "data": "2026-06-01", "periodo": "06/2026"}).json()
iid = inv["id"]
print("Inventario:", inv["codigo"], "created_by:", inv["created_by"])

# Build cutoff: 4 SKUs
wb = Workbook(); ws = wb.active
ws.append(["Material", "Texto breve material", "Lote", "UM básica", "Pos.depósito", "TipoEstoq.", "Unidade de depósito", "Dias em estoque", "Estoque disponível", "Peso Bruto"])
cut = [
    ["MAT001", "Bobina A", "L1", "UN", "EXT-RA-B01", "01", "1001519427", "10", "500", "120"],
    ["MAT002", "Bobina B", "L2", "KG", "EXT-RA-B02", "01", "1001519428", "20", "800", "90"],
    ["MAT003", "Bobina C", "L3", "UN", "EXT-RA-B03", "01", "1001519429", "5", "300", "60"],
    ["MAT004", "Bobina D", "L4", "UN", "EXT-RA-B04", "01", "1001519430", "8", "200", "40"],
]
for r in cut: ws.append(r)
buf = io.BytesIO(); wb.save(buf); buf.seek(0)
ca.post(f"{BASE}/inventories/{iid}/import-cutoff?commit=true", files={"file": ("cut.xlsx", buf.read(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})

# Physical: 1001519427 (match UN), 1001519428 (match KG), 1001519429 (match) -> 3 found; 1001519430 missing -> faltante
wb2 = Workbook(); ws2 = wb2.active
ws2.append(["Cód. de Barras", "Posição Física"])
ws2.append(["1001519427000X005336229001010070R", "EXT-RA-B01"])
ws2.append(["1001519428000X005336229001010071R", "EXT-RA-B99"])  # wrong position
ws2.append(["1001519429000X005336229001010072R", "EXT-RA-B03"])
buf2 = io.BytesIO(); wb2.save(buf2); buf2.seek(0)
ca.post(f"{BASE}/inventories/{iid}/import-physical?commit=true", files={"file": ("phy.xlsx", buf2.read(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})

# Assertions
cutoff = ca.get(f"{BASE}/inventories/{iid}/cutoff?limit=50").json()["rows"]
vmap = {r["sku_sistema"]: r["validacao_sku"] for r in cutoff}
print("validacao_sku:", vmap)
assert vmap["1001519427"] == "SKU no fisico", vmap["1001519427"]
assert vmap["1001519430"] == "SKU faltante", vmap["1001519430"]

phys = ca.get(f"{BASE}/inventories/{iid}/physical?limit=50").json()["rows"]
pm = {r["sku_fisico"]: r for r in phys}
print("physical enrich 1001519427:", pm["1001519427"]["cod_material"], pm["1001519427"]["peso"])
assert pm["1001519427"]["cod_material"] == "MAT001"
assert float(pm["1001519427"]["peso"]) == 120.0  # UN -> peso bruto
assert float(pm["1001519428"]["peso"]) == 800.0  # KG -> estoque disponivel

dg = ca.get(f"{BASE}/inventories/{iid}/dados-gerais?limit=100").json()["rows"]
statuses = sorted({r["status_dados"] for r in dg})
print("dados-gerais status_dados:", statuses)
assert "SKU no fisico" in statuses
assert "SKU faltante" in statuses

inv2 = ca.get(f"{BASE}/inventories/{iid}").json()
print("status apos import:", inv2["status"])
assert inv2["status"] == "Com pendências"  # 1 faltante open

# conclude the faltante pendencia -> status should become Concluído
falt = ca.get(f"{BASE}/inventories/{iid}/records?status=SKU FALTANTE").json()["rows"]
for r in falt:
    ca.put(f"{BASE}/records/{r['rid']}", json={"resolucao_status": "Concluído"})
inv3 = ca.get(f"{BASE}/inventories/{iid}").json()
print("status apos concluir pendencias:", inv3["status"])
assert inv3["status"] == "Concluído", inv3["status"]

# profile funcao update
me = ca.put(f"{BASE}/auth/profile", json={"funcao": "Coordenador"}).json()
print("profile funcao:", me["funcao"])
assert me["funcao"] == "Coordenador"

# cleanup
sa.delete(f"{BASE}/companies/{cid}?confirm={requests.utils.quote(c['nome'])}")
print("\n✅ TODOS OS NOVOS COMPORTAMENTOS VALIDADOS")
