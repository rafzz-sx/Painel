import json
import re
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

USER_AGENT = "PainelDados/1.0"
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


def digits_only(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def classify_query(raw: str) -> dict:
    text = (raw or "").strip()
    digits = digits_only(text)
    kinds = []

    if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", text):
        kinds.append("email")
    if len(digits) == 8:
        kinds.extend(["cep", "ncm"])
    if len(digits) == 11:
        kinds.extend(["cpf", "phone"])
    if len(digits) == 14:
        kinds.append("cnpj")
    if len(digits) == 2:
        kinds.append("ddd")
    if len(digits) in (10, 11) and digits[:2] not in ("00",):
        kinds.append("phone")
    if len(digits) in (1, 2, 3) and text.replace(" ", "") == digits and "cep" not in kinds and "cpf" not in kinds and "cnpj" not in kinds:
        kinds.append("bank")
    if len(digits) in (10, 13) and not kinds:
        kinds.append("isbn")
    if re.fullmatch(r"20\d{2}|19\d{2}", digits) and len(text.strip()) == 4:
        kinds.append("year")
    if re.search(r"[A-Za-zÀ-ÿ]", text) and "email" not in kinds:
        kinds.append("text")

    kinds = list(dict.fromkeys(kinds))
    if not kinds:
        kinds = ["text"] if re.search(r"[A-Za-zÀ-ÿ]", text) else ["unknown"]

    return {"raw": text, "digits": digits, "kinds": kinds}


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


def run_search(query_text: str, sources: list) -> dict:
    query = classify_query(query_text)
    enabled = [src for src in sources if src in {api["id"] for api in AVAILABLE_APIS}]
    if not enabled:
        enabled = DEFAULT_SOURCES[:]

    fetchers = {
        "receitaws": fetch_receitaws,
        "brasilapi": fetch_brasilapi,
    }

    collected_fields = []
    errors = []
    used = []
    skipped = [api["id"] for api in AVAILABLE_APIS if api["id"] not in enabled]

    with ThreadPoolExecutor(max_workers=4) as pool:
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
