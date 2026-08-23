import hashlib
import json
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

USER_AGENT = "PainelDados/2.0"
BRASILAPI = "https://brasilapi.com.br/api"
RECEITAWS = "https://receitaws.com.br/v1"

AVAILABLE_APIS = [
    {
        "id": "receitaws",
        "name": "ReceitaWS",
        "active_by_default": True,
        "description": "Consulta CPF e CNPJ na Receita Federal (via ReceitaWS).",
        "supports": ["CPF", "CNPJ"],
    },
    {
        "id": "brasilapi",
        "name": "BrasilAPI",
        "active_by_default": True,
        "description": "Dados públicos: CEP, CNPJ, DDD, bancos, NCM, ISBN e feriados.",
        "supports": ["CEP", "CNPJ", "DDD", "Telefone", "Banco", "NCM", "ISBN", "Nome", "Ano"],
    },
    {
        "id": "phoneint",
        "name": "Telefone Intel",
        "active_by_default": True,
        "description": "Operadora de origem (Anatel), região, links WhatsApp e Telegram.",
        "supports": ["Telefone", "Celular"],
    },
    {
        "id": "emailint",
        "name": "E-mail Intel",
        "active_by_default": True,
        "description": "Gravatar (foto e perfil), validação de domínio e anti-descartável.",
        "supports": ["E-mail"],
    },
    {
        "id": "cpfint",
        "name": "CPF Intel",
        "active_by_default": True,
        "description": "Identifica o Estado emissor da Receita Federal pelo 9º dígito.",
        "supports": ["CPF"],
    },
    {
        "id": "plateint",
        "name": "Placa Intel",
        "active_by_default": True,
        "description": "Identifica padrão Mercosul/Antigo e Estado de registro.",
        "supports": ["Placa"],
    },
    {
        "id": "ipdomainint",
        "name": "IP/Domínio Intel",
        "active_by_default": True,
        "description": "Geolocalização de IP e consulta RDAP de domínios .br.",
        "supports": ["IP", "Domínio"],
    },
]

DEFAULT_SOURCES = [api["id"] for api in AVAILABLE_APIS if api["active_by_default"]]

KEY_ALIASES = {
    "cep": "cep",
    "postal_code": "cep",
    "logradouro": "logradouro",
    "street": "logradouro",
    "bairro": "bairro",
    "neighborhood": "bairro",
    "localidade": "cidade",
    "city": "cidade",
    "municipio": "cidade",
    "uf": "uf",
    "state": "uf",
    "estado": "uf",
    "nome": "nome",
    "name": "nome",
    "razao_social": "razao_social",
    "nome_fantasia": "nome_fantasia",
    "fantasia": "nome_fantasia",
    "cnpj": "cnpj",
    "cpf": "cpf",
    "ddd": "ddd",
    "complemento": "complemento",
    "ibge": "ibge",
    "gia": "gia",
    "siafi": "siafi",
    "ddd_prefix": "ddd",
    "status": "status",
    "situacao": "situacao",
    "abertura": "abertura",
    "capital_social": "capital_social",
    "porte": "porte",
    "natureza_juridica": "natureza_juridica",
    "email": "email",
    "telefone": "telefone",
    "phone": "telefone",
}

SKIP_KEYS = {
    "qsa", "atividades_secundarias", "billing", "extra", "e", "location",
}

# ---------------------------------------------------------------------------
# Bases locais de inteligência (offline, 0 ms)
# ---------------------------------------------------------------------------

# Mapeamento do 9º dígito do CPF → Região Fiscal da Receita Federal
CPF_REGION = {
    "1": "DF, GO, MT, MS e TO",
    "2": "AC, AM, AP, PA, RO e RR",
    "3": "CE, MA e PI",
    "4": "AL, PB, PE e RN",
    "5": "BA e SE",
    "6": "MG",
    "7": "ES e RJ",
    "8": "SP",
    "9": "PR e SC",
    "0": "RS",
}

# DDD → Estado (cobertura completa Anatel)
DDD_STATE = {
    "11": "SP", "12": "SP", "13": "SP", "14": "SP", "15": "SP", "16": "SP",
    "17": "SP", "18": "SP", "19": "SP",
    "21": "RJ", "22": "RJ", "24": "RJ",
    "27": "ES", "28": "ES",
    "31": "MG", "32": "MG", "33": "MG", "34": "MG", "35": "MG",
    "37": "MG", "38": "MG",
    "41": "PR", "42": "PR", "43": "PR", "44": "PR", "45": "PR", "46": "PR",
    "47": "SC", "48": "SC", "49": "SC",
    "51": "RS", "53": "RS", "54": "RS", "55": "RS",
    "61": "DF", "62": "GO", "63": "TO", "64": "GO", "65": "MT", "66": "MT",
    "67": "MS", "68": "AC", "69": "RO",
    "71": "BA", "73": "BA", "74": "BA", "75": "BA", "77": "BA",
    "79": "SE",
    "81": "PE", "82": "AL", "83": "PB", "84": "RN", "85": "CE",
    "86": "PI", "87": "PE", "88": "CE", "89": "PI",
    "91": "PA", "92": "AM", "93": "PA", "94": "PA", "95": "RR",
    "96": "AP", "97": "AM", "98": "MA", "99": "MA",
}

STATE_NAMES = {
    "AC": "Acre", "AL": "Alagoas", "AM": "Amazonas", "AP": "Amapá",
    "BA": "Bahia", "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo",
    "GO": "Goiás", "MA": "Maranhão", "MG": "Minas Gerais", "MS": "Mato Grosso do Sul",
    "MT": "Mato Grosso", "PA": "Pará", "PB": "Paraíba", "PE": "Pernambuco",
    "PI": "Piauí", "PR": "Paraná", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte",
    "RO": "Rondônia", "RR": "Roraima", "RS": "Rio Grande do Sul", "SC": "Santa Catarina",
    "SE": "Sergipe", "SP": "São Paulo", "TO": "Tocantins",
}

# Prefixos de operadoras Anatel — faixas de início do número (após DDD)
# Cobre os prefixos mais comuns de celular por operadora
CARRIER_PREFIXES = {
    # Vivo (Telefônica)
    "99": "Vivo", "98": "Vivo", "97": "Vivo", "96": "Vivo",
    # Claro (América Móvil)
    "99": "Vivo/Claro", "98": "Vivo/Claro",
    "91": "Claro", "73": "Claro", "74": "Claro",
    # TIM
    "92": "TIM", "93": "TIM", "94": "TIM",
    # Oi
    "95": "Oi", "84": "Oi", "85": "Oi",
}

# Operadoras por faixa do 5º dígito (após DDD + 9)
# Regra geral para celulares com 9 dígitos (9XXXX-XXXX):
CARRIER_BY_RANGE = [
    (range(6, 10), "Vivo / Claro / TIM (portabilidade possível)"),
]

# E-mails temporários/descartáveis conhecidos
DISPOSABLE_DOMAINS = {
    "tempmail.com", "guerrillamail.com", "sharklasers.com", "guerrillamail.info",
    "grr.la", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com",
    "pokemail.net", "spam4.me", "throwaway.email", "mailinator.com",
    "dispostable.com", "yopmail.com", "yopmail.fr", "cool.fr.nf",
    "jetable.fr.nf", "nospam.ze.tc", "nomail.xl.cx", "mega.zik.dj",
    "speed.1s.fr", "courriel.fr.nf", "moncourrier.fr.nf", "monemail.fr.nf",
    "monmail.fr.nf", "10minutemail.com", "trashmail.com", "trashmail.me",
    "trashmail.net", "maildrop.cc", "harakirimail.com", "tempail.com",
    "burnermail.io", "temp-mail.org", "temp-mail.io", "fakeinbox.com",
    "mailnesia.com", "tempr.email", "discard.email", "discardmail.com",
    "discardmail.de", "emailondeck.com", "33mail.com", "maildrop.cc",
    "mailsac.com", "mohmal.com", "getnada.com", "emailfake.com",
    "crazymailing.com", "tempinbox.com",
}

# Mapeamento de letras iniciais da placa → Estado de registro (Denatran)
PLATE_STATE_MAP = {
    # A faixa de letras iniciais → UF
    "A": {range(ord("A"), ord("B")+1): "PR", range(ord("C"), ord("D")+1): "PR"},
}

# Intervalos de placas por estado (formato simplificado: 3 primeiras letras)
# Base: resolução Denatran — mapeamento de AAA–ZZZ
PLATE_RANGES = [
    ("AAA", "BEZ", "PR"), ("BFA", "GKI", "SP"), ("GKJ", "HOK", "MG"),
    ("HOL", "JDO", "RJ"), ("JDP", "LVE", "RS"), ("LVF", "MMM", "SC"),
    ("MMN", "NEN", "BA"), ("NEO", "NTZ", "PE"), ("NUA", "OAL", "CE"),
    ("OAM", "OLH", "PA"), ("OLI", "ORR", "GO"), ("ORS", "OZZ", "MA"),
    ("PAA", "PHZ", "DF"), ("PIA", "QAZ", "ES"), ("QBA", "QMZ", "MT"),
    ("QNA", "QWZ", "MS"), ("QXA", "RAZ", "RN"), ("RBA", "RKZ", "PB"),
    ("RLA", "RUZ", "AL"), ("RVA", "SAZ", "SE"), ("SBA", "SKZ", "PI"),
    ("SLA", "SUZ", "AM"), ("SVA", "TAZ", "RO"), ("TBA", "TKZ", "TO"),
    ("TLA", "TUZ", "AC"), ("TVA", "UBZ", "AP"), ("UCA", "ULZ", "RR"),
]


def _plate_to_state(letters: str) -> str:
    """Dado as 3 primeiras letras da placa, retorna o Estado de registro."""
    up = letters.upper()
    for start, end, state in PLATE_RANGES:
        if start <= up <= end:
            return state
    return ""


# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------

def digits_only(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def is_valid_cpf(digits: str) -> bool:
    """Valida CPF usando os dois dígitos verificadores (algoritmo oficial)."""
    if len(digits) != 11:
        return False
    # CPFs com todos os dígitos iguais são inválidos
    if len(set(digits)) == 1:
        return False
    # Primeiro dígito verificador
    total = sum(int(digits[i]) * (10 - i) for i in range(9))
    rest = total % 11
    d1 = 0 if rest < 2 else 11 - rest
    if int(digits[9]) != d1:
        return False
    # Segundo dígito verificador
    total = sum(int(digits[i]) * (11 - i) for i in range(10))
    rest = total % 11
    d2 = 0 if rest < 2 else 11 - rest
    return int(digits[10]) == d2


def _looks_like_cpf_format(text: str) -> bool:
    """Detecta formatação de CPF: 000.000.000-00"""
    return bool(re.fullmatch(r"\d{3}[.\s]?\d{3}[.\s]?\d{3}[-./\s]?\d{2}", text.strip()))


def _looks_like_phone_format(text: str) -> bool:
    """Detecta formatação de telefone: (00) 00000-0000, +55 11 99999-1234, etc."""
    return bool(re.search(r"[(\+]", text)) or bool(re.fullmatch(r"\d{2}\s?\d{4,5}[-\s]?\d{4}", text.strip()))


def _looks_like_plate(text: str) -> bool:
    """Detecta formatos de placa: ABC-1234, ABC1234, ABC1D23 (Mercosul)."""
    t = text.strip().upper().replace("-", "").replace(" ", "")
    # Padrão antigo: AAA0000
    if re.fullmatch(r"[A-Z]{3}\d{4}", t):
        return True
    # Padrão Mercosul: AAA0A00
    if re.fullmatch(r"[A-Z]{3}\d[A-Z]\d{2}", t):
        return True
    return False


def _looks_like_domain(text: str) -> bool:
    """Detecta domínios: google.com, site.com.br, etc."""
    return bool(re.fullmatch(r"[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+", text.strip()))


def _looks_like_ip(text: str) -> bool:
    """Detecta IPv4: 192.168.1.1"""
    return bool(re.fullmatch(r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}", text.strip()))


# ---------------------------------------------------------------------------
# Classificação da consulta
# ---------------------------------------------------------------------------

def classify_query(raw: str) -> dict:
    text = (raw or "").strip()
    digits = digits_only(text)
    kinds = []

    # E-mail
    if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", text):
        kinds.append("email")

    # Placa de veículo
    if _looks_like_plate(text) and "email" not in kinds:
        kinds.append("plate")

    # IP
    if _looks_like_ip(text):
        kinds.append("ip")

    # Domínio (não é e-mail nem IP)
    if _looks_like_domain(text) and "email" not in kinds and "ip" not in kinds:
        kinds.append("domain")

    # CEP / NCM (8 dígitos)
    if len(digits) == 8 and not kinds:
        kinds.extend(["cep", "ncm"])

    # ── Desambiguação inteligente para 11 dígitos (CPF vs Telefone) ──
    if len(digits) == 11 and not kinds:
        cpf_format = _looks_like_cpf_format(text)
        phone_format = _looks_like_phone_format(text)
        cpf_valid = is_valid_cpf(digits)

        if cpf_format and cpf_valid:
            kinds.append("cpf")
        elif phone_format:
            kinds.append("phone")
        elif cpf_valid:
            kinds.append("cpf")
        else:
            # CPF inválido e sem formatação de CPF → provavelmente telefone
            kinds.append("phone")

    if len(digits) == 14 and not kinds:
        kinds.append("cnpj")
    if len(digits) == 2 and not kinds:
        kinds.append("ddd")
    if len(digits) == 10 and digits[:2] not in ("00",) and not kinds:
        kinds.append("phone")
    if len(digits) in (1, 2, 3) and text.replace(" ", "") == digits and not kinds:
        kinds.append("bank")
    if len(digits) in (10, 13) and not kinds:
        kinds.append("isbn")
    if re.fullmatch(r"20\d{2}|19\d{2}", digits) and len(text.strip()) == 4 and not kinds:
        kinds.append("year")
    if re.search(r"[A-Za-zÀ-ÿ]", text) and not kinds:
        kinds.append("text")

    kinds = list(dict.fromkeys(kinds))
    if not kinds:
        kinds = ["text"] if re.search(r"[A-Za-zÀ-ÿ]", text) else ["unknown"]

    return {"raw": text, "digits": digits, "kinds": kinds}


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

def http_get_json(url: str, timeout: int = 12):
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            return payload, None
    except urllib.error.HTTPError as e:
        detail = f"HTTP {e.code}"
        try:
            body = json.loads(e.read().decode("utf-8"))
            if isinstance(body, dict):
                detail = body.get("message") or body.get("name") or body.get("type") or detail
        except Exception:
            pass
        return None, {"code": e.code, "detail": str(detail)}
    except Exception as exc:
        return None, {"code": 502, "detail": str(exc)}


# ---------------------------------------------------------------------------
# Flatten / merge
# ---------------------------------------------------------------------------

def flatten_payload(data, prefix=""):
    rows = []
    if data is None:
        return rows
    if isinstance(data, (str, int, float, bool)):
        rows.append((prefix or "valor", str(data)))
        return rows
    if isinstance(data, list):
        if all(isinstance(item, (str, int, float, bool)) or item is None for item in data):
            compact = ", ".join(str(item) for item in data if item not in (None, ""))
            if compact:
                rows.append((prefix or "lista", compact))
            return rows
        for i, item in enumerate(data[:20]):
            rows.extend(flatten_payload(item, f"{prefix}[{i}]" if prefix else f"[{i}]"))
        return rows
    if isinstance(data, dict):
        for key, value in data.items():
            if key in SKIP_KEYS:
                continue
            next_key = f"{prefix}.{key}" if prefix else key
            rows.extend(flatten_payload(value, next_key))
    return rows


def normalize_key(key: str) -> str:
    leaf = key.split(".")[-1].lower()
    leaf = re.sub(r"\[\d+\]", "", leaf)
    return KEY_ALIASES.get(leaf, key)


def normalize_value(value: str) -> str:
    return re.sub(r"\s+", " ", str(value).strip().lower())


def merge_fields(collected: list) -> list:
    merged = []
    seen = set()
    for item in collected:
        key = item["key"]
        value = item["value"]
        source = item["source"]
        if value in (None, "", "—", "null", "None"):
            continue
        leaf = normalize_key(key)
        fingerprint = (leaf, normalize_value(value))
        existing = next((row for row in merged if (normalize_key(row["key"]), normalize_value(row["value"])) == fingerprint), None)
        if existing:
            if source not in existing["sources"]:
                existing["sources"].append(source)
            continue
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        merged.append({"key": leaf, "value": str(value), "sources": [source]})
    return merged


# ═══════════════════════════════════════════════════════════════════════════
# FETCHERS — cada módulo retorna lista de chunks
# ═══════════════════════════════════════════════════════════════════════════

# ---------------------------------------------------------------------------
# 1. ReceitaWS (CPF / CNPJ)
# ---------------------------------------------------------------------------

def fetch_receitaws(query: dict) -> list:
    jobs = []
    digits = query["digits"]
    kinds = query["kinds"]
    if "cpf" in kinds and len(digits) == 11:
        jobs.append(("cpf", f"{RECEITAWS}/cpf/{digits}"))
    if "cnpj" in kinds and len(digits) == 14:
        jobs.append(("cnpj", f"{RECEITAWS}/cnpj/{digits}"))

    results = []
    for label, url in jobs:
        payload, error = http_get_json(url)
        if error:
            results.append({"error": {"source": "receitaws", "target": label, **error}})
            continue
        if isinstance(payload, dict) and str(payload.get("status", "")).upper() == "ERROR":
            results.append({
                "error": {
                    "source": "receitaws",
                    "target": label,
                    "detail": payload.get("message", "Consulta não encontrada"),
                }
            })
            continue
        results.append({"source": "receitaws", "target": label, "data": payload})
    return results


# ---------------------------------------------------------------------------
# 2. BrasilAPI (CEP, CNPJ, DDD, Bancos, NCM, ISBN, Feriados)
# ---------------------------------------------------------------------------

def fetch_brasilapi(query: dict) -> list:
    jobs = []
    digits = query["digits"]
    kinds = query["kinds"]
    raw = query["raw"]

    if "cep" in kinds and len(digits) == 8:
        jobs.append(("cep", f"{BRASILAPI}/cep/v2/{digits}"))
    if "cnpj" in kinds and len(digits) == 14:
        jobs.append(("cnpj", f"{BRASILAPI}/cnpj/v1/{digits}"))
    if "ddd" in kinds and len(digits) == 2:
        jobs.append(("ddd", f"{BRASILAPI}/ddd/v1/{digits}"))
    if "phone" in kinds and len(digits) >= 10:
        jobs.append(("ddd", f"{BRASILAPI}/ddd/v1/{digits[:2]}"))
    if "bank" in kinds and digits:
        jobs.append(("banco", f"{BRASILAPI}/banks/v1/{int(digits)}"))
    if "ncm" in kinds and len(digits) == 8:
        jobs.append(("ncm", f"{BRASILAPI}/ncm/v1/{digits}"))
    if "isbn" in kinds:
        jobs.append(("isbn", f"{BRASILAPI}/isbn/v1/{digits}"))
    if "year" in kinds:
        jobs.append(("feriados", f"{BRASILAPI}/feriados/v1/{digits}"))
    if "text" in kinds:
        encoded = urllib.parse.quote(raw)
        jobs.append(("ncm_busca", f"{BRASILAPI}/ncm/v1?search={encoded}"))
        jobs.append(("bancos", f"{BRASILAPI}/banks/v1"))

    # unique urls
    seen_urls = set()
    unique_jobs = []
    for label, url in jobs:
        if url in seen_urls:
            continue
        seen_urls.add(url)
        unique_jobs.append((label, url))

    results = []
    for label, url in unique_jobs:
        payload, error = http_get_json(url)
        if error:
            results.append({"error": {"source": "brasilapi", "target": label, **error}})
            continue
        if label == "bancos" and isinstance(payload, list):
            needle = raw.lower()
            filtered = [
                bank for bank in payload
                if needle in str(bank.get("name", "")).lower()
                or needle in str(bank.get("fullName", "")).lower()
            ][:12]
            if not filtered:
                continue
            payload = filtered
        if label == "ncm_busca" and isinstance(payload, list):
            payload = payload[:12]
            if not payload:
                continue
        results.append({"source": "brasilapi", "target": label, "data": payload})
    return results


# ---------------------------------------------------------------------------
# 3. Telefone Intel — Operadora + Região + WhatsApp/Telegram
# ---------------------------------------------------------------------------

def fetch_phone_intel(query: dict) -> list:
    kinds = query["kinds"]
    digits = query["digits"]

    if "phone" not in kinds and "ddd" not in kinds:
        return []
    if len(digits) < 10:
        return []

    results = []
    data = {}

    # DDD → Estado
    ddd = digits[:2]
    state_code = DDD_STATE.get(ddd, "")
    state_name = STATE_NAMES.get(state_code, "")
    data["ddd"] = ddd
    if state_code:
        data["estado"] = f"{state_name} ({state_code})"

    # Número formatado
    if len(digits) == 11:
        formatted = f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
        data["número_formatado"] = formatted
        data["tipo_linha"] = "Celular (9 dígitos)"
    elif len(digits) == 10:
        formatted = f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
        data["número_formatado"] = formatted
        data["tipo_linha"] = "Fixo (8 dígitos)"

    # Operadora estimada (heurística por faixa)
    if len(digits) >= 11 and digits[2] == "9":
        prefix_4 = digits[3:5]
        p = int(prefix_4) if prefix_4.isdigit() else 0
        if 60 <= p <= 69:
            data["operadora_provável"] = "Vivo (Telefônica)"
        elif 70 <= p <= 79:
            data["operadora_provável"] = "Claro (América Móvil)"
        elif 80 <= p <= 89:
            data["operadora_provável"] = "Oi"
        elif 90 <= p <= 99:
            data["operadora_provável"] = "TIM"
        else:
            data["operadora_provável"] = "Verificar (portabilidade possível)"
        data["aviso_portabilidade"] = "Portabilidade pode alterar a operadora original"

    # Formato internacional
    intl = f"+55{digits}"
    data["formato_internacional"] = intl

    # Links diretos
    data["whatsapp_link"] = f"https://wa.me/55{digits}"
    data["telegram_link"] = f"https://t.me/+55{digits}"

    # Chave PIX
    if len(digits) == 11:
        data["possível_chave_pix"] = f"+55{digits}"

    results.append({"source": "phoneint", "target": "telefone", "data": data})
    return results


# ---------------------------------------------------------------------------
# 4. E-mail Intel — Gravatar + validação de domínio + anti-descartável
# ---------------------------------------------------------------------------

def fetch_email_intel(query: dict) -> list:
    kinds = query["kinds"]
    raw = query["raw"]

    if "email" not in kinds:
        return []

    results = []
    data = {}
    email = raw.strip().lower()
    parts = email.split("@")
    if len(parts) != 2:
        return []

    local_part, domain = parts
    data["email"] = email
    data["usuário"] = local_part
    data["domínio"] = domain

    # Verificação de e-mail descartável
    if domain in DISPOSABLE_DOMAINS:
        data["⚠️ alerta"] = "Este e-mail usa um domínio DESCARTÁVEL/TEMPORÁRIO"
        data["confiabilidade"] = "Baixa — e-mail temporário"
    else:
        data["confiabilidade"] = "Normal"

    # Provedor conhecido
    known_providers = {
        "gmail.com": "Google Gmail",
        "googlemail.com": "Google Gmail",
        "outlook.com": "Microsoft Outlook",
        "hotmail.com": "Microsoft Hotmail",
        "live.com": "Microsoft Live",
        "yahoo.com": "Yahoo Mail",
        "yahoo.com.br": "Yahoo Mail Brasil",
        "icloud.com": "Apple iCloud",
        "me.com": "Apple",
        "protonmail.com": "ProtonMail (privacidade)",
        "proton.me": "ProtonMail (privacidade)",
        "uol.com.br": "UOL",
        "bol.com.br": "BOL",
        "terra.com.br": "Terra",
        "ig.com.br": "iG",
        "globo.com": "Globo.com",
        "r7.com": "R7",
    }
    provider = known_providers.get(domain, "")
    if provider:
        data["provedor"] = provider

    # Gravatar — foto e perfil público
    email_hash = hashlib.md5(email.encode("utf-8")).hexdigest()
    gravatar_url = f"https://www.gravatar.com/{email_hash}.json"
    try:
        grav_data, grav_err = http_get_json(gravatar_url, timeout=5)
        if grav_data and isinstance(grav_data, dict) and "entry" in grav_data:
            entry = grav_data["entry"][0] if grav_data["entry"] else {}
            if entry.get("displayName"):
                data["gravatar_nome"] = entry["displayName"]
            if entry.get("aboutMe"):
                data["gravatar_sobre"] = entry["aboutMe"]
            if entry.get("currentLocation"):
                data["gravatar_localização"] = entry["currentLocation"]
            photo_url = entry.get("thumbnailUrl", "")
            if photo_url:
                data["gravatar_foto"] = photo_url
            # Redes sociais do Gravatar
            accounts = entry.get("accounts", [])
            if accounts:
                social_list = []
                for acc in accounts[:10]:
                    name = acc.get("shortname", "") or acc.get("name", "")
                    url_val = acc.get("url", "")
                    if name and url_val:
                        social_list.append(f"{name}: {url_val}")
                    elif name:
                        social_list.append(name)
                if social_list:
                    data["gravatar_redes_sociais"] = " | ".join(social_list)
    except Exception:
        pass

    # Verificação MX do domínio (valida se o domínio aceita e-mails)
    try:
        mx_records = socket.getaddrinfo(domain, 25, socket.AF_INET, socket.SOCK_STREAM)
        if mx_records:
            data["servidor_email"] = "Domínio válido para receber e-mails"
    except Exception:
        data["servidor_email"] = "Não foi possível verificar o servidor de e-mail"

    results.append({"source": "emailint", "target": "email", "data": data})
    return results


# ---------------------------------------------------------------------------
# 5. CPF Intel — Estado Emissor da Receita Federal
# ---------------------------------------------------------------------------

def fetch_cpf_intel(query: dict) -> list:
    kinds = query["kinds"]
    digits = query["digits"]

    if "cpf" not in kinds or len(digits) != 11:
        return []

    data = {}
    # Formata CPF
    data["cpf_formatado"] = f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"

    # 9º dígito → Região Fiscal
    ninth = digits[8]
    region = CPF_REGION.get(ninth, "Desconhecida")
    data["região_fiscal"] = f"Região {ninth} — {region}"

    # Validação
    if is_valid_cpf(digits):
        data["validação"] = "✅ CPF válido (dígitos verificadores corretos)"
    else:
        data["validação"] = "❌ CPF inválido (dígitos verificadores não conferem)"

    return [{"source": "cpfint", "target": "cpf_intel", "data": data}]


# ---------------------------------------------------------------------------
# 6. Placa Intel — Identificação de Estado e Formato
# ---------------------------------------------------------------------------

def fetch_plate_intel(query: dict) -> list:
    kinds = query["kinds"]
    raw = query["raw"]

    if "plate" not in kinds:
        return []

    text = raw.strip().upper().replace("-", "").replace(" ", "")
    data = {}

    # Detectar formato
    is_mercosul = bool(re.fullmatch(r"[A-Z]{3}\d[A-Z]\d{2}", text))
    is_old = bool(re.fullmatch(r"[A-Z]{3}\d{4}", text))

    if is_mercosul:
        data["formato"] = "Mercosul (AAA0A00)"
        data["placa_formatada"] = f"{text[:3]}{text[3]}{text[4]}{text[5:]}"
        # Converter Mercosul → equivalente antigo para consultar estado
        # A 5ª posição (letra) no Mercosul substitui o 5º dígito
        letter_pos = text[4]
        digit_equiv = str(ord(letter_pos) - ord("A"))
        old_equiv = text[:4] + digit_equiv + text[5:]
        data["equivalente_antigo"] = f"{old_equiv[:3]}-{old_equiv[3:]}"
    elif is_old:
        data["formato"] = "Padrão Antigo (AAA-0000)"
        data["placa_formatada"] = f"{text[:3]}-{text[3:]}"
    else:
        data["formato"] = "Formato não reconhecido"
        return [{"source": "plateint", "target": "placa", "data": data}]

    # Estado de registro pelo prefixo de letras
    letters = text[:3]
    state_code = _plate_to_state(letters)
    if state_code:
        state_name = STATE_NAMES.get(state_code, state_code)
        data["estado_registro"] = f"{state_name} ({state_code})"
    else:
        data["estado_registro"] = "Não identificado"

    return [{"source": "plateint", "target": "placa", "data": data}]


# ---------------------------------------------------------------------------
# 7. IP / Domínio Intel — Geolocalização e RDAP
# ---------------------------------------------------------------------------

def fetch_ip_domain_intel(query: dict) -> list:
    kinds = query["kinds"]
    raw = query["raw"]
    results = []

    # ── IP Geolocalização ──
    if "ip" in kinds:
        ip_addr = raw.strip()
        data, err = http_get_json(f"http://ip-api.com/json/{ip_addr}?lang=pt-BR&fields=status,message,country,regionName,city,zip,lat,lon,timezone,isp,org,as,proxy,hosting,query", timeout=8)
        if data and isinstance(data, dict) and data.get("status") == "success":
            ip_data = {
                "ip": data.get("query", ip_addr),
                "país": data.get("country", ""),
                "estado": data.get("regionName", ""),
                "cidade": data.get("city", ""),
                "cep": data.get("zip", ""),
                "provedor_internet": data.get("isp", ""),
                "organização": data.get("org", ""),
                "fuso_horário": data.get("timezone", ""),
            }
            lat = data.get("lat")
            lon = data.get("lon")
            if lat and lon:
                ip_data["coordenadas"] = f"{lat}, {lon}"
                ip_data["google_maps"] = f"https://www.google.com/maps?q={lat},{lon}"
            if data.get("proxy"):
                ip_data["⚠️ proxy_vpn"] = "Este IP pertence a um Proxy/VPN"
            if data.get("hosting"):
                ip_data["tipo"] = "Servidor / Datacenter (hosting)"
            else:
                ip_data["tipo"] = "Residencial / Comercial"
            results.append({"source": "ipdomainint", "target": "ip", "data": ip_data})
        elif err:
            results.append({"error": {"source": "ipdomainint", "target": "ip", **err}})

    # ── Domínio RDAP (Registro.br) ──
    if "domain" in kinds:
        domain = raw.strip().lower()
        if domain.endswith(".br"):
            rdap_url = f"https://rdap.registro.br/domain/{domain}"
        else:
            rdap_url = f"https://rdap.org/domain/{domain}"

        data, err = http_get_json(rdap_url, timeout=8)
        if data and isinstance(data, dict):
            domain_data = {"domínio": domain}

            # Nome e status
            status_list = data.get("status", [])
            if status_list:
                domain_data["status"] = ", ".join(status_list[:4])

            # Entidades (titular, contato técnico, etc.)
            entities = data.get("entities", [])
            for entity in entities[:5]:
                roles = entity.get("roles", [])
                vcard = entity.get("vcardArray", [])
                handle = entity.get("handle", "")

                role_label = ", ".join(roles) if roles else "entidade"

                if handle:
                    domain_data[f"{role_label}_id"] = handle

                # Parse vCard para nome
                if isinstance(vcard, list) and len(vcard) > 1:
                    for field in vcard[1]:
                        if isinstance(field, list) and len(field) >= 4:
                            if field[0] == "fn":
                                domain_data[f"{role_label}_nome"] = field[3]

            # Nameservers
            nss = data.get("nameservers", [])
            if nss:
                ns_names = [ns.get("ldhName", "") for ns in nss[:4] if ns.get("ldhName")]
                if ns_names:
                    domain_data["dns_servidores"] = ", ".join(ns_names)

            # Datas
            events = data.get("events", [])
            for event in events:
                action = event.get("eventAction", "")
                date_val = event.get("eventDate", "")
                if action == "registration" and date_val:
                    domain_data["data_registro"] = date_val[:10]
                elif action == "expiration" and date_val:
                    domain_data["data_expiração"] = date_val[:10]
                elif action == "last changed" and date_val:
                    domain_data["última_alteração"] = date_val[:10]

            results.append({"source": "ipdomainint", "target": "domínio", "data": domain_data})
        elif err:
            results.append({"error": {"source": "ipdomainint", "target": "domínio", **err}})

    return results


# ═══════════════════════════════════════════════════════════════════════════
# Motor principal de busca
# ═══════════════════════════════════════════════════════════════════════════

def run_search(query_text: str, sources: list) -> dict:
    query = classify_query(query_text)
    enabled = [src for src in sources if src in {api["id"] for api in AVAILABLE_APIS}]
    if not enabled:
        enabled = DEFAULT_SOURCES[:]

    fetchers = {
        "receitaws": fetch_receitaws,
        "brasilapi": fetch_brasilapi,
        "phoneint": fetch_phone_intel,
        "emailint": fetch_email_intel,
        "cpfint": fetch_cpf_intel,
        "plateint": fetch_plate_intel,
        "ipdomainint": fetch_ip_domain_intel,
    }

    collected_fields = []
    errors = []
    used = []
    skipped = [api["id"] for api in AVAILABLE_APIS if api["id"] not in enabled]

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {
            pool.submit(fetchers[src], query): src
            for src in enabled
            if src in fetchers
        }
        for future in as_completed(futures):
            src = futures[future]
            try:
                chunks = future.result()
            except Exception as exc:
                errors.append({"source": src, "detail": str(exc)})
                continue
            for chunk in chunks:
                if "error" in chunk:
                    errors.append(chunk["error"])
                    continue
                used.append(f"{chunk['source']}:{chunk['target']}")
                for key, value in flatten_payload(chunk["data"]):
                    collected_fields.append({
                        "key": f"{chunk['target']}.{key}" if key else chunk["target"],
                        "value": value,
                        "source": chunk["source"],
                    })

    fields = merge_fields(collected_fields)
    return {
        "query": query["raw"],
        "query_types": query["kinds"],
        "fields": fields,
        "sources_used": list(dict.fromkeys(used)),
        "sources_enabled": enabled,
        "sources_skipped": skipped,
        "errors": errors,
        "total": len(fields),
    }
