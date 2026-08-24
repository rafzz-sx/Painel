"""
vault_search.py — Motor de busca local no Data Vault
=====================================================
Lê arquivos PDF, TXT, CSV, JSON, SQL, TSV e LOG da pasta data_vault/ e
busca correspondências com o termo de consulta do usuário.

Comportamento:
  - Se encontrar dados: retorna lista de resultados com arquivo e trecho.
  - Se NÃO encontrar: retorna lista vazia (100% silencioso).
"""

import csv
import io
import json
import os
import re
import unicodedata
from pathlib import Path

# Tamanho máximo de arquivo individual (50 MB)
MAX_FILE_SIZE = 50 * 1024 * 1024

# Extensões suportadas
SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".csv", ".json", ".sql", ".tsv", ".log"}

# Pasta padrão do Data Vault
VAULT_DIR = Path(__file__).parent / "data_vault"


# ---------------------------------------------------------------------------
# Normalização de texto para busca
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    """Remove acentos, converte para minúsculo e colapsa espaços."""
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_text = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", ascii_text.lower().strip())


def _digits_only(text: str) -> str:
    """Extrai apenas dígitos de uma string."""
    return re.sub(r"\D", "", text)


def _build_search_patterns(query: str) -> list:
    """
    Gera múltiplos padrões de busca a partir do query:
    - Texto normalizado original
    - Apenas dígitos (para CPF, telefone, placa com/sem máscara)
    - Variantes com e sem pontuação
    """
    patterns = set()
    normalized = _normalize(query)
    if normalized:
        patterns.add(normalized)

    digits = _digits_only(query)

    # CPF: 12345678900 ↔ 123.456.789-00
    if len(digits) == 11:
        patterns.add(digits)
        patterns.add(f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}")

    # CNPJ: 12345678000100 ↔ 12.345.678/0001-00
    elif len(digits) == 14:
        patterns.add(digits)
        patterns.add(f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}")

    # Telefone: 11987654321 ↔ (11) 98765-4321
    elif len(digits) in (10, 11):
        patterns.add(digits)
        if len(digits) == 11:
            patterns.add(f"({digits[:2]}) {digits[2:7]}-{digits[7:]}")
            patterns.add(f"{digits[:2]} {digits[2:7]}-{digits[7:]}")
            patterns.add(f"+55{digits}")
        elif len(digits) == 10:
            patterns.add(f"({digits[:2]}) {digits[2:6]}-{digits[6:]}")
            patterns.add(f"{digits[:2]} {digits[2:6]}-{digits[6:]}")

    elif len(digits) == 8:
        # CEP: 01001000 ↔ 01001-000
        patterns.add(digits)
        patterns.add(f"{digits[:5]}-{digits[5:]}")

    # Se tiver dígitos genéricos, adiciona
    if digits and len(digits) >= 3:
        patterns.add(digits)

    return [p for p in patterns if p]


# ---------------------------------------------------------------------------
# Leitores de formato
# ---------------------------------------------------------------------------

def _read_pdf(filepath: str) -> str:
    """Extrai texto de PDF usando pypdf."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(filepath)
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n".join(pages)
    except Exception:
        return ""


def _read_text(filepath: str) -> str:
    """Lê arquivo de texto com fallback de encoding."""
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            with open(filepath, "r", encoding=encoding, errors="replace") as f:
                return f.read()
        except Exception:
            continue
    return ""


def _read_csv(filepath: str) -> str:
    """Lê CSV e retorna como texto com linhas separadas."""
    raw = _read_text(filepath)
    if not raw:
        return ""
    # Retorna o CSV inteiro como texto para busca
    return raw


def _read_json(filepath: str) -> str:
    """Lê JSON e converte para texto pesquisável."""
    raw = _read_text(filepath)
    if not raw:
        return ""
    try:
        data = json.loads(raw)
        return _json_to_text(data)
    except (json.JSONDecodeError, ValueError):
        return raw


def _json_to_text(obj, depth=0) -> str:
    """Converte JSON aninhado para texto plano pesquisável."""
    if depth > 10:
        return ""
    parts = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            parts.append(f"{k}: {_json_to_text(v, depth + 1)}")
    elif isinstance(obj, list):
        for item in obj[:500]:  # limite de itens
            parts.append(_json_to_text(item, depth + 1))
    else:
        parts.append(str(obj))
    return " | ".join(parts)


def _read_file(filepath: str) -> str:
    """Lê qualquer arquivo suportado e retorna seu conteúdo como texto."""
    ext = Path(filepath).suffix.lower()

    if ext == ".pdf":
        return _read_pdf(filepath)
    elif ext == ".json":
        return _read_json(filepath)
    elif ext in (".csv", ".tsv"):
        return _read_csv(filepath)
    elif ext in (".txt", ".log", ".sql"):
        return _read_text(filepath)
    else:
        return ""


# ---------------------------------------------------------------------------
# Extração de contexto (snippet ao redor do match)
# ---------------------------------------------------------------------------

def _extract_context(text: str, match_pos: int, context_chars: int = 200) -> str:
    """Extrai um trecho de contexto ao redor da posição do match."""
    start = max(0, match_pos - context_chars)
    end = min(len(text), match_pos + context_chars)
    snippet = text[start:end].strip()
    if start > 0:
        snippet = "…" + snippet
    if end < len(text):
        snippet = snippet + "…"
    return snippet


def _extract_line_context(text: str, match_pos: int, context_lines: int = 2) -> str:
    """Extrai linhas de contexto ao redor da posição do match."""
    lines = text.split("\n")
    current_pos = 0
    match_line = 0
    for i, line in enumerate(lines):
        if current_pos + len(line) >= match_pos:
            match_line = i
            break
        current_pos += len(line) + 1  # +1 for \n

    start_line = max(0, match_line - context_lines)
    end_line = min(len(lines), match_line + context_lines + 1)
    context = lines[start_line:end_line]
    return "\n".join(line.strip() for line in context if line.strip())


def _extract_associated_data(text: str, match_pos: int) -> dict:
    """
    Tenta extrair dados estruturados associados ao match na mesma
    linha ou região (CPF, telefone, e-mail, nome, etc.).
    """
    # Pega a linha inteira onde o match ocorre
    lines = text.split("\n")
    current_pos = 0
    match_line_text = ""
    for line in lines:
        if current_pos <= match_pos < current_pos + len(line) + 1:
            match_line_text = line
            break
        current_pos += len(line) + 1

    if not match_line_text:
        return {}

    associated = {}

    # Tenta extrair CPFs na mesma linha
    cpf_matches = re.findall(r"\d{3}\.?\d{3}\.?\d{3}-?\d{2}", match_line_text)
    if cpf_matches:
        associated["cpf_encontrado"] = cpf_matches[0]

    # Tenta extrair telefones na mesma linha
    phone_matches = re.findall(r"\(?\d{2}\)?\s?\d{4,5}-?\d{4}", match_line_text)
    if phone_matches:
        associated["telefone_encontrado"] = phone_matches[0]

    # Tenta extrair e-mails na mesma linha
    email_matches = re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", match_line_text)
    if email_matches:
        associated["email_encontrado"] = email_matches[0]

    # Tenta extrair CNPJs na mesma linha
    cnpj_matches = re.findall(r"\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}", match_line_text)
    if cnpj_matches:
        associated["cnpj_encontrado"] = cnpj_matches[0]

    # Tenta extrair CEPs na mesma linha
    cep_matches = re.findall(r"\d{5}-?\d{3}", match_line_text)
    if cep_matches:
        associated["cep_encontrado"] = cep_matches[0]

    return associated


# ---------------------------------------------------------------------------
# Motor principal de busca no Vault
# ---------------------------------------------------------------------------

def search_vault(query: str, vault_dir: str = None) -> list:
    """
    Busca o termo nos arquivos do Data Vault.

    Args:
        query: Termo de busca (CPF, nome, telefone, etc.)
        vault_dir: Pasta do vault (padrão: data_vault/ ao lado deste arquivo)

    Returns:
        Lista de dicts com resultados encontrados.
        Lista vazia se nada for encontrado (silencioso).
    """
    if not query or not query.strip():
        return []

    vault_path = Path(vault_dir) if vault_dir else VAULT_DIR
    if not vault_path.exists() or not vault_path.is_dir():
        return []

    # Gera padrões de busca
    patterns = _build_search_patterns(query.strip())
    if not patterns:
        return []

    results = []
    max_results_per_file = 5
    max_total_results = 20

    # Percorre todos os arquivos recursivamente
    for filepath in vault_path.rglob("*"):
        if not filepath.is_file():
            continue
        if filepath.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        if filepath.stat().st_size > MAX_FILE_SIZE:
            continue
        if filepath.name.startswith("."):
            continue
        if filepath.name == "README.md":
            continue

        # Lê o conteúdo do arquivo
        content = _read_file(str(filepath))
        if not content:
            continue

        normalized_content = _normalize(content)
        file_results_count = 0

        for pattern in patterns:
            norm_pattern = _normalize(pattern)
            if not norm_pattern:
                continue

            # Busca todas as ocorrências no conteúdo normalizado
            search_pos = 0
            while file_results_count < max_results_per_file:
                pos = normalized_content.find(norm_pattern, search_pos)
                if pos == -1:
                    break

                # Extrai contexto do conteúdo ORIGINAL (não normalizado)
                context = _extract_line_context(content, pos)
                associated = _extract_associated_data(content, pos)

                result_data = {
                    "arquivo": filepath.name,
                    "caminho": str(filepath.relative_to(vault_path)),
                    "trecho_encontrado": context[:500],
                }

                # Adiciona dados associados extraídos
                result_data.update(associated)

                # Evita duplicatas por arquivo
                existing_snippets = [
                    r["data"].get("trecho_encontrado", "")
                    for r in results
                    if r["data"].get("arquivo") == filepath.name
                ]
                if context[:500] not in existing_snippets:
                    results.append({
                        "source": "vault",
                        "target": f"base_local_{filepath.stem}",
                        "data": result_data,
                    })
                    file_results_count += 1

                search_pos = pos + len(norm_pattern)

            if len(results) >= max_total_results:
                break

        if len(results) >= max_total_results:
            break

    return results
