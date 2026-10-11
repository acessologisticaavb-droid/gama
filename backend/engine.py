"""Inventory validation engine + Excel column mapping."""
import uuid
from unidecode import unidecode

CUTOFF_COLUMNS = {
    "Material": "cod_material",
    "Texto breve material": "descricao",
    "Lote": "lote",
    "UM básica": "um",
    "Pos.depósito": "pos_sistema",
    "TipoEstoq.": "tipo_estoque",
    "Unidade de depósito": "sku_sistema",
    "Dias em estoque": "dias_estoque",
    "Estoque disponível": "estoque_disponivel",
    "Peso Bruto": "peso_bruto",
}

PHYSICAL_COLUMNS = {
    "Cód. de Barras": "cod_barras",
    "Posição Física": "pos_fisica",
}

STATUS_OK = "CONTAGEM OK"
STATUS_FALTANTE = "SKU FALTANTE"
STATUS_FORA = "SKU FORA DO SISTEMA"
STATUS_DUPLICADA = "UD DUPLICADA"
STATUS_SEM_ETIQUETA = "SEM ETIQUETA"

PENDENCIA_STATUSES = {STATUS_FALTANTE, STATUS_FORA, STATUS_DUPLICADA, STATUS_SEM_ETIQUETA}

MOTIVO_MAP = {
    STATUS_FALTANTE: "SKU faltante",
    STATUS_FORA: "SKU fora do sistema",
    STATUS_DUPLICADA: "UD duplicada",
    STATUS_SEM_ETIQUETA: "Sem etiqueta",
}


def _norm(s: str) -> str:
    return unidecode(str(s)).strip().lower().replace(" ", "").replace(".", "")


def map_columns(headers, mapping):
    """Return (resolved {sys_name: original_header}, missing [original names])."""
    norm_headers = {_norm(h): h for h in headers}
    resolved = {}
    missing = []
    for original, sysname in mapping.items():
        key = _norm(original)
        if key in norm_headers:
            resolved[sysname] = norm_headers[key]
        else:
            missing.append(original)
    return resolved, missing


def compute_peso(um, peso_bruto, estoque_disponivel):
    um = str(um or "").strip().upper()
    try:
        pb = float(str(peso_bruto).replace(",", ".")) if peso_bruto not in (None, "") else 0.0
    except Exception:
        pb = 0.0
    try:
        ed = float(str(estoque_disponivel).replace(",", ".")) if estoque_disponivel not in (None, "") else 0.0
    except Exception:
        ed = 0.0
    if um == "UN":
        return pb
    if um == "KG":
        return ed
    return pb


def sku_fisico_from_barcode(cod_barras) -> str:
    return str(cod_barras or "")[:10]


def run_validation(cutoff_rows, physical_rows):
    """Build consolidated Dados Gerais records and KPI counters."""
    cutoff_by_sku = {}
    for r in cutoff_rows:
        sku = str(r.get("sku_sistema", "")).strip()
        if sku and sku not in cutoff_by_sku:
            cutoff_by_sku[sku] = r

    # Pre-compute sku fisico + duplicate counts (ignoring sem-etiqueta)
    enriched_physical = []
    counts = {}
    for p in physical_rows:
        skuf = sku_fisico_from_barcode(p.get("cod_barras", ""))
        enriched_physical.append((p, skuf))
        if skuf != "0000000000":
            counts[skuf] = counts.get(skuf, 0) + 1

    records = []
    seen_system_skus = set()

    for p, skuf in enriched_physical:
        sem_etiqueta = skuf == "0000000000"
        in_cutoff = skuf in cutoff_by_sku
        if in_cutoff:
            seen_system_skus.add(skuf)
        if sem_etiqueta:
            status = STATUS_SEM_ETIQUETA
        elif counts.get(skuf, 0) > 1:
            status = STATUS_DUPLICADA
        elif in_cutoff:
            status = STATUS_OK
        else:
            status = STATUS_FORA

        c = cutoff_by_sku.get(skuf, {})
        pos_fisica = str(p.get("pos_fisica", "")).strip()
        pos_sistema = str(c.get("pos_sistema", "")).strip()
        validacao_posicao = ""
        if status == STATUS_OK:
            validacao_posicao = "POSIÇÃO CORRETA" if pos_fisica == pos_sistema else "POSIÇÃO ERRADA"
        records.append(_make_record(status, c, p, skuf, validacao_posicao))

    # Faltantes: cutoff skus never seen physically
    for sku, c in cutoff_by_sku.items():
        if sku not in seen_system_skus:
            records.append(_make_record(STATUS_FALTANTE, c, {}, "", ""))

    counters = {
        "cutoff_total": len(cutoff_rows),
        "physical_total": len(physical_rows),
        "contagem_ok": sum(1 for r in records if r["status_inventario"] == STATUS_OK),
        "faltantes": sum(1 for r in records if r["status_inventario"] == STATUS_FALTANTE),
        "fora_sistema": sum(1 for r in records if r["status_inventario"] == STATUS_FORA),
        "duplicadas": sum(1 for r in records if r["status_inventario"] == STATUS_DUPLICADA),
        "sem_etiqueta": sum(1 for r in records if r["status_inventario"] == STATUS_SEM_ETIQUETA),
        "posicao_correta": sum(1 for r in records if r["validacao_posicao"] == "POSIÇÃO CORRETA"),
        "posicao_errada": sum(1 for r in records if r["validacao_posicao"] == "POSIÇÃO ERRADA"),
    }
    return records, counters


def _make_record(status, c, p, skuf, validacao_posicao):
    is_pend = status in PENDENCIA_STATUSES
    auto = status in (STATUS_DUPLICADA, STATUS_SEM_ETIQUETA)
    return {
        "rid": str(uuid.uuid4()),
        "sku_sistema": str(c.get("sku_sistema", "")) if c else "",
        "sku_fisico": skuf,
        "cod_barras": str(p.get("cod_barras", "")) if p else "",
        "cod_material": str(c.get("cod_material", "")) if c else "",
        "descricao": str(c.get("descricao", "")) if c else "",
        "lote": str(c.get("lote", "")) if c else "",
        "peso": c.get("peso", 0) if c else 0,
        "dias_estoque": c.get("dias_estoque", "") if c else "",
        "pos_sistema": str(c.get("pos_sistema", "")) if c else "",
        "pos_fisica": str(p.get("pos_fisica", "")) if p else "",
        "validacao_posicao": validacao_posicao,
        "status_inventario": status,
        "is_pendencia": is_pend,
        "gatilho": MOTIVO_MAP[status] if auto else "",
        "motivo": MOTIVO_MAP.get(status, ""),
        "resolucao": "",
        "resolucao_status": "Pendente" if is_pend else "",
        "data_resolucao": None,
        "concluido_por": "",
    }
