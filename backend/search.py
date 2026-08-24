import hashlib
import json
import re
import socket
import ssl
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from vault_search import search_vault

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
    {
        "id": "crossintel",
        "name": "Dossiê Cruzado (Bancos, Sócios & Vazamentos)",
        "active_by_default": True,
        "description": "Cruzamento profundo de dados: sócios por nome/CPF, bancos/PIX, vazamentos públicos e Registrato Bacen.",
        "supports": ["Nome", "CPF", "Telefone", "E-mail", "CNPJ"],
    },
    {
        "id": "ibgeint",
        "name": "IBGE (Demografia & Municípios)",
        "active_by_default": True,
        "description": "Dados oficiais do IBGE: população, área, gentílico, microrregião e perfil municipal.",
        "supports": ["CEP", "CNPJ", "Cidade", "Nome"],
    },
    {
        "id": "weatherint",
        "name": "Clima em Tempo Real (Open-Meteo)",
        "active_by_default": True,
        "description": "Temperatura, umidade, vento e condição climática atual via Open-Meteo (sem API key).",
        "supports": ["CEP", "CNPJ", "Cidade", "IP"],
    },
    {
        "id": "geoint",
        "name": "Geolocalização (OpenStreetMap)",
        "active_by_default": True,
        "description": "Coordenadas GPS, endereço detalhado e mapa interativo via Nominatim/OpenStreetMap.",
        "supports": ["CEP", "CNPJ", "Cidade"],
    },
    {
        "id": "econint",
        "name": "Indicadores Econômicos (Bacen & Câmbio)",
        "active_by_default": True,
        "description": "SELIC, IPCA, Dólar e Euro em tempo real via Banco Central do Brasil e AwesomeAPI.",
        "supports": ["Economia", "Moeda"],
    },
    {
        "id": "cryptoint",
        "name": "Criptomoedas (CoinGecko)",
        "active_by_default": True,
        "description": "Preço em tempo real, market cap, volume 24h e variação de 13.000+ criptoativos.",
        "supports": ["Cripto"],
    },
    {
        "id": "countryint",
        "name": "Países (REST Countries)",
        "active_by_default": True,
        "description": "Dossiê geopolítico completo: capital, população, bandeira SVG, moedas, idiomas e fronteiras.",
        "supports": ["País"],
    },
    {
        "id": "bankint",
        "name": "Bancos & SPI (ISPB, COMPE & PIX)",
        "active_by_default": True,
        "description": "Catálogo completo com 40+ bancos, COMPE, ISPB, SPI, Registrato Bacen e diretório PIX.",
        "supports": ["Banco", "Código", "PIX"],
    },
    {
        "id": "vaultint",
        "name": "📂 Base Local (Data Vault)",
        "active_by_default": True,
        "description": "Busca silenciosa em arquivos PDF, TXT, CSV, JSON e SQL depositados na pasta data_vault/.",
        "supports": ["Todos"],
    },
]

DEFAULT_SOURCES = [api["id"] for api in AVAILABLE_APIS if api["active_by_default"]]

# ---------------------------------------------------------------------------
# Catálogo Estruturado de Bancos Brasileiros (ISPB, COMPE, Pix e SPI)
# ---------------------------------------------------------------------------
BRAZILIAN_BANKS_CATALOG = {
    "001": {"code": "001", "ispb": "00000000", "name": "Banco do Brasil S.A.", "short": "Banco do Brasil", "tipo": "Banco Múltiplo / Estatal", "pix": "Ativo", "site": "https://www.bb.com.br"},
    "237": {"code": "237", "ispb": "60746948", "name": "Banco Bradesco S.A.", "short": "Bradesco", "tipo": "Banco Múltiplo Privado", "pix": "Ativo", "site": "https://banco.bradesco"},
    "104": {"code": "104", "ispb": "00360305", "name": "Caixa Econômica Federal", "short": "Caixa / CEF", "tipo": "Empresa Pública Federal", "pix": "Ativo", "site": "https://www.caixa.gov.br"},
    "341": {"code": "341", "ispb": "60701190", "name": "Itaú Unibanco S.A.", "short": "Itaú", "tipo": "Banco Múltiplo Privado", "pix": "Ativo", "site": "https://www.itau.com.br"},
    "033": {"code": "033", "ispb": "90400888", "name": "Banco Santander (Brasil) S.A.", "short": "Santander", "tipo": "Banco Múltiplo Privado", "pix": "Ativo", "site": "https://www.santander.com.br"},
    "260": {"code": "260", "ispb": "18236120", "name": "Nu Pagamentos S.A. (Nubank)", "short": "Nubank", "tipo": "Instituição de Pagamento / Fintech", "pix": "Ativo", "site": "https://nubank.com.br"},
    "077": {"code": "077", "ispb": "00416968", "name": "Banco Inter S.A.", "short": "Banco Inter", "tipo": "Banco Digital / Múltiplo", "pix": "Ativo", "site": "https://inter.co"},
    "336": {"code": "336", "ispb": "31872495", "name": "Banco C6 S.A. (C6 Bank)", "short": "C6 Bank", "tipo": "Banco Digital / Múltiplo", "pix": "Ativo", "site": "https://www.c6bank.com.br"},
    "290": {"code": "290", "ispb": "08561701", "name": "PagBank / PagSeguro Internet S.A.", "short": "PagBank", "tipo": "Instituição de Pagamento", "pix": "Ativo", "site": "https://pagbank.pagseguro.uol.com.br"},
    "323": {"code": "323", "ispb": "10573521", "name": "Mercado Pago Instituição de Pagamento Ltda.", "short": "Mercado Pago", "tipo": "Instituição de Pagamento", "pix": "Ativo", "site": "https://www.mercadopago.com.br"},
    "380": {"code": "380", "ispb": "22896431", "name": "PicPay Instituição de Pagamento S.A.", "short": "PicPay", "tipo": "Instituição de Pagamento / Carteira", "pix": "Ativo", "site": "https://picpay.com"},
    "208": {"code": "208", "ispb": "30306294", "name": "Banco BTG Pactual S.A.", "short": "BTG Pactual", "tipo": "Banco de Investimento / Múltiplo", "pix": "Ativo", "site": "https://www.btgpactual.com"},
    "422": {"code": "422", "ispb": "58160789", "name": "Banco Safra S.A.", "short": "Banco Safra", "tipo": "Banco Múltiplo Privado", "pix": "Ativo", "site": "https://www.safra.com.br"},
    "756": {"code": "756", "ispb": "02038232", "name": "Banco Cooperativo Sicoob S.A.", "short": "Sicoob", "tipo": "Banco Cooperativo", "pix": "Ativo", "site": "https://www.sicoob.com.br"},
    "748": {"code": "748", "ispb": "01181521", "name": "Banco Cooperativo Sicredi S.A.", "short": "Sicredi", "tipo": "Banco Cooperativo", "pix": "Ativo", "site": "https://www.sicredi.com.br"},
    "212": {"code": "212", "ispb": "92894922", "name": "Banco Original S.A.", "short": "Banco Original", "tipo": "Banco Digital / Múltiplo", "pix": "Ativo", "site": "https://www.original.com.br"},
    "655": {"code": "655", "ispb": "59588111", "name": "Banco Votorantim S.A. (Banco BV / Neon)", "short": "Banco BV / Neon", "tipo": "Banco Múltiplo", "pix": "Ativo", "site": "https://www.bv.com.br"},
    "197": {"code": "197", "ispb": "16501555", "name": "Stone Instituição de Pagamento S.A.", "short": "Stone", "tipo": "Instituição de Pagamento", "pix": "Ativo", "site": "https://www.stone.com.br"},
    "218": {"code": "218", "ispb": "17184037", "name": "Banco BS2 S.A.", "short": "Banco BS2", "tipo": "Banco Digital / Empresas", "pix": "Ativo", "site": "https://www.bs2.com"},
    "069": {"code": "069", "ispb": "04184779", "name": "Banco Crefisa S.A.", "short": "Crefisa", "tipo": "Banco Múltiplo", "pix": "Ativo", "site": "https://www.crefisa.com.br"},
    "318": {"code": "318", "ispb": "02998611", "name": "Banco BMG S.A.", "short": "Banco BMG", "tipo": "Banco Múltiplo", "pix": "Ativo", "site": "https://www.bancobmg.com.br"},
    "707": {"code": "707", "ispb": "33479023", "name": "Banco Daycoval S.A.", "short": "Daycoval", "tipo": "Banco Múltiplo", "pix": "Ativo", "site": "https://www.daycoval.com.br"},
    "041": {"code": "041", "ispb": "92702067", "name": "Banco do Estado do Rio Grande do Sul S.A. (Banrisul)", "short": "Banrisul", "tipo": "Banco Múltiplo Estadual", "pix": "Ativo", "site": "https://www.banrisul.com.br"},
    "047": {"code": "047", "ispb": "28195667", "name": "Banco do Estado de Sergipe S.A. (Banese)", "short": "Banese", "tipo": "Banco Múltiplo Estadual", "pix": "Ativo", "site": "https://www.banese.com.br"},
    "021": {"code": "021", "ispb": "04902979", "name": "Banco do Estado do Espírito Santo S.A. (Banestes)", "short": "Banestes", "tipo": "Banco Múltiplo Estadual", "pix": "Ativo", "site": "https://www.banestes.com.br"},
    "037": {"code": "037", "ispb": "04913711", "name": "Banco do Estado do Pará S.A. (Banpará)", "short": "Banpará", "tipo": "Banco Múltiplo Estadual", "pix": "Ativo", "site": "https://www.banpara.b.br"},
    "004": {"code": "004", "ispb": "07237373", "name": "Banco do Nordeste do Brasil S.A. (BNB)", "short": "Banco do Nordeste", "tipo": "Banco de Desenvolvimento", "pix": "Ativo", "site": "https://www.bnb.gov.br"},
    "003": {"code": "003", "ispb": "00000208", "name": "Banco da Amazônia S.A. (BASA)", "short": "Banco da Amazônia", "tipo": "Banco Comercial / Desenvolvimento", "pix": "Ativo", "site": "https://www.bancoamazonia.com.br"},
}

# ---------------------------------------------------------------------------
# Mapeamento Canônico de Chaves para Deduplicação Perfeita
# ---------------------------------------------------------------------------
CANONICAL_FIELD_MAP = {
    # Identificação
    "razao_social": "razao_social",
    "nome_empresarial": "razao_social",
    "corporate_name": "razao_social",
    "razao": "razao_social",
    "nome_fantasia": "nome_fantasia",
    "fantasia": "nome_fantasia",
    "trade_name": "nome_fantasia",
    "cnpj": "cnpj",
    "cpf": "cpf",
    "situacao_cadastral": "situacao_cadastral",
    "descricao_situacao_cadastral": "situacao_cadastral",
    "status_cadastral": "situacao_cadastral",
    "situacao": "situacao_cadastral",
    "data_abertura": "data_abertura",
    "data_inicio_atividade": "data_abertura",
    "abertura": "data_abertura",
    "capital_social": "capital_social",
    "porte": "porte",
    "natureza_juridica": "natureza_juridica",
    "cnae_principal": "cnae_principal",
    "cnae_fiscal_descricao": "cnae_principal",
    "atividade_principal": "cnae_principal",
    "quadro_de_socios_qsa": "quadro_de_socios_qsa",
    "qsa": "quadro_de_socios_qsa",
    "socios": "quadro_de_socios_qsa",
    "regiao_fiscal": "regiao_fiscal",
    "validador_matematico_cpf": "validador_matematico_cpf",

    # Localização
    "endereco_completo": "endereco_completo",
    "logradouro": "logradouro",
    "street": "logradouro",
    "numero": "numero",
    "bairro": "bairro",
    "neighborhood": "bairro",
    "municipio": "municipio",
    "cidade": "municipio",
    "city": "municipio",
    "localidade": "municipio",
    "uf": "uf",
    "state": "uf",
    "estado": "uf",
    "cep": "cep",
    "postal_code": "cep",
    "zip": "cep",
    "coordenadas_gps": "coordenadas_gps",
    "google_maps": "google_maps",
    "openstreetmap": "openstreetmap",
    "codigo_ibge": "codigo_ibge",
    "populacao_estimada": "populacao_estimada",
    "microrregiao": "microrregiao",
    "mesorregiao": "mesorregiao",
    "regiao_geografica_imediata": "regiao_geografica_imediata",
    "temperatura_atual": "temperatura_atual",
    "sensacao_termica": "sensacao_termica",
    "umidade_relativa": "umidade_relativa",
    "condicao_climatica": "condicao_climatica",
    "velocidade_do_vento": "velocidade_do_vento",
    "pressao_atmosferica": "pressao_atmosferica",

    # Bancos & Financeiro
    "banco": "banco",
    "codigo_banco": "codigo_banco",
    "ispb": "ispb",
    "chave_pix_cpf": "chave_pix_cpf",
    "chave_pix_cnpj": "chave_pix_cnpj",
    "chave_pix_telefone": "chave_pix_telefone",
    "chave_pix_email": "chave_pix_email",
    "formato_bancario_spi": "formato_bancario_spi",
    "relatorio_contas_pix_registrato": "relatorio_contas_pix_registrato",
    "selic_meta_atual": "selic_meta_atual",
    "ipca_mensal": "ipca_mensal",
    "ipca_acumulado_12_meses": "ipca_acumulado_12_meses",
    "cdi_diario": "cdi_diario",
    "dolar_comercial": "dolar_comercial",
    "dolar_venda": "dolar_venda",
    "euro_comercial": "euro_comercial",
    "euro_venda": "euro_venda",
    "preco_brl": "preco_brl",
    "preco_usd": "preco_usd",
    "market_cap_usd": "market_cap_usd",
    "variacao_24h": "variacao_24h",
    "variacao_7d": "variacao_7d",
    "variacao_30d": "variacao_30d",

    # Jurídico & Diários
    "investigacao_societaria_qsa": "investigacao_societaria_qsa",
    "consulta_socios_receita_federal": "consulta_socios_receita_federal",
    "pesquisa_processual_unificada_tribunais": "pesquisa_processual_unificada_tribunais",
    "processos_escavador": "processos_escavador",
    "diarios_oficiais_municipais": "diarios_oficiais_municipais",
    "diarios_oficiais_e_concursos_dou": "diarios_oficiais_e_concursos_dou",
    "comprovante_situacao_cadastral_rfb": "comprovante_situacao_cadastral_rfb",
    "regularidade_fiscal_divida_ativa_pgfn": "regularidade_fiscal_divida_ativa_pgfn",
    "portal_da_transparencia": "portal_da_transparencia",

    # Presença Digital
    "telefone": "telefone",
    "phone": "telefone",
    "operadora": "operadora",
    "whatsapp_link": "whatsapp_link",
    "telegram_link": "telegram_link",
    "truecaller_identificador": "truecaller_identificador",
    "syncme_identificador": "syncme_identificador",
    "email": "email",
    "verificador_vazamentos_pwned": "verificador_vazamentos_pwned",
    "perfil_github": "perfil_github",
    "perfil_linkedin": "perfil_linkedin",
    "servidores_de_email_mx": "servidores_de_email_mx",
    "foto_perfil_gravatar": "foto_perfil_gravatar",
    "tipo_de_email": "tipo_de_email",
    "tipo_conexao": "tipo_conexao",
    "provedor_isp": "provedor_isp",
    "alerta_proxy": "alerta_proxy",
}

KEY_ALIASES = CANONICAL_FIELD_MAP

SKIP_KEYS = {
    "billing", "extra", "e", "location", "version", "status_code",
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
    t = text.strip()
    return bool(re.fullmatch(r"\d{3}\.\d{3}\.\d{3}-\d{2}", t)) or bool(re.search(r"\d{3}\.\d{3}\.\d{3}", t))


def _looks_like_phone_format(text: str) -> bool:
    t = text.strip()
    return bool(re.search(r"[(\+]", t)) or bool(re.fullmatch(r"\d{2}\s\d{4,5}[-\s]\d{4}", t)) or bool(re.search(r"-\d{4}$", t))


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
        cpf_punct = _looks_like_cpf_format(text)
        phone_punct = _looks_like_phone_format(text)
        cpf_valid = is_valid_cpf(digits)
        valid_ddd = digits[:2] in DDD_STATE and digits[2] == "9"

        if cpf_punct:
            kinds.append("cpf")
        elif phone_punct and valid_ddd:
            kinds.append("phone")
        elif cpf_valid:
            kinds.append("cpf")
        elif valid_ddd:
            kinds.append("phone")
        else:
            kinds.append("cpf")

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

    # Criptomoedas (palavras-chave comuns)
    _crypto_keywords = {
        "btc", "bitcoin", "eth", "ethereum", "usdt", "tether", "bnb", "binance",
        "sol", "solana", "ada", "cardano", "xrp", "ripple", "doge", "dogecoin",
        "dot", "polkadot", "shib", "matic", "polygon", "avax", "avalanche",
        "link", "chainlink", "ltc", "litecoin", "uni", "uniswap", "atom",
        "cosmos", "near", "trx", "tron", "pepe", "cripto", "crypto",
    }
    if text.lower().strip() in _crypto_keywords:
        kinds.append("crypto")

    # Indicadores Econômicos (palavras-chave)
    _econ_keywords = {
        "selic", "ipca", "inflacao", "inflação", "pib", "dolar", "dólar",
        "euro", "cambio", "câmbio", "usd", "brl", "eur", "cotacao",
        "cotação", "juros", "cdi", "reservas", "economia",
    }
    if text.lower().strip() in _econ_keywords:
        kinds.append("economy")

    # Países (termos comuns em português e inglês)
    _country_keywords = {
        "brasil", "brazil", "argentina", "chile", "colombia", "peru",
        "uruguai", "paraguai", "mexico", "méxico", "eua", "usa",
        "estados unidos", "china", "japao", "japão", "japan", "india",
        "alemanha", "germany", "franca", "frança", "france", "italia",
        "itália", "italy", "portugal", "espanha", "spain", "russia",
        "rússia", "canada", "canadá", "australia", "austrália",
        "coreia do sul", "south korea", "reino unido", "united kingdom",
        "africa do sul", "south africa", "egito", "egypt",
    }
    text_lower = text.lower().strip()
    if text_lower in _country_keywords:
        kinds.append("country")

    # Bancos e Instituições Financeiras
    _bank_keywords = {
        "banco", "nubank", "inter", "bradesco", "itau", "itaú", "caixa",
        "santander", "safra", "sicoob", "sicredi", "picpay", "c6", "c6bank",
        "pagbank", "pagseguro", "mercadopago", "mercado pago", "btg", "btg pactual",
        "original", "neon", "stone", "bs2", "bmg", "daycoval", "banrisul", "banese",
        "banestes", "banpara", "banpará", "bnb", "basa", "pix", "spi", "ispb",
    }
    if text_lower in _bank_keywords or any(bk in text_lower for bk in ("banco do brasil", "caixa economica", "caixa econômica", "itau unibanco", "itaú unibanco", "banco inter", "banco c6")):
        kinds.append("bank")

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
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
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
    parts = key.split(".")
    # Se tiver alvo (ex: cnpj.razao_social), pega a folha
    leaf = parts[-1].lower()
    leaf = re.sub(r"\[\d+\]", "", leaf)
    return CANONICAL_FIELD_MAP.get(leaf, leaf)


def normalize_value(value: str) -> str:
    val = re.sub(r"\s+", " ", str(value).strip().lower())
    # Remove R$, pontuações de moeda e zeros extras para matching
    val_clean = re.sub(r"^r\$\s*", "", val).replace(".", "").replace(",", ".").strip()
    return val_clean


def _format_canonical_value(key: str, value: str) -> str:
    """Padroniza valores de moeda, datas e documentos para exibição premium."""
    val = str(value).strip()
    if key == "capital_social":
        # Se for número puro tipo 50000 ou 50000.00
        num_str = re.sub(r"[^\d.]", "", val)
        try:
            num = float(num_str)
            return f"R$ {num:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        except Exception:
            return val
    return val


def canonicalize_and_structure_dossier(collected: list, query: dict) -> dict:
    """
    Motor Central de Inteligência e Deduplicação Canônica:
    1. Agrupa e deduplica chaves equivalentes.
    2. Unifica fontes confirmadoras.
    3. Categoriza o dossiê em 7 seções prioritárias.
    """
    merged_map = {}
    
    # Prioridade de fontes (fontes mais completas/oficiais têm preferência de valor)
    source_priority = {
        "minhareceita": 10,
        "brasilapi": 9,
        "receitaws": 8,
        "crossintel": 15,
        "vault": 20,
        "ibgeint": 12,
        "weatherint": 12,
        "geoint": 11,
        "econint": 12,
        "cryptoint": 12,
        "countryint": 12,
        "nameint": 10,
        "phoneint": 10,
        "emailint": 10,
        "cpfint": 10,
        "plateint": 10,
        "ipdomainint": 10,
    }

    for item in collected:
        raw_key = item["key"]
        raw_val = item["value"]
        source = item["source"]

        if raw_val in (None, "", "—", "null", "None", "[]", "{}"):
            continue

        c_key = normalize_key(raw_key)
        formatted_val = _format_canonical_value(c_key, raw_val)
        val_norm = normalize_value(formatted_val)

        # Chave única de agrupamento
        group_id = c_key

        if group_id in merged_map:
            existing = merged_map[group_id]
            if source not in existing["sources"]:
                existing["sources"].append(source)
            
            # Se o novo valor for mais rico ou a fonte tiver maior prioridade, atualiza o valor
            curr_prio = source_priority.get(source, 5)
            best_prio = existing.get("_prio", 0)
            if len(formatted_val) > len(existing["value"]) or curr_prio > best_prio:
                existing["value"] = formatted_val
                existing["_prio"] = max(best_prio, curr_prio)
        else:
            merged_map[group_id] = {
                "key": c_key,
                "value": formatted_val,
                "sources": [source],
                "_prio": source_priority.get(source, 5),
            }

    # Remove metadados temporários
    fields = []
    for f in merged_map.values():
        f.pop("_prio", None)
        fields.append(f)

    # -----------------------------------------------------------------------
    # Categorização Inteligente em Seções
    # -----------------------------------------------------------------------
    sections = {
        "highlights": [],      # 🌟 Destaques & Dossiê Cruzado
        "identification": [],  # 🏢 Identificação & Cadastro Oficial
        "banking": [],         # 🏦 Bancos & Inteligência Financeira
        "location": [],        # 📍 Localização, Demografia & Clima
        "legal": [],           # ⚖️ Jurídico, Diários Oficiais & Transparência
        "digital": [],         # 🌐 Presença Digital & Contatos
        "vault": [],           # 📂 Base Local (Data Vault)
    }

    highlight_keys = {
        "quadro_de_socios_qsa", "chave_pix_cpf", "chave_pix_cnpj", "chave_pix_telefone",
        "chave_pix_email", "verificador_vazamentos_pwned", "alerta_proxy",
        "condicao_climatica", "temperatura_atual", "coordenadas_gps",
    }
    ident_keys = {
        "cnpj", "cpf", "razao_social", "nome_fantasia", "nome", "situacao_cadastral",
        "data_abertura", "capital_social", "porte", "natureza_juridica", "cnae_principal",
        "regiao_fiscal", "validador_matematico_cpf", "placa", "modelo", "ano_fabricacao",
        "ano_modelo", "chassi", "renavam", "estado_registro_denatran",
    }
    banking_keys = {
        "banco", "codigo_banco", "ispb", "formato_bancario_spi", "relatorio_contas_pix_registrato",
        "selic_meta_atual", "ipca_mensal", "ipca_acumulado_12_meses", "cdi_diario",
        "dolar_comercial", "dolar_venda", "euro_comercial", "euro_venda", "preco_brl",
        "preco_usd", "market_cap_usd", "variacao_24h", "variacao_7d", "variacao_30d",
        "volume_24h_usd", "supply_circulante", "supply_total", "ranking_global",
    }
    location_keys = {
        "endereco_completo", "logradouro", "numero", "bairro", "municipio", "uf", "cep",
        "coordenadas_gps", "google_maps", "openstreetmap", "codigo_ibge", "populacao_estimada",
        "microrregiao", "mesorregiao", "regiao_geografica_imediata", "temperatura_atual",
        "sensacao_termica", "umidade_relativa", "condicao_climatica", "velocidade_do_vento",
        "pressao_atmosferica", "pais", "capital", "moedas", "idiomas", "bandeira_svg",
    }
    legal_keys = {
        "investigacao_societaria_qsa", "consulta_socios_receita_federal",
        "pesquisa_processual_unificada_tribunais", "processos_escavador",
        "diarios_oficiais_municipais", "diarios_oficiais_e_concursos_dou",
        "comprovante_situacao_cadastral_rfb", "regularidade_fiscal_divida_ativa_pgfn",
        "portal_da_transparencia", "consulta_senatran", "consulta_sinesp",
    }
    digital_keys = {
        "telefone", "operadora", "whatsapp_link", "telegram_link", "truecaller_identificador",
        "syncme_identificador", "email", "verificador_vazamentos_pwned", "perfil_github",
        "perfil_linkedin", "servidores_de_email_mx", "foto_perfil_gravatar", "tipo_de_email",
        "tipo_conexao", "provedor_isp", "alerta_proxy", "ip", "fuso_horario",
    }

    for f in fields:
        k = f["key"]
        # Se for do vault local
        if "vault" in f["sources"] or k.startswith("base_local_") or "arquivo" in k:
            sections["vault"].append(f)
            sections["highlights"].append(f)
            continue

        placed = False
        if k in highlight_keys:
            sections["highlights"].append(f)
            placed = True
        if k in banking_keys:
            sections["banking"].append(f)
            placed = True
        if k in legal_keys:
            sections["legal"].append(f)
            placed = True
        if k in location_keys:
            sections["location"].append(f)
            placed = True
        if k in digital_keys:
            sections["digital"].append(f)
            placed = True
        if k in ident_keys:
            sections["identification"].append(f)
            placed = True

        if not placed:
            sections["identification"].append(f)

    # Ordenação dos campos: Destaques primeiro
    ordered_fields = []
    seen_keys = set()

    for sec_name in ["highlights", "identification", "banking", "location", "legal", "digital", "vault"]:
        for f in sections[sec_name]:
            if f["key"] not in seen_keys:
                seen_keys.add(f["key"])
                ordered_fields.append(f)

    return {
        "fields": ordered_fields,
        "sections": {k: v for k, v in sections.items() if v},
    }


def merge_fields(collected: list) -> list:
    """Compatibilidade retroativa com chamadas simples."""
    res = canonicalize_and_structure_dossier(collected, {})
    return res["fields"]


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

    # 6. ConecteSUS / Ministério da Saúde (Cartão Nacional de Saúde)
    data["conectesus_ministerio_saude"] = "https://conectesus-paciente.saude.gov.br/"

    # 7. Redes Profissionais e Comunidades
    data["linkedin_busca"] = f"https://www.linkedin.com/search/results/all/?keywords={encoded_query}"
    data["discord_comunidade"] = f"https://discord.com/search?q={encoded_query}"

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

    # Faixa original de registro na Anatel
    if len(digits) >= 11 and digits[2] == "9":
        prefix_4 = digits[3:5]
        p = int(prefix_4) if prefix_4.isdigit() else 0
        if 60 <= p <= 69:
            data["faixa_original_anatel"] = "Vivo (Telefônica Brasil) — Registro Inicial"
        elif 70 <= p <= 79:
            data["faixa_original_anatel"] = "Claro (América Móvil) — Registro Inicial"
        elif 80 <= p <= 89:
            data["faixa_original_anatel"] = "Oi Móvel — Registro Inicial"
        elif 90 <= p <= 99:
            data["faixa_original_anatel"] = "TIM Brasil — Registro Inicial"
        else:
            data["faixa_original_anatel"] = "Faixa Geral Anatel"
        data["aviso_portabilidade"] = "Atenção: A linha pode ter sido transferida (Portabilidade Numérica ativa)"

    # Base Oficial ABR Telecom (Consulta de Portabilidade em Tempo Real)
    data["consulta_portabilidade_abr_telecom"] = "https://consultanumero.abrtelecom.com.br/consultanumero/consulta/consultaSituacaoAtualCtg.action"

    intl = f"+55{digits}"
    data["formato_internacional"] = intl
    data["whatsapp_link"] = f"https://wa.me/55{digits}"
    data["telegram_link"] = f"https://t.me/+55{digits}"

    # OSINT Caller ID & Social Links
    data["truecaller_osint"] = f"https://www.truecaller.com/search/br/{digits}"
    data["syncme_osint"] = f"https://sync.me/search/?number=+55{digits}"
    data["conectesus_ministerio_saude"] = "https://conectesus-paciente.saude.gov.br/"

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

    # Faixa estimada de inscrição na Receita Federal
    primeiro = int(digits[0]) if digits[0].isdigit() else 0
    if primeiro == 0:
        data["faixa_cadastro_receita"] = "Inscrição antiga/consolidada da base da Receita Federal"
    elif primeiro in (1, 2, 3, 4):
        data["faixa_cadastro_receita"] = "Inscrição intermediária na base da Receita Federal"
    else:
        data["faixa_cadastro_receita"] = "Inscrição recente na base da Receita Federal"

    # Busca nominal em Diários Oficiais e Concursos Públicos
    data["busca_nome_diarios_e_concursos"] = f"https://www.in.gov.br/consulta/-/buscar/dou?q={digits}"
    data["busca_nome_e_processos_jusbrasil"] = f"https://www.jusbrasil.com.br/busca?q={digits}"
    data["portal_transparencia_servidores"] = f"https://portaldatransparencia.gov.br/busca?termo={digits}"

    # Link oficial da Receita Federal
    data["receita_federal_comprovante"] = "https://servicos.receitafederal.fazenda.gov.br/servicos/cpf/consultasituacao/consultapublica.asp"
    data["aviso_sigilo_nominal"] = "A Receita Federal exige consulta com data de nascimento no portal oficial para emissão do comprovante nominal autenticado."

    # ConecteSUS / Ministério da Saúde
    data["conectesus_ministerio_saude"] = "https://conectesus-paciente.saude.gov.br/"

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
        data["padrao"] = "Mercosul (Novo)"
        data["placa_formatada"] = f"{text[:3]}{text[3]}{text[4]}{text[5:]}"
    elif is_old:
        data["padrao"] = "Cinza / Antigo (Três Letras + 4 Dígitos)"
        data["placa_formatada"] = f"{text[:3]}-{text[3:]}"
    else:
        return []

    letters = text[:3]
    state_code = _plate_to_state(letters)
    state_name = STATE_NAMES.get(state_code, "")
    if state_code:
        data["estado_registro_denatran"] = f"{state_name} ({state_code})"
    else:
        data["estado_registro_denatran"] = "Não identificado na faixa histórica"

    data["consulta_senatran"] = "https://portalservicos.senatran.serpro.gov.br/#/veiculos"
    data["consulta_sinesp"] = "https://sinesp.gov.br/"

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


# ---------------------------------------------------------------------------
# 10. Dossiê Cruzado (Sócios, Chaves PIX, Bancos & Vazamentos Públicos)
# ---------------------------------------------------------------------------

def fetch_cross_intelligence(query: dict) -> list:
    kinds = query["kinds"]
    digits = query["digits"]
    raw = query["raw"].strip()
    data = {}

    # 1. Dossiê Completo por CPF
    if "cpf" in kinds and len(digits) == 11:
        data["chave_pix_cpf"] = f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
        data["formato_bancario_spi"] = f"{digits}"
        data["consulta_bancos_registrato"] = "https://registrato.bcb.gov.br/registrato/"
        data["aviso_registrato_bacen"] = "Extrato oficial do Banco Central de todas as contas e chaves PIX abertas no CPF (CCS/SCR)"
        data["investigacao_societaria_qsa"] = f"https://www.jusbrasil.com.br/busca?q={digits}+socio"
        data["regularidade_fiscal_divida_ativa_pgfn"] = "https://www.regularize.pgfn.gov.br/"
        data["pesquisa_processual_unificada_tribunais"] = f"https://www.jusbrasil.com.br/busca?q={digits}"
        data["diarios_oficiais_e_concursos_dou"] = f"https://www.in.gov.br/consulta/-/buscar/dou?q={digits}"
        data["portal_transparencia_federal"] = f"https://portaldatransparencia.gov.br/busca?termo={digits}"
        data["comprovante_receita_federal"] = "https://servicos.receitafederal.fazenda.gov.br/servicos/cpf/consultasituacao/consultapublica.asp"
        data["conectesus_cartao_nacional_saude"] = "https://conectesus-paciente.saude.gov.br/"

    # 2. Dossiê Completo por Telefone
    elif "phone" in kinds and "cpf" not in kinds:
        if len(digits) in (10, 11):
            data["chave_pix_telefone"] = f"+55{digits}"
            data["formato_bancario_spi"] = f"55{digits}"
            data["consulta_portabilidade_abr_telecom"] = "https://consultanumero.abrtelecom.com.br/consultanumero/consulta/consultaSituacaoAtualCtg.action"
            data["truecaller_identificador"] = f"https://www.truecaller.com/search/br/{digits}"
            data["syncme_identificador"] = f"https://sync.me/search/?number=+55{digits}"
            data["whatsapp_link"] = f"https://wa.me/55{digits}"
            data["telegram_link"] = f"https://t.me/+55{digits}"

    # 3. Dossiê Completo por E-mail
    if "email" in kinds:
        data["chave_pix_email"] = raw.lower()
        data["verificador_vazamentos_pwned"] = f"https://haveibeenpwned.com/account/{urllib.parse.quote(raw)}"
        data["aviso_seguranca_digital"] = "Verifica se este e-mail constou em vazamentos de dados conhecidos"
        data["google_account_check"] = f"https://myaccount.google.com/?email={urllib.parse.quote(raw)}"

    # 4. Dossiê Completo por Nome
    if "name" in kinds:
        encoded_name = urllib.parse.quote_plus(raw)
        data["investigacao_societaria_qsa"] = f"https://www.jusbrasil.com.br/busca?q={encoded_name}+socio"
        data["consulta_socios_receita_federal"] = f"https://portaldatransparencia.gov.br/busca?termo={encoded_name}"
        data["pesquisa_processual_unificada_tribunais"] = f"https://www.jusbrasil.com.br/busca?q={encoded_name}"
        data["processos_escavador"] = f"https://www.escavador.com/busca?q={encoded_name}"
        data["diarios_oficiais_municipais"] = "https://queridodiario.ok.org.br/"
        data["diarios_oficiais_e_concursos_dou"] = f"https://www.in.gov.br/consulta/-/buscar/dou?q={encoded_name}"
        data["perfil_github"] = f"https://github.com/search?q={encoded_name}&type=users"
        data["perfil_linkedin"] = f"https://www.linkedin.com/search/results/all/?keywords={encoded_name}"
        data["comunidade_discord"] = f"https://discord.com/search?q={encoded_name}"

    if not data:
        return []

    return [{"source": "crossintel", "target": "dossie_cruzado", "data": data}]

# ---------------------------------------------------------------------------
# 11. IBGE Intel — Demografia, População e Perfil Municipal
# ---------------------------------------------------------------------------

def _resolve_city_name(query: dict) -> str:
    """Tenta extrair um nome de cidade a partir da query ou de resultados de CEP."""
    raw = query["raw"].strip()
    kinds = query["kinds"]
    # Se for busca textual por nome de cidade
    if "name" in kinds and len(raw.split()) <= 3:
        return raw
    return ""


def fetch_ibge_intel(query: dict) -> list:
    kinds = query["kinds"]
    raw = query["raw"].strip()

    # Ativa para CEP, CNPJ (que têm cidade) ou quando é um nome curto de cidade
    city_name = _resolve_city_name(query)

    # Para CEP: busca o CEP primeiro para obter o nome da cidade
    if "cep" in kinds and len(query["digits"]) == 8:
        cep_url = f"{BRASILAPI}/cep/v2/{query['digits']}"
        cep_data, _ = http_get_json(cep_url, timeout=5)
        if cep_data and isinstance(cep_data, dict):
            city_name = cep_data.get("city", "") or cep_data.get("localidade", "")

    if not city_name:
        return []

    # Buscar município no IBGE Localidades
    encoded = urllib.parse.quote(city_name)
    ibge_url = f"https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome"
    data, err = http_get_json(ibge_url, timeout=8)
    if err or not data or not isinstance(data, list):
        return []

    # Encontra o município correspondente
    city_lower = city_name.lower().strip()
    found = None
    for mun in data:
        if mun.get("nome", "").lower() == city_lower:
            found = mun
            break

    if not found:
        # Busca parcial
        for mun in data:
            if city_lower in mun.get("nome", "").lower():
                found = mun
                break

    if not found:
        return []

    ibge_data = {
        "municipio": found.get("nome", ""),
        "codigo_ibge": str(found.get("id", "")),
    }

    # Microrregião e Mesorregião
    micro = found.get("microrregiao", {})
    if micro:
        ibge_data["microrregiao"] = micro.get("nome", "")
        meso = micro.get("mesorregiao", {})
        if meso:
            ibge_data["mesorregiao"] = meso.get("nome", "")
            uf = meso.get("UF", {})
            if uf:
                ibge_data["estado_ibge"] = f"{uf.get('nome', '')} ({uf.get('sigla', '')})"
                regiao = uf.get("regiao", {})
                if regiao:
                    ibge_data["regiao"] = regiao.get("nome", "")

    # Região Geográfica Imediata
    rgi = found.get("regiao-imediata", {})
    if rgi:
        ibge_data["regiao_geografica_imediata"] = rgi.get("nome", "")

    # Buscar população estimada
    cod = found.get("id", "")
    if cod:
        pop_url = f"https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-6/variaveis/9324?localidades=N6[{cod}]"
        pop_data, _ = http_get_json(pop_url, timeout=6)
        if pop_data and isinstance(pop_data, list) and pop_data:
            try:
                resultados = pop_data[0].get("resultados", [{}])
                if resultados:
                    series = resultados[0].get("series", [{}])
                    if series:
                        serie_data = series[0].get("serie", {})
                        # Pega o valor mais recente
                        if serie_data:
                            latest_year = max(serie_data.keys())
                            pop_val = serie_data[latest_year]
                            if pop_val and pop_val != "...":
                                ibge_data["populacao_estimada"] = f"{int(pop_val):,}".replace(",", ".") + f" hab. ({latest_year})"
            except Exception:
                pass

    if not ibge_data:
        return []

    return [{"source": "ibgeint", "target": "ibge_municipio", "data": ibge_data}]


# ---------------------------------------------------------------------------
# 12. Weather Intel — Clima em Tempo Real (Open-Meteo)
# ---------------------------------------------------------------------------

WMO_WEATHER_CODES = {
    0: "☀️ Céu limpo",
    1: "🌤️ Predominantemente limpo",
    2: "⛅ Parcialmente nublado",
    3: "☁️ Nublado",
    45: "🌫️ Nevoeiro",
    48: "🌫️ Nevoeiro com geada",
    51: "🌦️ Garoa leve",
    53: "🌦️ Garoa moderada",
    55: "🌧️ Garoa densa",
    61: "🌧️ Chuva leve",
    63: "🌧️ Chuva moderada",
    65: "🌧️ Chuva forte",
    71: "🌨️ Neve leve",
    73: "🌨️ Neve moderada",
    75: "❄️ Neve forte",
    80: "🌧️ Pancadas de chuva leves",
    81: "🌧️ Pancadas de chuva moderadas",
    82: "⛈️ Pancadas de chuva fortes",
    95: "⛈️ Tempestade com raios",
    96: "⛈️ Tempestade com granizo leve",
    99: "⛈️ Tempestade com granizo forte",
}


def fetch_weather_intel(query: dict) -> list:
    kinds = query["kinds"]
    raw = query["raw"].strip()
    lat, lon = None, None
    city_name = ""

    # Para CEP: resolve via Nominatim
    if "cep" in kinds and len(query["digits"]) == 8:
        cep_url = f"{BRASILAPI}/cep/v2/{query['digits']}"
        cep_data, _ = http_get_json(cep_url, timeout=5)
        if cep_data and isinstance(cep_data, dict):
            city_name = cep_data.get("city", "") or cep_data.get("localidade", "")
            lat_v = cep_data.get("location", {})
            if isinstance(lat_v, dict):
                coords = lat_v.get("coordinates", {})
                if isinstance(coords, dict):
                    lat = coords.get("latitude")
                    lon = coords.get("longitude")

    # Para IP: usa coordenadas do ip-api
    if "ip" in kinds and not lat:
        ip_data, _ = http_get_json(
            f"http://ip-api.com/json/{raw}?fields=lat,lon,city,status", timeout=5
        )
        if ip_data and ip_data.get("status") == "success":
            lat = ip_data.get("lat")
            lon = ip_data.get("lon")
            city_name = ip_data.get("city", "")

    # Para nome de cidade: geocodifica via Nominatim
    if not lat and city_name:
        nom_url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(city_name)},Brazil&format=json&limit=1"
        nom_data, _ = http_get_json(nom_url, timeout=6, headers={"User-Agent": USER_AGENT})
        if nom_data and isinstance(nom_data, list) and nom_data:
            lat = nom_data[0].get("lat")
            lon = nom_data[0].get("lon")

    if not lat or not lon:
        return []

    # Consulta Open-Meteo
    weather_url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,relative_humidity_2m,apparent_temperature,"
        f"weather_code,wind_speed_10m,surface_pressure"
        f"&timezone=America/Sao_Paulo"
    )
    w_data, err = http_get_json(weather_url, timeout=7)
    if err or not w_data or not isinstance(w_data, dict):
        return []

    current = w_data.get("current", {})
    if not current:
        return []

    weather_code = current.get("weather_code", -1)
    condition = WMO_WEATHER_CODES.get(weather_code, f"Código {weather_code}")

    weather_info = {}
    if city_name:
        weather_info["local"] = city_name

    weather_info["condicao_climatica"] = condition
    temp = current.get("temperature_2m")
    if temp is not None:
        weather_info["temperatura_atual"] = f"{temp}°C"
    apparent = current.get("apparent_temperature")
    if apparent is not None:
        weather_info["sensacao_termica"] = f"{apparent}°C"
    humidity = current.get("relative_humidity_2m")
    if humidity is not None:
        weather_info["umidade_relativa"] = f"{humidity}%"
    wind = current.get("wind_speed_10m")
    if wind is not None:
        weather_info["velocidade_do_vento"] = f"{wind} km/h"
    pressure = current.get("surface_pressure")
    if pressure is not None:
        weather_info["pressao_atmosferica"] = f"{pressure} hPa"

    return [{"source": "weatherint", "target": "clima_atual", "data": weather_info}]


# ---------------------------------------------------------------------------
# 13. Geo Intel — Geolocalização via OpenStreetMap / Nominatim
# ---------------------------------------------------------------------------

def fetch_geo_intel(query: dict) -> list:
    kinds = query["kinds"]
    raw = query["raw"].strip()
    search_term = ""

    if "cep" in kinds and len(query["digits"]) == 8:
        cep_url = f"{BRASILAPI}/cep/v2/{query['digits']}"
        cep_data, _ = http_get_json(cep_url, timeout=5)
        if cep_data and isinstance(cep_data, dict):
            parts = []
            for k in ("street", "logradouro"):
                v = cep_data.get(k)
                if v:
                    parts.append(v)
                    break
            for k in ("neighborhood", "bairro"):
                v = cep_data.get(k)
                if v:
                    parts.append(v)
                    break
            city = cep_data.get("city") or cep_data.get("localidade", "")
            uf = cep_data.get("state") or cep_data.get("uf", "")
            if city:
                parts.append(city)
            if uf:
                parts.append(uf)
            search_term = ", ".join(parts) if parts else ""

    if not search_term and "name" in kinds:
        # Busca pelo nome como endereço
        search_term = raw

    if not search_term:
        return []

    nom_url = (
        f"https://nominatim.openstreetmap.org/search?"
        f"q={urllib.parse.quote(search_term)}&format=json&limit=1&addressdetails=1"
    )
    data, err = http_get_json(nom_url, timeout=7, headers={"User-Agent": USER_AGENT})
    if err or not data or not isinstance(data, list) or not data:
        return []

    result = data[0]
    lat = result.get("lat", "")
    lon = result.get("lon", "")

    geo_data = {
        "endereco_completo": result.get("display_name", ""),
    }

    if lat and lon:
        geo_data["coordenadas_gps"] = f"{lat}, {lon}"
        geo_data["google_maps"] = f"https://www.google.com/maps?q={lat},{lon}"
        geo_data["openstreetmap"] = f"https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=16/{lat}/{lon}"

    addr = result.get("address", {})
    if addr:
        if addr.get("suburb"):
            geo_data["bairro_osm"] = addr["suburb"]
        if addr.get("city") or addr.get("town"):
            geo_data["cidade_osm"] = addr.get("city") or addr.get("town", "")
        if addr.get("state"):
            geo_data["estado_osm"] = addr["state"]
        if addr.get("postcode"):
            geo_data["cep_osm"] = addr["postcode"]

    return [{"source": "geoint", "target": "geolocalizacao", "data": geo_data}]


# ---------------------------------------------------------------------------
# 14. Economic Intel — Banco Central do Brasil (SGS) + AwesomeAPI Câmbio
# ---------------------------------------------------------------------------

def fetch_economic_intel(query: dict) -> list:
    kinds = query["kinds"]
    raw = query["raw"].strip().lower()

    if "economy" not in kinds:
        return []

    data = {}

    # 1. Taxa SELIC Meta (série 432 do SGS/Bacen)
    try:
        selic_url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json"
        selic_data, _ = http_get_json(selic_url, timeout=6)
        if selic_data and isinstance(selic_data, list) and selic_data:
            item = selic_data[0]
            data["selic_meta_atual"] = f"{item.get('valor', '')}% a.a."
            data["selic_data_referencia"] = item.get("data", "")
    except Exception:
        pass

    # 2. IPCA Mensal (série 433 do SGS/Bacen)
    try:
        ipca_url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/1?formato=json"
        ipca_data, _ = http_get_json(ipca_url, timeout=6)
        if ipca_data and isinstance(ipca_data, list) and ipca_data:
            item = ipca_data[0]
            data["ipca_mensal"] = f"{item.get('valor', '')}%"
            data["ipca_data_referencia"] = item.get("data", "")
    except Exception:
        pass

    # 3. IPCA Acumulado 12 meses (série 13522)
    try:
        ipca12_url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json"
        ipca12_data, _ = http_get_json(ipca12_url, timeout=6)
        if ipca12_data and isinstance(ipca12_data, list) and ipca12_data:
            item = ipca12_data[0]
            data["ipca_acumulado_12_meses"] = f"{item.get('valor', '')}%"
    except Exception:
        pass

    # 4. CDI (série 4389)
    try:
        cdi_url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json"
        cdi_data, _ = http_get_json(cdi_url, timeout=6)
        if cdi_data and isinstance(cdi_data, list) and cdi_data:
            item = cdi_data[0]
            data["cdi_diario"] = f"{item.get('valor', '')}%"
    except Exception:
        pass

    # 5. Câmbio Dólar e Euro (AwesomeAPI)
    try:
        cambio_url = "https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL"
        cambio_data, _ = http_get_json(cambio_url, timeout=6)
        if cambio_data and isinstance(cambio_data, dict):
            usd = cambio_data.get("USDBRL", {})
            if usd:
                data["dolar_comercial"] = f"R$ {usd.get('bid', '')}"
                data["dolar_venda"] = f"R$ {usd.get('ask', '')}"
                data["dolar_variacao"] = f"{usd.get('pctChange', '')}%"
            eur = cambio_data.get("EURBRL", {})
            if eur:
                data["euro_comercial"] = f"R$ {eur.get('bid', '')}"
                data["euro_venda"] = f"R$ {eur.get('ask', '')}"
                data["euro_variacao"] = f"{eur.get('pctChange', '')}%"
    except Exception:
        pass

    if not data:
        return []

    data["fonte_oficial"] = "Banco Central do Brasil (SGS) + AwesomeAPI"
    return [{"source": "econint", "target": "indicadores_economicos", "data": data}]


# ---------------------------------------------------------------------------
# 15. Crypto Intel — CoinGecko (Preço em tempo real)
# ---------------------------------------------------------------------------

CRYPTO_ID_MAP = {
    "btc": "bitcoin", "bitcoin": "bitcoin",
    "eth": "ethereum", "ethereum": "ethereum",
    "usdt": "tether", "tether": "tether",
    "bnb": "binancecoin", "binance": "binancecoin",
    "sol": "solana", "solana": "solana",
    "ada": "cardano", "cardano": "cardano",
    "xrp": "ripple", "ripple": "ripple",
    "doge": "dogecoin", "dogecoin": "dogecoin",
    "dot": "polkadot", "polkadot": "polkadot",
    "shib": "shiba-inu",
    "matic": "matic-network", "polygon": "matic-network",
    "avax": "avalanche-2", "avalanche": "avalanche-2",
    "link": "chainlink", "chainlink": "chainlink",
    "ltc": "litecoin", "litecoin": "litecoin",
    "uni": "uniswap", "uniswap": "uniswap",
    "atom": "cosmos", "cosmos": "cosmos",
    "near": "near", "trx": "tron", "tron": "tron",
    "pepe": "pepe", "cripto": None, "crypto": None,
}


def fetch_crypto_intel(query: dict) -> list:
    kinds = query["kinds"]
    raw = query["raw"].strip().lower()

    if "crypto" not in kinds:
        return []

    coin_id = CRYPTO_ID_MAP.get(raw)
    if not coin_id:
        return []

    url = (
        f"https://api.coingecko.com/api/v3/coins/{coin_id}"
        f"?localization=false&tickers=false&community_data=false&developer_data=false"
    )
    data, err = http_get_json(url, timeout=8)
    if err or not data or not isinstance(data, dict):
        return []

    market = data.get("market_data", {})
    if not market:
        return []

    crypto_data = {
        "nome": data.get("name", ""),
        "simbolo": (data.get("symbol", "")).upper(),
    }

    # Imagem
    image = data.get("image", {})
    if isinstance(image, dict) and image.get("large"):
        crypto_data["logo"] = image["large"]

    # Preços
    current = market.get("current_price", {})
    if current.get("brl"):
        crypto_data["preco_brl"] = f"R$ {current['brl']:,.2f}"
    if current.get("usd"):
        crypto_data["preco_usd"] = f"US$ {current['usd']:,.2f}"

    # Market Cap
    mc = market.get("market_cap", {})
    if mc.get("usd"):
        crypto_data["market_cap_usd"] = f"US$ {mc['usd']:,.0f}"

    # Variações
    change_24h = market.get("price_change_percentage_24h")
    if change_24h is not None:
        emoji = "📈" if change_24h >= 0 else "📉"
        crypto_data["variacao_24h"] = f"{emoji} {change_24h:+.2f}%"

    change_7d = market.get("price_change_percentage_7d")
    if change_7d is not None:
        emoji = "📈" if change_7d >= 0 else "📉"
        crypto_data["variacao_7d"] = f"{emoji} {change_7d:+.2f}%"

    change_30d = market.get("price_change_percentage_30d")
    if change_30d is not None:
        emoji = "📈" if change_30d >= 0 else "📉"
        crypto_data["variacao_30d"] = f"{emoji} {change_30d:+.2f}%"

    # Volume e Supply
    vol = market.get("total_volume", {})
    if vol.get("usd"):
        crypto_data["volume_24h_usd"] = f"US$ {vol['usd']:,.0f}"

    supply = market.get("circulating_supply")
    if supply:
        crypto_data["supply_circulante"] = f"{supply:,.0f}"

    total_supply = market.get("total_supply")
    if total_supply:
        crypto_data["supply_total"] = f"{total_supply:,.0f}"

    # Ranking
    rank = data.get("market_cap_rank")
    if rank:
        crypto_data["ranking_global"] = f"#{rank}"

    # ATH
    ath = market.get("ath", {})
    if ath.get("usd"):
        crypto_data["ath_usd"] = f"US$ {ath['usd']:,.2f}"

    crypto_data["fonte"] = f"https://www.coingecko.com/pt/moedas/{coin_id}"

    return [{"source": "cryptoint", "target": "criptomoeda", "data": crypto_data}]


# ---------------------------------------------------------------------------
# 16. Country Intel — REST Countries (Dossiê Geopolítico)
# ---------------------------------------------------------------------------

COUNTRY_NAME_MAP = {
    "brasil": "brazil", "brazil": "brazil",
    "argentina": "argentina", "chile": "chile",
    "colombia": "colombia", "peru": "peru",
    "uruguai": "uruguay", "paraguai": "paraguay",
    "mexico": "mexico", "méxico": "mexico",
    "eua": "united states", "usa": "united states", "estados unidos": "united states",
    "china": "china", "japao": "japan", "japão": "japan", "japan": "japan",
    "india": "india",
    "alemanha": "germany", "germany": "germany",
    "franca": "france", "frança": "france", "france": "france",
    "italia": "italy", "itália": "italy", "italy": "italy",
    "portugal": "portugal", "espanha": "spain", "spain": "spain",
    "russia": "russia", "rússia": "russia",
    "canada": "canada", "canadá": "canada",
    "australia": "australia", "austrália": "australia",
    "coreia do sul": "south korea", "south korea": "south korea",
    "reino unido": "united kingdom", "united kingdom": "united kingdom",
    "africa do sul": "south africa", "south africa": "south africa",
    "egito": "egypt", "egypt": "egypt",
}


_COUNTRIES_DATA_CACHE = None

def _get_countries_data():
    global _COUNTRIES_DATA_CACHE
    if _COUNTRIES_DATA_CACHE is None:
        url = "https://raw.githubusercontent.com/mledoze/countries/master/countries.json"
        data, err = http_get_json(url, timeout=8)
        if data and isinstance(data, list):
            _COUNTRIES_DATA_CACHE = data
        else:
            _COUNTRIES_DATA_CACHE = []
    return _COUNTRIES_DATA_CACHE


def fetch_country_intel(query: dict) -> list:
    kinds = query["kinds"]
    raw = query["raw"].strip().lower()

    if "country" not in kinds:
        return []

    en_name = COUNTRY_NAME_MAP.get(raw, raw)
    countries = _get_countries_data()
    if not countries:
        return []

    # Localizar país correspondente
    found = None
    for c in countries:
        common = (c.get("name", {}).get("common", "")).lower()
        official = (c.get("name", {}).get("official", "")).lower()
        cca2 = (c.get("cca2", "")).lower()
        cca3 = (c.get("cca3", "")).lower()
        translations = c.get("translations", {})
        por_common = translations.get("por", {}).get("common", "").lower() if isinstance(translations, dict) else ""
        por_official = translations.get("por", {}).get("official", "").lower() if isinstance(translations, dict) else ""

        if raw in (common, official, cca2, cca3, por_common, por_official) or en_name in (common, official):
            found = c
            break

    if not found:
        # Busca por contenção
        for c in countries:
            common = (c.get("name", {}).get("common", "")).lower()
            if en_name in common or common in en_name:
                found = c
                break

    if not found:
        return []

    info = {}
    name_obj = found.get("name", {})
    info["nome_oficial"] = name_obj.get("official", "") or name_obj.get("common", "")
    info["nome_comum"] = name_obj.get("common", "")

    # Bandeira SVG de alta resolução via flagcdn
    cca2_code = found.get("cca2", "").lower()
    if cca2_code:
        info["bandeira_svg"] = f"https://flagcdn.com/{cca2_code}.svg"

    # Capital
    capitals = found.get("capital", [])
    if capitals:
        info["capital"] = ", ".join(capitals)

    # Região e Sub-região
    info["regiao"] = found.get("region", "")
    info["sub_regiao"] = found.get("subregion", "")

    # Área
    area = found.get("area")
    if area:
        info["area_km2"] = f"{area:,.0f} km²"

    # Moedas
    currencies = found.get("currencies", {})
    if currencies and isinstance(currencies, dict):
        cur_list = []
        for code, cur_info in currencies.items():
            if isinstance(cur_info, dict):
                name = cur_info.get("name", "")
                symbol = cur_info.get("symbol", "")
                cur_list.append(f"{name} ({code}) {symbol}".strip())
            else:
                cur_list.append(str(code))
        if cur_list:
            info["moedas"] = " | ".join(cur_list)

    # Idiomas
    languages = found.get("languages", {})
    if languages and isinstance(languages, dict):
        info["idiomas"] = ", ".join(languages.values())

    # Fronteiras
    borders = found.get("borders", [])
    if borders and isinstance(borders, list):
        info["paises_fronteiricos"] = ", ".join(borders)

    # Coordenadas
    latlng = found.get("latlng", [])
    if len(latlng) == 2:
        info["coordenadas_centrais"] = f"{latlng[0]}, {latlng[1]}"
        info["google_maps_pais"] = f"https://www.google.com/maps?q={latlng[0]},{latlng[1]}"

    # Siglas ISO
    info["iso_alpha2"] = found.get("cca2", "")
    info["iso_alpha3"] = found.get("cca3", "")

    return [{"source": "countryint", "target": "pais", "data": info}]


# ---------------------------------------------------------------------------
# 17. Vault Intel — Busca Silenciosa no Data Vault Local
# ---------------------------------------------------------------------------

def fetch_vault_intel(query: dict) -> list:
    """Busca silenciosa nos arquivos locais do Data Vault."""
    raw = query["raw"].strip()
    if not raw:
        return []
    return search_vault(raw)


# ---------------------------------------------------------------------------
# 18. Bank Intel — Inteligência Bancária (ISPB, COMPE, Pix e SPI)
# ---------------------------------------------------------------------------

def fetch_bank_intel(query: dict) -> list:
    """Inteligência Financeira: COMPE, ISPB, Pix, SPI e Detalhes da Instituição Bancária."""
    kinds = query["kinds"]
    raw = query["raw"].strip().lower()
    digits = query["digits"]
    
    if "bank" not in kinds and not (len(digits) in (1, 2, 3) and raw == digits):
        return []

    found = None
    if digits in BRAZILIAN_BANKS_CATALOG:
        found = BRAZILIAN_BANKS_CATALOG[digits]
    elif len(digits) == 1 and f"00{digits}" in BRAZILIAN_BANKS_CATALOG:
        found = BRAZILIAN_BANKS_CATALOG[f"00{digits}"]
    elif len(digits) == 2 and f"0{digits}" in BRAZILIAN_BANKS_CATALOG:
        found = BRAZILIAN_BANKS_CATALOG[f"0{digits}"]
    else:
        for code, b_info in BRAZILIAN_BANKS_CATALOG.items():
            if raw in b_info["name"].lower() or raw in b_info["short"].lower():
                found = b_info
                break

    data = {}
    if found:
        data["banco"] = found["name"]
        data["codigo_banco"] = found["code"]
        data["ispb"] = found["ispb"]
        data["tipo_instituicao"] = found.get("tipo", "Instituição Financeira Autorizada Bacen")
        data["sistema_pix"] = found.get("pix", "Participante Direto (SPI / DICT)")
        data["formato_bancario_spi"] = f"ISPB {found['ispb']} (Banco Central)"
        data["website_institucional"] = found.get("site", "")
        data["relatorio_contas_pix_registrato"] = "https://registrato.bcb.gov.br/registrato/"
        data["aviso_registrato_bacen"] = "Consulte chaves PIX e contas ativas no Registrato do Banco Central"
        return [{"source": "bankint", "target": "banco", "data": data}]

    if digits:
        url = f"{BRASILAPI}/banks/v1/{int(digits)}"
        payload, err = http_get_json(url, timeout=6)
        if payload and isinstance(payload, dict) and not err:
            return [{"source": "bankint", "target": "banco", "data": payload}]

    return []


# ═══════════════════════════════════════════════════════════════════════════
# Motor Principal de Busca & Auto-Cascade 360°
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
        "crossintel": fetch_cross_intelligence,
        "ibgeint": fetch_ibge_intel,
        "weatherint": fetch_weather_intel,
        "geoint": fetch_geo_intel,
        "econint": fetch_economic_intel,
        "cryptoint": fetch_crypto_intel,
        "countryint": fetch_country_intel,
        "vaultint": fetch_vault_intel,
        "bankint": fetch_bank_intel,
    }

    collected_fields = []
    errors = []
    used = []
    skipped = [api["id"] for api in AVAILABLE_APIS if api["id"] not in enabled]

    # ── Fase 1: Execução Paralela Primária ──
    with ThreadPoolExecutor(max_workers=14) as pool:
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

    # ── Fase 2: Auto-Cascade 360° (Enriquecimento Automático em Cascata) ──
    # Se CNPJ, Nome ou Telefone descobriu um CEP ou Cidade, busca IBGE, Clima e Mapa automaticamente
    discovered_cep = None
    discovered_city = None

    for item in collected_fields:
        k = item["key"].lower()
        v = str(item["value"]).strip()
        if "cep" in k and re.fullmatch(r"\d{8}|\d{5}-\d{3}", v) and not discovered_cep:
            discovered_cep = re.sub(r"\D", "", v)
        if ("municipio" in k or "cidade" in k) and len(v) >= 3 and not discovered_city:
            discovered_city = v

    cascade_tasks = []
    if discovered_cep and "cep" not in query["kinds"]:
        cascade_query = {"raw": discovered_cep, "digits": discovered_cep, "kinds": ["cep"]}
        if "ibgeint" in enabled and not any(u.startswith("ibgeint:") for u in used):
            cascade_tasks.append((fetch_ibge_intel, cascade_query, "ibgeint"))
        if "weatherint" in enabled and not any(u.startswith("weatherint:") for u in used):
            cascade_tasks.append((fetch_weather_intel, cascade_query, "weatherint"))
        if "geoint" in enabled and not any(u.startswith("geoint:") for u in used):
            cascade_tasks.append((fetch_geo_intel, cascade_query, "geoint"))
    elif discovered_city and "cep" not in query["kinds"]:
        city_query = {"raw": discovered_city, "digits": "", "kinds": ["name"]}
        if "ibgeint" in enabled and not any(u.startswith("ibgeint:") for u in used):
            cascade_tasks.append((fetch_ibge_intel, city_query, "ibgeint"))
        if "weatherint" in enabled and not any(u.startswith("weatherint:") for u in used):
            cascade_tasks.append((fetch_weather_intel, city_query, "weatherint"))
        if "geoint" in enabled and not any(u.startswith("geoint:") for u in used):
            cascade_tasks.append((fetch_geo_intel, city_query, "geoint"))

    if cascade_tasks:
        with ThreadPoolExecutor(max_workers=len(cascade_tasks)) as cascade_pool:
            c_futs = {cascade_pool.submit(fn, q): src for fn, q, src in cascade_tasks}
            for fut in as_completed(c_futs):
                src = c_futs[fut]
                try:
                    c_chunks = fut.result()
                    for chunk in c_chunks:
                        if "error" in chunk:
                            continue
                        used.append(f"{chunk['source']}:{chunk['target']}")
                        for key, value in flatten_payload(chunk["data"]):
                            collected_fields.append({
                                "key": f"{chunk['target']}.{key}" if key else chunk["target"],
                                "value": value,
                                "source": chunk["source"],
                            })
                except Exception:
                    pass

    # ── Fase 3: Deduplicação Canônica e Estruturação em Seções ──
    dossier = canonicalize_and_structure_dossier(collected_fields, query)

    return {
        "query": query["raw"],
        "query_types": query["kinds"],
        "fields": dossier["fields"],
        "sections": dossier["sections"],
        "sources_used": list(dict.fromkeys(used)),
        "sources_enabled": enabled,
        "sources_skipped": skipped,
        "errors": errors,
        "total": len(dossier["fields"]),
    }

