"""Gera planilhas de exemplo para testar importação (Ponto de Corte e Coleta Física)."""
from openpyxl import Workbook
import os

out = "/app/sample_data"
os.makedirs(out, exist_ok=True)

# Ponto de Corte
wb = Workbook()
ws = wb.active
ws.title = "PontoCorte"
headers = ["Material", "Texto breve material", "Lote", "UM básica", "Pos.depósito",
           "TipoEstoq.", "Unidade de depósito", "Dias em estoque", "Estoque disponível", "Peso Bruto"]
ws.append(headers)
rows = [
    ["MAT001", "Bobina de Aço 1010", "L001", "UN", "EXT-RA-B01", "01", "1026908451", 10, 1, 2500.5],
    ["MAT001", "Bobina de Aço 1010", "L002", "UN", "EXT-RA-B02", "01", "1026908452", 20, 1, 2480.0],
    ["MAT002", "Vergalhão CA-50", "L010", "KG", "GALPAO-01", "01", "2050771200", 5, 1500.75, 3000.0],
    ["MAT002", "Vergalhão CA-50", "L011", "KG", "GALPAO-01", "01", "2050771201", 8, 1420.0, 2900.0],
    ["MAT003", "Chapa Galvanizada", "L020", "UN", "RUA-01-BAIA-03", "01", "3099001122", 2, 1, 1200.0],
    ["MAT003", "Chapa Galvanizada", "L021", "UN", "RUA-01-BAIA-03", "01", "3099001123", 2, 1, 1210.0],
    ["MAT004", "Tubo Industrial", "L030", "UN", "EXT-RA-B01", "01", "4011223344", 40, 1, 800.0],
]
for r in rows:
    ws.append(r)
wb.save(f"{out}/ponto_corte_exemplo.xlsx")

# Coleta Física
wb2 = Workbook()
ws2 = wb2.active
ws2.title = "ColetaFisica"
ws2.append(["Cód. de Barras", "Posição Física"])
coleta = [
    ["1026908451000L005336229001010070R", "EXT-RA-B01"],   # CONTAGEM OK posição correta
    ["1026908452000L005336229001010070R", "GALPAO-99"],    # CONTAGEM OK posição errada
    ["2050771200000L00533622900101234XY", "GALPAO-01"],    # OK
    ["2050771200000L00533622900101234XY", "GALPAO-01"],    # DUPLICADA (mesmo sku físico)
    ["9999888877000L00000000000000000000", "RUA-05"],      # FORA DO SISTEMA
    ["0000000000000L00000000000000000000", "GALPAO-02"],   # SEM ETIQUETA
    ["3099001122000L00533622900101070000", "RUA-01-BAIA-03"],  # OK
    # MAT004 (4011223344) não coletado -> FALTANTE
]
for r in coleta:
    ws2.append(r)
wb2.save(f"{out}/coleta_fisica_exemplo.xlsx")

print("Planilhas geradas em", out)
