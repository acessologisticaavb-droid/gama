"""Reproduce the numeric-SKU mismatch in physical enrichment."""
import io, os, random, string
import requests
from openpyxl import Workbook

BASE = os.popen("grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2").read().strip() + "/api"
RID = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))

def login(s,u,p): r=s.post(f"{BASE}/auth/login",json={"username":u,"password":p}); r.raise_for_status(); return r.json()

sa=requests.Session(); login(sa,"admin","admin123")
c=sa.post(f"{BASE}/companies",json={"nome":f"Repro {RID}","nome_fantasia":"R","cnpj":f"{random.randint(10,99)}.{random.randint(100,999)}.{random.randint(100,999)}/0001-{random.randint(10,99)}","ramo":"X","logo":None}).json()
cid=c["id"]; key=sa.get(f"{BASE}/companies/{cid}/key").json()["key"]
al=f"adm_{RID.lower()}"; sa.post(f"{BASE}/companies/{cid}/admin",json={"nome":"A","funcao":"G","login":al,"senha":"Senha@123"})
ca=requests.Session(); login(ca,al,"Senha@123"); ca.post(f"{BASE}/auth/validate-key",json={"key":key})
ca.post(f"{BASE}/inv-groups",json={"nome":"Geral"})
iid=ca.post(f"{BASE}/inventories",json={"tipo":"Geral","grupo_produtos":"M","data":"2026-06-01","periodo":"06/2026"}).json()["id"]

# Cutoff with NUMERIC Unidade de depósito (int) — simulates SAP
wb=Workbook(); ws=wb.active
ws.append(["Material","Texto breve material","Lote","UM básica","Pos.depósito","TipoEstoq.","Unidade de depósito","Dias em estoque","Estoque disponível","Peso Bruto"])
ws.append(["80-000694","AVB50 Vergalhão","K001523EN","UN","GIB-B03","01", 1001519427, 14, 500, 2.021])
buf=io.BytesIO(); wb.save(buf); buf.seek(0)
ca.post(f"{BASE}/inventories/{iid}/import-cutoff?commit=true",files={"file":("c.xlsx",buf.read(),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})

wb2=Workbook(); ws2=wb2.active
ws2.append(["Cód. de Barras","Posição Física"])
ws2.append(["1001519427000X005336229001010070R","GIB-B03"])
buf2=io.BytesIO(); wb2.save(buf2); buf2.seek(0)
ca.post(f"{BASE}/inventories/{iid}/import-physical?commit=true",files={"file":("p.xlsx",buf2.read(),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})

cut=ca.get(f"{BASE}/inventories/{iid}/cutoff?limit=10").json()["rows"]
phy=ca.get(f"{BASE}/inventories/{iid}/physical?limit=10").json()["rows"]
print("CUTOFF sku_sistema repr:", repr(cut[0]["sku_sistema"]))
print("PHYSICAL sku_fisico repr:", repr(phy[0]["sku_fisico"]))
print("PHYSICAL cod_material:", repr(phy[0].get("cod_material")))
print("PHYSICAL peso:", repr(phy[0].get("peso")))
sa.delete(f"{BASE}/companies/{cid}?confirm={requests.utils.quote(c['nome'])}")
