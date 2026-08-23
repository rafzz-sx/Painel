import hashlib
import json
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

USER_AGENT = "PainelDados/3.0 (OSINT & Public Data Aggregator)"
BRASILAPI = "https://brasilapi.com.br/api"
RECEITAWS = "https://receitaws.com.br/v1"
MINHARECEITA = "https://minhareceita.org"
GITHUB_API = "https://api.github.com"

AVAILABLE_APIS = [
    {
        "id": "minhareceita",
        "name": "Minha Receita (CNPJ & Sócios)",
        "active_by_default": True,
        "description": "Dados completos de CNPJ, Quadro de Sócios (QSA), CNAE e Capital.",
        "supports": ["CNPJ"],
    },
    {
        "id": "receitaws",
        "name": "ReceitaWS",
        "active_by_default": True,
        "description": "Consulta CNPJ na Receita Federal.",
        "supports": ["CNPJ"],
    },
    {
        "id": "brasilapi",
        "name": "BrasilAPI",
        "active_by_default": True,
        "description": "Dados públicos: CEP, CNPJ, DDD, bancos, NCM, ISBN e feriados.",
        "supports": ["CEP", "CNPJ", "DDD", "Telefone", "Banco", "NCM", "ISBN", "Ano"],
    },
    {
        "id": "nameint",
        "name": "Nome Intel (Pessoas & Diários)",
        "active_by_default": True,
        "description": "Perfis públicos no GitHub, Diários Oficiais, Transparência Federal e Sócios.",
        "supports": ["Nome"],
    },
    {
        "id": "phoneint",
        "name": "Telefone Intel",
        "active_by_default": True,
        "description": "Operadora Anatel, região, links WhatsApp, Telegram e identificadores OSINT.",
        "supports": ["Telefone", "Celular"],
    },
    {
        "id": "emailint",
        "name": "E-mail Intel",
        "active_by_default": True,
        "description": "Gravatar (foto e perfil), GitHub, pegada social, validação MX e anti-descartável.",
        "supports": ["E-mail"],
    },
    {
        "id": "cpfint",
        "name": "CPF Intel",
        "active_by_default": True,
        "description": "Validação algorítmica, Estado emissor (9º dígito) e portal oficial da Receita.",
        "supports": ["CPF"],
    },
    {
        "id": "plateint",
        "name": "Placa Intel",
        "active_by_default": True,
        "description": "Padrão Mercosul/Antigo e Estado de registro Denatran.",
        "supports": ["Placa"],
    },
    {
        "id": "ipdomainint",
        "name": "IP/Domínio Intel",
        "active_by_default": True,
        "description": "Geolocalização de IP (ISP/VPN) e consulta RDAP de domínios .br.",
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
    "billing", "extra", "e", "location",
}

# ---------------------------------------------------------------------------
# Bases locais de inteligência (offline, 0 ms)
# ---------------------------------------------------------------------------

# Mapeamento do 9º dígito do CPF → Região Fiscal da Receita Federal
CPF_REGION = {
    "1": "DF, GO, MT, MS e TO (1ª Região Fiscal)",
    "2": "AC, AM, AP, PA, RO e RR (2ª Região Fiscal)",
    "3": "CE, MA e PI (3ª Região Fiscal)",
    "4": "AL, PB, PE e RN (4ª Região Fiscal)",
    "5": "BA e SE (5ª Região Fiscal)",
    "6": "MG (6ª Região Fiscal)",
    "7": "ES e RJ (7ª Região Fiscal)",
    "8": "SP (8ª Região Fiscal)",
    "9": "PR e SC (9ª Região Fiscal)",
    "0": "RS (10ª Região Fiscal)",
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
    "discardmail.de", "emailondeck.com", "33mail.com", "mailsac.com",
    "mohmal.com", "getnada.com", "emailfake.com", "crazymailing.com",
}

# Intervalos de placas por estado (Denatran)
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
    up = letters.upper()
    for start, end, state in PLATE_RANGES:
        if start <= up <= end:
            return state
    return ""


# ---------------------------------------------------------------------------
# Utilitários de Formato e Validação
# ---------------------------------------------------------------------------

def digits_only(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def is_valid_cpf(digits: str) -> bool:
    """Valida CPF usando os dois dígitos verificadores (algoritmo oficial)."""
    if len(digits) != 11:
        return False
    if len(set(digits)) == 1:
        return False
    # 1º dígito verificador
    total = sum(int(digits[i]) * (10 - i) for i in range(9))
    rest = total % 11
    d1 = 0 if rest < 2 else 11 - rest
    if int(digits[9]) != d1:
        return False
    # 2º dígito verificador
    total = sum(int(digits[i]) * (11 - i) for i in range(10))
    rest = total % 11
    d2 = 0 if rest < 2 else 11 - rest
    return int(digits[10]) == d2


def _looks_like_cpf_format(text: str) -> bool:
    return bool(re.fullmatch(r"\d{3}[.\s]?\d{3}[.\s]?\d{3}[-./\s]?\d{2}", text.strip()))


def _looks_like_phone_format(text: str) -> bool:
    return bool(re.search(r"[(\+]", text)) or bool(re.fullmatch(r"\d{2}\s?\d{4,5}[-\s]?\d{4}", text.strip()))


def _looks_like_plate(text: str) -> bool:
    t = text.strip().upper().replace("-", "").replace(" ", "")
    if re.fullmatch(r"[A-Z]{3}\d{4}", t):
        return True
    if re.fullmatch(r"[A-Z]{3}\d[A-Z]\d{2}", t):
        return True
    return False


def _looks_like_domain(text: str) -> bool:
    return bool(re.fullmatch(r"[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+", text.strip()))


def _looks_like_ip(text: str) -> bool:
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

    # CPF vs Telefone (11 dígitos)
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
            kinds.append("phone")

    # CNPJ (14 dígitos)
    if len(digits) == 14 and not kinds:
        kinds.append("cnpj")

    # DDD (2 dígitos)
    if len(digits) == 2 and not kinds:
        kinds.append("ddd")

    # Telefone fixo (10 dígitos)
    if len(digits) == 10 and digits[:2] not in ("00",) and not kinds:
        kinds.append("phone")

    # Código de banco (1 a 3 dígitos puros)
    if len(digits) in (1, 2, 3) and text.replace(" ", "") == digits and not kinds:
        kinds.append("bank")

    # ISBN (10 ou 13 dígitos)
    if len(digits) in (10, 13) and not kinds:
        kinds.append("isbn")

    # Ano
    if re.fullmatch(r"20\d{2}|19\d{2}", digits) and len(text.strip()) == 4 and not kinds:
        kinds.append("year")

    # Nome / Texto
    if re.search(r"[A-Za-zÀ-ÿ]", text) and "email" not in kinds and "domain" not in kinds and "plate" not in kinds:
        kinds.append("name")

    kinds = list(dict.fromkeys(kinds))
    if not kinds:
        kinds = ["name"] if re.search(r"[A-Za-zÀ-ÿ]", text) else ["unknown"]

    return {"raw": text, "digits": digits, "kinds": kinds}


# ---------------------------------------------------------------------------
# HTTP Helper com headers adequados
# ---------------------------------------------------------------------------

def http_get_json(url: str, timeout: int = 10, headers: dict = None):
    req_headers = {
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    if headers:
        req_headers.update(headers)

    req = urllib.request.Request(url, headers=req_headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            return payload, None
    except urllib.error.HTTPError as e:
        detail = f"HTTP {e.code}"
        try:
            body = json.loads(e.read().decode("utf-8"))
            if isinstance(body, dict):
                detail = body.get("message") or body.get("name") or body.get("detail") or detail
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
        for i, item in enumerate(data[:15]):
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
# FETCHERS ESPECÍFICOS DE INTELIGÊNCIA
# ═══════════════════════════════════════════════════════════════════════════

# ---------------------------------------------------------------------------
# 1. Minha Receita (CNPJ, Sócios/QSA, CNAE, Capital Social)
# ---------------------------------------------------------------------------

def fetch_minhareceita(query: dict) -> list:
    digits = query["digits"]
    kinds = query["kinds"]
    if "cnpj" not in kinds or len(digits) != 14:
        return []

    url = f"{MINHARECEITA}/{digits}"
    payload, error = http_get_json(url, timeout=10)
    if error:
        return []
    if not isinstance(payload, dict):
        return []

    data = {
        "cnpj": payload.get("cnpj", digits),
        "razao_social": payload.get("razao_social", ""),
        "nome_fantasia": payload.get("nome_fantasia", ""),
        "situacao_cadastral": payload.get("descricao_situacao_cadastral", ""),
        "data_abertura": payload.get("data_inicio_atividade", ""),
        "capital_social": f"R$ {payload.get('capital_social', 0):,.2f}" if payload.get("capital_social") else "",
        "porte": payload.get("porte", ""),
        "natureza_juridica": payload.get("natureza_juridica", ""),
        "cnae_principal": payload.get("cnae_fiscal_descricao", ""),
        "logradouro": f"{payload.get('descricao_tipo_de_logradouro', '')} {payload.get('logradouro', '')}".strip(),
        "numero": str(payload.get("numero", "")),
        "bairro": payload.get("bairro", ""),
        "municipio": payload.get("municipio", ""),
        "uf": payload.get("uf", ""),
        "cep": payload.get("cep", ""),
        "telefone": payload.get("ddd_telefone_1", ""),
        "email": payload.get("email", ""),
    }

    # Sócios (QSA)
    socios = payload.get("qsa", [])
    if isinstance(socios, list) and socios:
        qsa_list = []
        for s in socios[:10]:
            nome_socio = s.get("nome_socio", "")
            qualificacao = s.get("qualificacao_socio", "")
            faixa_etaria = s.get("faixa_etaria", "")
            info = nome_socio
            if qualificacao:
                info += f" ({qualificacao})"
            if faixa_etaria and faixa_etaria != "Não se aplica":
                info += f" [{faixa_etaria}]"
            if info:
                qsa_list.append(info)
        if qsa_list:
            data["quadro_de_socios_qsa"] = " | ".join(qsa_list)

    return [{"source": "minhareceita", "target": "cnpj", "data": {k: v for k, v in data.items() if v}}]


# ---------------------------------------------------------------------------
# 2. ReceitaWS (CNPJ)
# ---------------------------------------------------------------------------

def fetch_receitaws(query: dict) -> list:
    digits = query["digits"]
    kinds = query["kinds"]
    if "cnpj" not in kinds or len(digits) != 14:
        return []

    url = f"{RECEITAWS}/cnpj/{digits}"
    payload, error = http_get_json(url, timeout=8)
    if error:
        return []
    if isinstance(payload, dict) and str(payload.get("status", "")).upper() == "ERROR":
        return []
    return [{"source": "receitaws", "target": "cnpj", "data": payload}]


# ---------------------------------------------------------------------------
# 3. BrasilAPI (CEP, CNPJ, DDD, Bancos, NCM, ISBN, Feriados)
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

    results = []
    for label, url in jobs:
        payload, error = http_get_json(url, timeout=8)
        if error or not payload:
            continue
        results.append({"source": "brasilapi", "target": label, "data": payload})
    return results


# ---------------------------------------------------------------------------
# 4. Nome Intel — GitHub Search, Diários Oficiais, Transparência & OSINT
# ---------------------------------------------------------------------------

def fetch_name_intel(query: dict) -> list:
    kinds = query["kinds"]
    raw = query["raw"].strip()

    if "name" not in kinds:
        return []

    data = {
        "termo_pesquisado": raw,
    }

    # 1. GitHub Public Profiles by Name
    try:
        encoded_name = urllib.parse.quote(raw)
        gh_url = f"{GITHUB_API}/search/users?q={encoded_name}+in:name&per_page=3"
        gh_data, gh_err = http_get_json(gh_url, timeout=6)
        if gh_data and isinstance(gh_data, dict) and gh_data.get("items"):
            items = gh_data["items"]
            first_user = items[0]
            username = first_user.get("login", "")
            avatar = first_user.get("avatar_url", "")
            profile_url = first_user.get("html_url", "")

            if avatar:
                data["github_avatar"] = avatar
            if username:
                data["github_perfil_publico"] = profile_url or f"https://github.com/{username}"
                # Buscar detalhes do perfil para bio / empresa / localização
                u_data, _ = http_get_json(f"{GITHUB_API}/users/{username}", timeout=5)
                if u_data and isinstance(u_data, dict):
                    if u_data.get("name"):
                        data["github_nome_completo"] = u_data["name"]
                    if u_data.get("bio"):
                        data["github_biografia"] = u_data["bio"]
                    if u_data.get("company"):
                        data["github_empresa"] = u_data["company"]
                    if u_data.get("location"):
                        data["github_localizacao"] = u_data["location"]
                    if u_data.get("blog"):
                        data["github_website"] = u_data["blog"]
                    if u_data.get("twitter_username"):
                        data["twitter_x"] = f"https://x.com/{u_data['twitter_username']}"
    except Exception:
        pass

    # 2. Portal da Transparência do Governo Federal (Servidores / PEP / Benefícios)
    encoded_query = urllib.parse.quote_plus(raw)
    data["portal_transparencia_federal"] = f"https://portaldatransparencia.gov.br/busca?termo={encoded_query}"

    # 3. Querido Diário / Diários Oficiais dos Municípios (Open Knowledge Brasil)
    data["diarios_oficiais_municipais"] = f"https://queridodiario.ok.org.br/pesquisa?termo={encoded_query}"

    # 4. Jusbrasil (Processos e Publicações Jurídicas)
    data["jusbrasil_publicacoes"] = f"https://www.jusbrasil.com.br/busca?q={encoded_query}"

    # 5. Escavador (Diários Oficiais & Pessoas)
    data["escavador_diarios"] = f"https://www.escavador.com/busca?q={encoded_query}"

    return [{"source": "nameint", "target": "nome_intel", "data": data}]


# ---------------------------------------------------------------------------
# 5. Telefone Intel — Operadora Anatel, WhatsApp, Telegram, Truecaller OSINT
# ---------------------------------------------------------------------------

def fetch_phone_intel(query: dict) -> list:
    kinds = query["kinds"]
    digits = query["digits"]

    if "phone" not in kinds and "ddd" not in kinds:
        return []
    if len(digits) < 10:
        return []

    data = {}
    ddd = digits[:2]
    state_code = DDD_STATE.get(ddd, "")
    state_name = STATE_NAMES.get(state_code, "")
    data["ddd"] = ddd
    if state_code:
        data["estado"] = f"{state_name} ({state_code})"

    if len(digits) == 11:
        formatted = f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
        data["numero_formatado"] = formatted
        data["tipo_linha"] = "Celular (9 dígitos)"
    elif len(digits) == 10:
        formatted = f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
        data["numero_formatado"] = formatted
        data["tipo_linha"] = "Fixo (8 dígitos)"

    # Operadora provável (faixa Anatel)
    if len(digits) >= 11 and digits[2] == "9":
        prefix_4 = digits[3:5]
        p = int(prefix_4) if prefix_4.isdigit() else 0
        if 60 <= p <= 69:
            data["operadora_provavel"] = "Vivo (Telefônica Brasil)"
        elif 70 <= p <= 79:
            data["operadora_provavel"] = "Claro (América Móvil)"
        elif 80 <= p <= 89:
            data["operadora_provavel"] = "Oi Móvel"
        elif 90 <= p <= 99:
            data["operadora_provavel"] = "TIM Brasil"
        else:
            data["operadora_provavel"] = "Operadora Geral (portabilidade possível)"
        data["aviso_portabilidade"] = "Portabilidade numérica pode ter transferido a linha"

    intl = f"+55{digits}"
    data["formato_internacional"] = intl
    data["whatsapp_link"] = f"https://wa.me/55{digits}"
    data["telegram_link"] = f"https://t.me/+55{digits}"

    # OSINT Caller ID & Social Links
    data["truecaller_osint"] = f"https://www.truecaller.com/search/br/{digits}"
    data["syncme_osint"] = f"https://sync.me/search/?number=+55{digits}"

    if len(digits) == 11:
        data["possivel_chave_pix"] = f"+55{digits}"

    return [{"source": "phoneint", "target": "telefone", "data": data}]


# ---------------------------------------------------------------------------
# 6. E-mail Intel — Gravatar, GitHub Search, Validação MX, Anti-Descartável
# ---------------------------------------------------------------------------

def fetch_email_intel(query: dict) -> list:
    kinds = query["kinds"]
    raw = query["raw"]

    if "email" not in kinds:
        return []

    email = raw.strip().lower()
    parts = email.split("@")
    if len(parts) != 2:
        return []

    local_part, domain = parts
    data = {
        "email": email,
        "usuario": local_part,
        "dominio": domain,
    }

    # Descartável
    if domain in DISPOSABLE_DOMAINS:
        data["alerta_segurança"] = "⚠️ E-mail TEMPORÁRIO / DESCARTÁVEL (Baixa confiabilidade)"
        data["confiabilidade"] = "Baixa — Domínio de descarte"
    else:
        data["confiabilidade"] = "Normal (Provedor ativo)"

    # Provedor
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
        "protonmail.com": "ProtonMail (Criptografia Suíça)",
        "proton.me": "ProtonMail",
        "uol.com.br": "UOL Brasil",
        "bol.com.br": "BOL",
        "terra.com.br": "Terra Brasil",
        "ig.com.br": "iG",
        "globo.com": "Globo.com",
    }
    if domain in known_providers:
        data["provedor_identificado"] = known_providers[domain]

    # 1. Gravatar (Foto e Perfil)
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
                data["gravatar_localizacao"] = entry["currentLocation"]
            photo_url = entry.get("thumbnailUrl", "")
            if photo_url:
                data["gravatar_foto"] = photo_url
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
                    data["gravatar_contas_vinculadas"] = " | ".join(social_list)
    except Exception:
        pass

    # 2. GitHub Search by Email
    try:
        gh_url = f"{GITHUB_API}/search/users?q={email}+in:email"
        gh_data, _ = http_get_json(gh_url, timeout=5)
        if gh_data and isinstance(gh_data, dict) and gh_data.get("items"):
            user = gh_data["items"][0]
            uname = user.get("login", "")
            avatar = user.get("avatar_url", "")
            if uname:
                data["github_conta_encontrada"] = f"https://github.com/{uname}"
            if avatar and "gravatar_foto" not in data:
                data["github_avatar"] = avatar
    except Exception:
        pass

    # 3. Verificação MX do Domínio
    try:
        mx_records = socket.getaddrinfo(domain, 25, socket.AF_INET, socket.SOCK_STREAM)
        if mx_records:
            data["servidor_de_email_mx"] = "✅ Domínio com servidor de e-mail ativo"
    except Exception:
        data["servidor_de_email_mx"] = "Não foi possível verificar os registros MX"

    # 4. Links OSINT de Redes Sociais
    data["google_account_check"] = f"https://myaccount.google.com/?email={urllib.parse.quote(email)}"
    data["instagram_recovery_check"] = "https://www.instagram.com/accounts/password/reset/"

    return [{"source": "emailint", "target": "email", "data": data}]


# ---------------------------------------------------------------------------
# 7. CPF Intel — Validação, Região Fiscal e Link Oficial
# ---------------------------------------------------------------------------

def fetch_cpf_intel(query: dict) -> list:
    kinds = query["kinds"]
    digits = query["digits"]

    if "cpf" not in kinds or len(digits) != 11:
        return []

    data = {
        "cpf_formatado": f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}",
    }

    # 9º dígito → Região Fiscal
    ninth = digits[8]
    region = CPF_REGION.get(ninth, "Região Desconhecida")
    data["regiao_fiscal_emissora"] = f"{region}"

    # Validação dos dígitos verificadores
    if is_valid_cpf(digits):
        data["validacao_oficial"] = "✅ CPF Válido (Dígitos verificadores corretos)"
    else:
        data["validacao_oficial"] = "❌ CPF Inválido (Dígitos verificadores não conferem)"

    # Link oficial da Receita Federal
    data["receita_federal_comprovante"] = "https://servicos.receitafederal.fazenda.gov.br/servicos/cpf/consultasituacao/consultapublica.asp"

    return [{"source": "cpfint", "target": "cpf_intel", "data": data}]


# ---------------------------------------------------------------------------
# 8. Placa Intel — Padrão Mercosul/Antigo e Estado Denatran
# ---------------------------------------------------------------------------

def fetch_plate_intel(query: dict) -> list:
    kinds = query["kinds"]
    raw = query["raw"]

    if "plate" not in kinds:
        return []

    text = raw.strip().upper().replace("-", "").replace(" ", "")
    data = {}

    is_mercosul = bool(re.fullmatch(r"[A-Z]{3}\d[A-Z]\d{2}", text))
    is_old = bool(re.fullmatch(r"[A-Z]{3}\d{4}", text))

    if is_mercosul:
        data["formato"] = "Mercosul (AAA0A00)"
        data["placa_formatada"] = f"{text[:3]}{text[3]}{text[4]}{text[5:]}"
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

    letters = text[:3]
    state_code = _plate_to_state(letters)
    if state_code:
        state_name = STATE_NAMES.get(state_code, state_code)
        data["estado_de_registro"] = f"{state_name} ({state_code})"
    else:
        data["estado_de_registro"] = "Não identificado nas faixas Denatran"

    return [{"source": "plateint", "target": "placa", "data": data}]


# ---------------------------------------------------------------------------
# 9. IP / Domínio Intel — Geolocalização e RDAP Registro.br
# ---------------------------------------------------------------------------

def fetch_ip_domain_intel(query: dict) -> list:
    kinds = query["kinds"]
    raw = query["raw"]
    results = []

    if "ip" in kinds:
        ip_addr = raw.strip()
        data, err = http_get_json(
            f"http://ip-api.com/json/{ip_addr}?lang=pt-BR&fields=status,message,country,regionName,city,zip,lat,lon,timezone,isp,org,as,proxy,hosting,query",
            timeout=7
        )
        if data and isinstance(data, dict) and data.get("status") == "success":
            ip_data = {
                "ip": data.get("query", ip_addr),
                "pais": data.get("country", ""),
                "estado": data.get("regionName", ""),
                "cidade": data.get("city", ""),
                "cep": data.get("zip", ""),
                "provedor_isp": data.get("isp", ""),
                "organizacao": data.get("org", ""),
                "fuso_horario": data.get("timezone", ""),
            }
            lat = data.get("lat")
            lon = data.get("lon")
            if lat and lon:
                ip_data["coordenadas_gps"] = f"{lat}, {lon}"
                ip_data["google_maps"] = f"https://www.google.com/maps?q={lat},{lon}"
            if data.get("proxy"):
                ip_data["alerta_proxy"] = "⚠️ Conexão via Proxy / VPN detectada"
            ip_data["tipo_conexao"] = "Datacenter / Hosting" if data.get("hosting") else "Residencial / Comercial"
            results.append({"source": "ipdomainint", "target": "ip", "data": ip_data})

    if "domain" in kinds:
        domain = raw.strip().lower()
        rdap_url = f"https://rdap.registro.br/domain/{domain}" if domain.endswith(".br") else f"https://rdap.org/domain/{domain}"
        data, err = http_get_json(rdap_url, timeout=7)
        if data and isinstance(data, dict):
            domain_data = {"dominio": domain}
            status_list = data.get("status", [])
            if status_list:
                domain_data["status_registro"] = ", ".join(status_list[:3])
            entities = data.get("entities", [])
            for entity in entities[:4]:
                roles = entity.get("roles", [])
                handle = entity.get("handle", "")
                role_label = ", ".join(roles) if roles else "entidade"
                if handle:
                    domain_data[f"{role_label}_documento"] = handle
                vcard = entity.get("vcardArray", [])
                if isinstance(vcard, list) and len(vcard) > 1:
                    for field in vcard[1]:
                        if isinstance(field, list) and len(field) >= 4 and field[0] == "fn":
                            domain_data[f"{role_label}_nome"] = field[3]

            nss = data.get("nameservers", [])
            if nss:
                ns_names = [ns.get("ldhName", "") for ns in nss[:4] if ns.get("ldhName")]
                if ns_names:
                    domain_data["dns_servidores"] = ", ".join(ns_names)

            events = data.get("events", [])
            for event in events:
                action = event.get("eventAction", "")
                date_val = event.get("eventDate", "")
                if action == "registration" and date_val:
                    domain_data["data_criacao"] = date_val[:10]
                elif action == "expiration" and date_val:
                    domain_data["data_expiracao"] = date_val[:10]

            results.append({"source": "ipdomainint", "target": "dominio", "data": domain_data})

    return results


# ═══════════════════════════════════════════════════════════════════════════
# Motor Principal de Busca
# ═══════════════════════════════════════════════════════════════════════════

def run_search(query_text: str, sources: list) -> dict:
    query = classify_query(query_text)
    enabled = [src for src in sources if src in {api["id"] for api in AVAILABLE_APIS}]
    if not enabled:
        enabled = DEFAULT_SOURCES[:]

    fetchers = {
        "minhareceita": fetch_minhareceita,
        "receitaws": fetch_receitaws,
        "brasilapi": fetch_brasilapi,
        "nameint": fetch_name_intel,
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

    with ThreadPoolExecutor(max_workers=8) as pool:
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
