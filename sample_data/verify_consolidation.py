"""Correct consolidation test: 10-digit SKUs matching barcode LEFT(10)."""
import io, os, random, string
import requests
from openpyxl import Workbook
BASE = os.popen("grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2").read().strip() + "/api"
RID = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))
def login(s,u,p): r=s.post(f"{BASE}/auth/login",json={"username":u,"password":p}); r.raise_for_status(); return r.json()
sa=requests.Session(); login(sa,"admin","admin123")
c=sa.post(f"{BASE}/companies",json={"nome":f"Cons {RID}","nome_fantasia":"C","cnpj":f"{random.randint(10,99)}.{random.randint(100,999)}.{random.randint(100,999)}/0001-{random.randint(10,99)}","ramo":"X","logo":None}).json()
cid=c["id"]; key=sa.get(f"{BASE}/companies/{cid}/key").json()["key"]
al=f"adm_{RID.lower()}"; sa.post(f"{BASE}/companies/{cid}/admin",json={"nome":"A","funcao":"G","login":al,"senha":"Senha@123"})
ca=requests.Session(); login(ca,al,"Senha@123"); ca.post(f"{BASE}/auth/validate-key",json={"key":key})
ca.post(f"{BASE}/inv-groups",json={"nome":"Geral"})
iid=ca.post(f"{BASE}/inventories",json={"tipo":"Geral","grupo_produtos":"M","data":"2026-06-01","periodo":"06/2026"}).json()["id"]
# cutoff 1001000001..1001000004 (10-digit)
cut=["1001000001","1001000002","1001000003","1001000004"]
wb=Workbook(); ws=wb.active
ws.append(["Material","Texto breve material","Lote","UM básica","Pos.depósito","TipoEstoq.","Unidade de depósito","Dias em estoque","Estoque disponível","Peso Bruto"])
for s in cut: ws.append([f"MAT{s[-1]}",f"Desc {s[-1]}",f"L{s[-1]}","UN","P1","01", s, 5, 100, 10])
buf=io.BytesIO(); wb.save(buf); buf.seek(0)
ca.post(f"{BASE}/inventories/{iid}/import-cutoff?commit=true",files={"file":("c.xlsx",buf.read(),"application/octet-stream")})
# physical 1001000001,1001000002,1001000005 (barcode LEFT(10)=sku)
wb2=Workbook(); ws2=wb2.active; ws2.append(["Cód. de Barras","Posição Física"])
for s in ["1001000001","1001000002","1001000005"]: ws2.append([f"{s}XYZR","P1"])
buf2=io.BytesIO(); wb2.save(buf2); buf2.seek(0)
ca.post(f"{BASE}/inventories/{iid}/import-physical?commit=true",files={"file":("p.xlsx",buf2.read(),"application/octet-stream")})
d=ca.get(f"{BASE}/inventories/{iid}/dados-gerais?limit=500").json()
res={}
for r in d["rows"]:
    res[r.get("sku_sistema") or r.get("sku_fisico")]=r["status_dados"]
print("counts:", d["counts"])
print("map:", res)
assert res["1001000001"]=="SKU no fisico"
assert res["1001000003"]=="SKU faltante"
assert res["1001000004"]=="SKU faltante"
assert res["1001000005"]=="SKU fora do sistema"
# validacao_sku on cutoff
cv={r["sku_sistema"]: r["validacao_sku"] for r in ca.get(f"{BASE}/inventories/{iid}/cutoff?limit=50").json()["rows"]}
print("validacao_sku:", cv)
assert cv["1001000001"]=="SKU no fisico" and cv["1001000003"]=="SKU faltante"
# faltante-only filter
flt=ca.get(f"{BASE}/inventories/{iid}/dados-gerais?status=SKU%20faltante&limit=500").json()
assert flt["total"]==2, flt["total"]
sa.delete(f"{BASE}/companies/{cid}?confirm={requests.utils.quote(c['nome'])}")
print("\n✅ CONSOLIDAÇÃO DADOS GERAIS OK (faltantes presentes, filtro por status OK)")
