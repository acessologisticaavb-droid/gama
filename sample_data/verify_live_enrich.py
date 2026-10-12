"""Verify live physical enrichment: matched SKU + fora do sistema."""
import io, os, random, string
import requests
from openpyxl import Workbook

BASE = os.popen("grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2").read().strip() + "/api"
RID = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))
def login(s,u,p): r=s.post(f"{BASE}/auth/login",json={"username":u,"password":p}); r.raise_for_status(); return r.json()

sa=requests.Session(); login(sa,"admin","admin123")
c=sa.post(f"{BASE}/companies",json={"nome":f"Live {RID}","nome_fantasia":"L","cnpj":f"{random.randint(10,99)}.{random.randint(100,999)}.{random.randint(100,999)}/0001-{random.randint(10,99)}","ramo":"X","logo":None}).json()
cid=c["id"]; key=sa.get(f"{BASE}/companies/{cid}/key").json()["key"]
al=f"adm_{RID.lower()}"; sa.post(f"{BASE}/companies/{cid}/admin",json={"nome":"A","funcao":"G","login":al,"senha":"Senha@123"})
ca=requests.Session(); login(ca,al,"Senha@123"); ca.post(f"{BASE}/auth/validate-key",json={"key":key})
ca.post(f"{BASE}/inv-groups",json={"nome":"Geral"})
iid=ca.post(f"{BASE}/inventories",json={"tipo":"Geral","grupo_produtos":"M","data":"2026-06-01","periodo":"06/2026"}).json()["id"]

wb=Workbook(); ws=wb.active
ws.append(["Material","Texto breve material","Lote","UM básica","Pos.depósito","TipoEstoq.","Unidade de depósito","Dias em estoque","Estoque disponível","Peso Bruto"])
ws.append(["80-000694","AVB50 Vergalhão CA50","K001523EN","UN","GIB-B03","01", 1001519427, 14, 500, 2.021])
buf=io.BytesIO(); wb.save(buf); buf.seek(0)
ca.post(f"{BASE}/inventories/{iid}/import-cutoff?commit=true",files={"file":("c.xlsx",buf.read(),"application/octet-stream")})

wb2=Workbook(); ws2=wb2.active
ws2.append(["Cód. de Barras","Posição Física"])
ws2.append(["1001519427000X005336229001010070R","GIB-B03"])  # matches
ws2.append(["9999999999000AAAA","RUA-01"])                      # fora do sistema
buf2=io.BytesIO(); wb2.save(buf2); buf2.seek(0)
ca.post(f"{BASE}/inventories/{iid}/import-physical?commit=true",files={"file":("p.xlsx",buf2.read(),"application/octet-stream")})

phy={r["sku_fisico"]: r for r in ca.get(f"{BASE}/inventories/{iid}/physical?limit=50").json()["rows"]}
m=phy["1001519427"]; f=phy["9999999999"]
print("MATCH  ->", m["cod_material"], "|", m["descricao"], "|", m["lote"], "|", m["pos_sistema"], "|", m["dias_estoque"], "|", m["peso"])
print("FORA   ->", f["cod_material"], "|", f["peso"])
assert m["cod_material"]=="80-000694" and m["lote"]=="K001523EN" and str(m["peso"]) in ("2.021","2.021")
assert f["cod_material"]=="SKU fora do sistema" and f["peso"]=="SKU fora do sistema"
sa.delete(f"{BASE}/companies/{cid}?confirm={requests.utils.quote(c['nome'])}")
print("\n✅ ENRIQUECIMENTO AO VIVO OK (match + fora do sistema)")
