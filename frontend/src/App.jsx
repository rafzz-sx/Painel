import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import gsap from 'gsap';
import { API, startKeepAlive, stopKeepAlive } from './api';
import HelpModal from './HelpModal';
import AdminDashboard from './AdminDashboard';
import './styles/index.css';

const APP_VERSION = 'v3.5.0';
const APP_BUILD_TIME = '24/08 às 18:15';
const SESSION_KEY = 'painel_auth_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 horas de sessão contínua

function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session.expiresAt && Date.now() < session.expiresAt) {
      return session;
    }
    localStorage.removeItem(SESSION_KEY);
    return null;
  } catch {
    return null;
  }
}

function saveSession(data) {
  try {
    const session = {
      ...data,
      savedAt: data.savedAt || Date.now(),
      expiresAt: data.expiresAt || (Date.now() + SESSION_DURATION_MS),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

function formatRemainingTime(expiresAt) {
  if (!expiresAt) return '8h restantes';
  const diff = expiresAt - Date.now();
  if (diff <= 0) return 'Expirada';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m restantes`;
}

export function formatBRDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const raw = String(isoString);
    const d = new Date(raw.endsWith('Z') ? raw : raw + 'Z');
    if (isNaN(d.getTime())) {
      const clean = raw.replace('T', ' ');
      const [datePart, timePart] = clean.split(' ');
      if (datePart && timePart) {
        const [y, m, day] = datePart.split('-');
        return `${day}/${m}/${y} às ${timePart.slice(0, 5)}`;
      }
      return isoString;
    }
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Sao_Paulo',
    }).format(d).replace(', ', ' às ');
  } catch {
    return isoString;
  }
}

// ---------------------------------------------------------------------------
// Constants & Config
// ---------------------------------------------------------------------------

const DEFAULT_APIS = [
  { id: 'minhareceita', name: 'Minha Receita (CNPJ & Sócios)', supports: ['CNPJ', 'Sócios/QSA', 'CNAE', 'Capital'] },
  { id: 'receitaws', name: 'ReceitaWS', supports: ['CNPJ'] },
  { id: 'brasilapi', name: 'BrasilAPI', supports: ['CNPJ', 'CEP', 'DDD', 'Feriados'] },
  { id: 'bankint', name: 'Bancos & SPI (Bacen / COMPE)', supports: ['Bancos', 'ISPB', 'COMPE', 'Pix'] },
  { id: 'nameint', name: 'Nome Intel (Pessoas & Diários)', supports: ['Nome', 'GitHub', 'Transparência', 'Jusbrasil', 'SUS', 'Discord'] },
  { id: 'phoneint', name: 'Telefone Intel', supports: ['Operadora', 'Portabilidade', 'ABR Telecom', 'WhatsApp', 'Telegram', 'Truecaller', 'SUS'] },
  { id: 'emailint', name: 'E-mail Intel', supports: ['Gravatar', 'GitHub', 'MX DNS', 'Anti-Spam'] },
  { id: 'cpfint', name: 'CPF Intel', supports: ['Validação', 'Região Fiscal', 'Receita Federal', 'ConecteSUS'] },
  { id: 'plateint', name: 'Placa Intel', supports: ['Mercosul', 'Denatran UF'] },
  { id: 'ipdomainint', name: 'IP/Domínio Intel', supports: ['Geolocalização', 'Registro.br RDAP', 'ISP'] },
  { id: 'crossintel', name: 'Dossiê Cruzado (Bancos, Sócios & Vazamentos)', supports: ['Bancos', 'PIX', 'Sócios', 'Vazamentos', 'Registrato'] },
  { id: 'ibgeint', name: 'IBGE (Demografia & Municípios)', supports: ['População', 'Microrregião', 'Perfil Municipal'] },
  { id: 'weatherint', name: 'Clima em Tempo Real (Open-Meteo)', supports: ['Temperatura', 'Umidade', 'Vento'] },
  { id: 'geoint', name: 'Geolocalização (OpenStreetMap)', supports: ['GPS', 'Mapa', 'Endereço'] },
  { id: 'econint', name: 'Indicadores Econômicos (Bacen & Câmbio)', supports: ['SELIC', 'IPCA', 'Dólar', 'Euro'] },
  { id: 'cryptoint', name: 'Criptomoedas (CoinGecko)', supports: ['Preço', 'Market Cap', 'Volume'] },
  { id: 'countryint', name: 'Países (REST Countries)', supports: ['Bandeira', 'População', 'Moedas', 'Idiomas'] },
  { id: 'vaultint', name: '📂 Base Local (Data Vault)', supports: ['PDF', 'TXT', 'CSV', 'JSON', 'SQL'] },
];

const SOURCE_COLORS = {
  minhareceita: 'badge--cyan',
  receitaws: 'badge--blue',
  brasilapi: 'badge--green',
  bankint: 'badge--gold',
  nameint: 'badge--purple',
  phoneint: 'badge--cyan',
  emailint: 'badge--gold',
  cpfint: 'badge--green',
  plateint: 'badge--gold',
  ipdomainint: 'badge--purple',
  crossintel: 'badge--cyan',
  ibgeint: 'badge--blue',
  weatherint: 'badge--green',
  geoint: 'badge--purple',
  econint: 'badge--gold',
  cryptoint: 'badge--cyan',
  countryint: 'badge--blue',
  vault: 'badge--vault',
  vaultint: 'badge--vault',
};

const SOURCE_LABELS = {
  minhareceita: 'Minha Receita',
  receitaws: 'ReceitaWS',
  brasilapi: 'BrasilAPI',
  bankint: 'Bancos & SPI',
  nameint: 'Nome Intel',
  phoneint: 'Telefone Intel',
  emailint: 'E-mail Intel',
  cpfint: 'CPF Intel',
  plateint: 'Placa Intel',
  ipdomainint: 'IP/Domínio Intel',
  crossintel: 'Dossiê Cruzado',
  ibgeint: 'IBGE Oficial',
  weatherint: 'Clima ao Vivo',
  geoint: 'Geolocalização',
  econint: 'Banco Central',
  cryptoint: 'CoinGecko',
  countryint: 'Geopolítica',
  vault: 'Base Local',
  vaultint: 'Base Local',
};

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const IconShield = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const IconUser = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconMail = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const IconLock = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconEye = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconEyeOff = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" x2="22" y1="2" y2="22" />
  </svg>
);

const IconSearch = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const IconSettings = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconLogout = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" x2="9" y1="12" y2="12" />
  </svg>
);

const IconGrid = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="7" height="7" x="3" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" />
    <rect width="7" height="7" x="3" y="14" rx="1" />
  </svg>
);

const IconCheck = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconAlert = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" x2="12" y1="8" y2="12" />
    <line x1="12" x2="12.01" y1="16" y2="16" />
  </svg>
);

const IconInfo = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

const IconTicket = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <path d="M13 5v2" />
    <path d="M13 17v2" />
    <path d="M13 11v2" />
  </svg>
);

const IconHelp = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </svg>
);

const IconClose = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const IconClock = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function describeLoginError(error) {
  if (!error.response) {
    return 'Sem conexão com o servidor. O servidor pode estar acordando (aguarde 30s) ou verifique sua internet.';
  }
  const status = error.response.status;
  const detail = error.response.data?.detail;
  if (detail) return detail;
  if (status === 400) return 'E-mail ou senha incorretos.';
  if (status === 404) return 'Conta não encontrada.';
  if (status >= 500) return 'Instabilidade temporária no servidor. Tente novamente em instantes.';
  return 'Não foi possível completar o login.';
}

function describeSearchError(error) {
  if (!error.response) {
    return 'Sem resposta da API. O servidor pode estar acordando — tente novamente em alguns segundos.';
  }
  const detail = error.response.data?.detail;
  if (detail) return detail;
  if (error.response.status === 404) return 'Nenhum dado encontrado para essa informação.';
  if (error.response.status === 403) return 'Nenhuma API está ativa para sua conta. Peça ao administrador.';
  return 'Erro ao consultar APIs externas.';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLabel(key) {
  const customLabels = {
    razao_social: 'Razão Social',
    nome_fantasia: 'Nome Fantasia',
    cnpj: 'CNPJ',
    cpf: 'CPF',
    situacao_cadastral: 'Situação Cadastral',
    data_abertura: 'Data de Abertura',
    capital_social: 'Capital Social',
    porte: 'Porte da Empresa',
    natureza_juridica: 'Natureza Jurídica',
    cnae_principal: 'Atividade Principal (CNAE)',
    quadro_de_socios_qsa: 'Quadro Societário & Sócios (QSA)',
    regiao_fiscal: 'Região Fiscal (Receita)',
    validador_matematico_cpf: 'Validação de Dígitos (CPF)',
    endereco_completo: 'Endereço Completo',
    logradouro: 'Logradouro',
    numero: 'Número',
    bairro: 'Bairro',
    municipio: 'Município / Cidade',
    uf: 'Estado (UF)',
    cep: 'CEP',
    coordenadas_gps: 'Coordenadas GPS',
    google_maps: 'Localização no Google Maps',
    openstreetmap: 'Mapa Interativo OpenStreetMap',
    codigo_ibge: 'Código IBGE Municipal',
    populacao_estimada: 'População Estimada (IBGE)',
    microrregiao: 'Microrregião (IBGE)',
    mesorregiao: 'Mesorregião (IBGE)',
    regiao_geografica_imediata: 'Região Imediata (IBGE)',
    temperatura_atual: 'Temperatura Atual',
    sensacao_termica: 'Sensação Térmica',
    umidade_relativa: 'Umidade do Ar',
    condicao_climatica: 'Condição do Clima em Tempo Real',
    velocidade_do_vento: 'Velocidade do Vento',
    pressao_atmosferica: 'Pressão Atmosférica',
    banco: 'Instituição Bancária',
    codigo_banco: 'Código de Compensação (COMPE)',
    ispb: 'Código ISPB (Banco Central)',
    chave_pix_cpf: 'Chave PIX Provável (CPF)',
    chave_pix_cnpj: 'Chave PIX Provável (CNPJ)',
    chave_pix_telefone: 'Chave PIX Provável (Telefone)',
    chave_pix_email: 'Chave PIX Provável (E-mail)',
    formato_bancario_spi: 'Identificador Bancário SPI',
    relatorio_contas_pix_registrato: 'Contas & Chaves PIX (Registrato Bacen)',
    selic_meta_atual: 'Taxa SELIC Meta Atual',
    ipca_mensal: 'Inflação Oficial (IPCA Mensal)',
    ipca_acumulado_12_meses: 'IPCA Acumulado (12 Meses)',
    cdi_diario: 'Taxa CDI',
    dolar_comercial: 'Cotação Dólar Comercial',
    dolar_venda: 'Dólar Venda',
    euro_comercial: 'Cotação Euro Comercial',
    euro_venda: 'Euro Venda',
    preco_brl: 'Preço em Reais (BRL)',
    preco_usd: 'Preço em Dólar (USD)',
    market_cap_usd: 'Valor de Mercado (Market Cap)',
    variacao_24h: 'Variação 24 Horas',
    variacao_7d: 'Variação 7 Dias',
    variacao_30d: 'Variação 30 Dias',
    investigacao_societaria_qsa: 'Investigação Societária e Vínculos',
    consulta_socios_receita_federal: 'Sócios na Transparência Federal',
    pesquisa_processual_unificada_tribunais: 'Processos Judiciais (Tribunais)',
    processos_escavador: 'Processos e Menções (Escavador)',
    diarios_oficiais_municipais: 'Diários Oficiais dos Municípios',
    diarios_oficiais_e_concursos_dou: 'Diário Oficial da União (DOU)',
    comprovante_situacao_cadastral_rfb: 'Comprovante Oficial (Receita Federal)',
    regularidade_fiscal_divida_ativa_pgfn: 'Dívida Ativa da União (PGFN / Regularize)',
    portal_da_transparencia: 'Portal da Transparência Federal',
    telefone: 'Telefone de Contato',
    operadora: 'Operadora de Telefonia',
    whatsapp_link: 'Conversa Direta no WhatsApp',
    telegram_link: 'Perfil no Telegram',
    truecaller_identificador: 'Identificador Truecaller',
    syncme_identificador: 'Identificador Sync.me',
    email: 'E-mail de Contato',
    verificador_vazamentos_pwned: 'Checagem de Vazamentos (HaveIBeenPwned)',
    perfil_github: 'Perfil de Desenvolvedor no GitHub',
    perfil_linkedin: 'Perfil Profissional no LinkedIn',
    servidores_de_email_mx: 'Servidores de E-mail (DNS MX)',
    foto_perfil_gravatar: 'Foto de Perfil Pública (Gravatar)',
    tipo_de_email: 'Classificação do E-mail',
  };

  if (customLabels[key]) return customLabels[key];

  return key
    .replace(/^base_local_/, '📂 Base Local: ')
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderValue(value, key = '') {
  if (value === null || value === undefined) return '—';
  const str = String(value);

  // Mini-Mapa Interativo Embutido (quando coordenadas GPS)
  if (key === 'coordenadas_gps' || (str.includes(',') && str.split(',').length === 2 && !isNaN(parseFloat(str.split(',')[0])) && !isNaN(parseFloat(str.split(',')[1])) && Math.abs(parseFloat(str.split(',')[0])) <= 90)) {
    const parts = str.split(',');
    const lat = parseFloat(parts[0].trim());
    const lon = parseFloat(parts[1].trim());
    if (!isNaN(lat) && !isNaN(lon)) {
      const bbox = `${lon - 0.008},${lat - 0.005},${lon + 0.008},${lat + 0.005}`;
      const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lon}`;
      return (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-primary font-semibold">📍 GPS: {lat.toFixed(6)}, {lon.toFixed(6)}</span>
          </div>
          <div className="w-full h-44 rounded-xl overflow-hidden border border-white/15 shadow-md relative bg-surface">
            <iframe
              title="Mini-Mapa OpenStreetMap"
              src={embedUrl}
              className="w-full h-full border-0"
              loading="lazy"
            />
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <a
              href={`https://www.google.com/maps?q=${lat},${lon}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-400 text-[10px] font-medium hover:bg-emerald-400/20"
            >
              📍 Abrir no Google Maps ↗
            </a>
            <a
              href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-primary/30 bg-primary/10 text-primary text-[10px] font-medium hover:bg-primary/20"
            >
              🗺️ Ver no OpenStreetMap ↗
            </a>
          </div>
        </div>
      );
    }
  }

  // Imagens de avatar
  if (str.startsWith('http') && (str.includes('avatar') || str.includes('gravatar') || str.endsWith('.png') || str.endsWith('.jpg'))) {
    return (
      <div className="flex items-center gap-3.5 py-1">
        <img src={str} alt="Foto de perfil pública" className="w-14 h-14 rounded-full border-2 border-primary/40 object-cover shadow-glow" />
        <div>
          <a href={str} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline font-mono block font-semibold">
            Ver foto original ↗
          </a>
          <span className="text-[10px] text-ink-faint">Foto pública identificada no Gravatar / GitHub</span>
        </div>
      </div>
    );
  }

  // SVG Flags / Coat of Arms (REST Countries)
  if (str.startsWith('http') && str.endsWith('.svg') && (str.includes('flag') || str.includes('coatofarms'))) {
    const isFlag = str.includes('flag');
    return (
      <div className="flex items-center gap-3 py-1">
        <img
          src={str}
          alt={isFlag ? 'Bandeira' : 'Brasão de Armas'}
          className={isFlag
            ? 'w-16 h-auto rounded-md border border-white/15 shadow-md'
            : 'w-14 h-auto rounded-lg'}
          loading="lazy"
        />
        <a href={str} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline font-mono">
          {isFlag ? 'Bandeira SVG ↗' : 'Brasão SVG ↗'}
        </a>
      </div>
    );
  }

  // Crypto logos (CoinGecko large images)
  if (str.startsWith('http') && str.includes('coingecko') && str.includes('/large/')) {
    return (
      <div className="flex items-center gap-3 py-1">
        <img src={str} alt="Logo criptoativo" className="w-12 h-12 rounded-full border border-primary/30 shadow-glow" loading="lazy" />
        <span className="text-[10px] text-ink-faint font-mono">Logo oficial via CoinGecko</span>
      </div>
    );
  }

  // Links clicáveis com legendas explicativas completas
  if (str.startsWith('http://') || str.startsWith('https://')) {
    let linkLabel = 'Abrir link oficial ↗';
    let btnClass = 'text-primary border-primary/30 bg-primary/10 hover:bg-primary/20';
    let explanation = 'Link externo para consulta de registros públicos.';

    if (str.includes('conectesus')) {
      linkLabel = '🏥 ConecteSUS / Ministério da Saúde ↗';
      btnClass = 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/20';
      explanation = 'Acesso ao Cartão Nacional de Saúde (CNS), vacinas e histórico do SUS (Requer gov.br).';
    } else if (str.includes('receitafederal')) {
      linkLabel = '🏛️ Receita Federal (Comprovante Oficial) ↗';
      btnClass = 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10 hover:bg-emerald-400/20';
      explanation = 'Consulta pública oficial da Receita Federal para emitir o comprovante de situação cadastral.';
    } else if (str.includes('consultanumero.abrtelecom')) {
      linkLabel = '📞 ABR Telecom (Portabilidade Oficial) ↗';
      btnClass = 'text-amber border-amber/30 bg-amber/10 hover:bg-amber/20';
      explanation = 'Base em tempo real da ABR Telecom para checar a operadora atualizada de linhas portadas.';
    } else if (str.includes('registrato.bcb.gov.br')) {
      linkLabel = '🏛️ Banco Central (Registrato / Contas & PIX) ↗';
      btnClass = 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10 hover:bg-emerald-400/20';
      explanation = 'Sistema oficial do Banco Central do Brasil para emitir relatório de todas as contas bancárias e chaves PIX ativas.';
    } else if (str.includes('haveibeenpwned')) {
      linkLabel = '🛡️ HaveIBeenPwned (Checagem de Vazamentos) ↗';
      btnClass = 'text-rose-400 border-rose-400/30 bg-rose-400/10 hover:bg-rose-400/20';
      explanation = 'Verifica se o e-mail ou credenciais já foram expostos em incidentes públicos de segurança na internet.';
    } else if (str.includes('wa.me')) {
      linkLabel = '💬 Iniciar Conversa no WhatsApp ↗';
      btnClass = 'text-success border-success/30 bg-success/10 hover:bg-success/20';
      explanation = 'Inicia conversa direta no WhatsApp ou WhatsApp Web sem precisar adicionar o número à agenda.';
    } else if (str.includes('t.me')) {
      linkLabel = '✈️ Abrir no Telegram ↗';
      btnClass = 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/20';
      explanation = 'Localiza perfil ou canal vinculado a este número no Telegram.';
    } else if (str.includes('truecaller')) {
      linkLabel = '📞 Consultar no Truecaller ↗';
      btnClass = 'text-blue-400 border-blue-400/30 bg-blue-400/10 hover:bg-blue-400/20';
      explanation = 'Identificador comunitário de chamadas para checar o nome informado por outros usuários.';
    } else if (str.includes('sync.me')) {
      linkLabel = '🔍 Consultar no Sync.me ↗';
      btnClass = 'text-indigo-400 border-indigo-400/30 bg-indigo-400/10 hover:bg-indigo-400/20';
      explanation = 'Identificador de chamadas colaborativo e busca de redes sociais associadas.';
    } else if (str.includes('github.com')) {
      linkLabel = '🐙 Perfil no GitHub ↗';
      btnClass = 'text-primary border-primary/30 bg-primary/10 hover:bg-primary/20';
      explanation = 'Perfil público de desenvolvedor com foto, biografia, empresa e repositórios abertos.';
    } else if (str.includes('portaldatransparencia')) {
      linkLabel = '🏛️ Portal da Transparência Federal ↗';
      btnClass = 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/20';
      explanation = 'Base oficial do Governo Federal para consulta de servidores públicos, PEP e benefícios.';
    } else if (str.includes('in.gov.br')) {
      linkLabel = '📰 Diário Oficial da União (DOU) ↗';
      btnClass = 'text-purple-400 border-purple-400/30 bg-purple-400/10 hover:bg-purple-400/20';
      explanation = 'Consulta de publicações de concursos públicos, nomeações, licitações e atos da União.';
    } else if (str.includes('regularize.pgfn.gov.br')) {
      linkLabel = '🏛️ Dívida Ativa da União (PGFN / Regularize) ↗';
      btnClass = 'text-amber border-amber/30 bg-amber/10 hover:bg-amber/20';
      explanation = 'Consulta pública no portal REGULARIZE da Fazenda Nacional para checar débitos e certidões negativas.';
    } else if (str.includes('queridodiario')) {
      linkLabel = '📰 Diários Oficiais dos Municípios ↗';
      btnClass = 'text-purple-400 border-purple-400/30 bg-purple-400/10 hover:bg-purple-400/20';
      explanation = 'Pesquisa em publicações e Diários Oficiais municipais abertos pelo Open Knowledge Brasil.';
    } else if (str.includes('jusbrasil')) {
      linkLabel = '⚖️ Processos no Jusbrasil ↗';
      btnClass = 'text-amber border-amber/30 bg-amber/10 hover:bg-amber/20';
      explanation = 'Busca pública de processos judiciais e menções em diários de justiça de todo o país.';
    } else if (str.includes('escavador')) {
      linkLabel = '🔍 Busca no Escavador ↗';
      btnClass = 'text-indigo-400 border-indigo-400/30 bg-indigo-400/10 hover:bg-indigo-400/20';
      explanation = 'Busca de pessoas e publicações em diários oficiais e judiciais do Brasil.';
    } else if (str.includes('openstreetmap.org')) {
      linkLabel = '🗺️ Ver no OpenStreetMap ↗';
      btnClass = 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10 hover:bg-emerald-400/20';
      explanation = 'Mapa interativo aberto completo com ruas, quadras e pontos de interesse.';
    } else if (str.includes('coingecko.com')) {
      linkLabel = '🪙 Ver no CoinGecko ↗';
      btnClass = 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/20';
      explanation = 'Página do criptoativo com gráficos de preço ao vivo e dados de mercado.';
    } else if (str.includes('google.com/maps')) {
      linkLabel = '📍 Ver no Google Maps ↗';
      btnClass = 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10 hover:bg-emerald-400/20';
      explanation = 'Localização precisa no Google Maps com vista de satélite e Street View.';
    }

    return (
      <div className="space-y-1.5 pt-1">
        <a
          href={str}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${btnClass}`}
        >
          {linkLabel}
        </a>
        <p className="text-[11px] text-ink-dim leading-snug flex items-start gap-1.5 pl-0.5">
          <span className="opacity-70 shrink-0 mt-0.5">ℹ️</span>
          <span>{explanation}</span>
        </p>
      </div>
    );
  }

  return str;
}

// ---------------------------------------------------------------------------
// Helpers de Automação (Cópia Formatada WhatsApp & Relatório PDF)
// ---------------------------------------------------------------------------

function generateFormattedDossierText(query, results) {
  const fields = results?.fields || [];
  const sections = results?.sections || {};
  let text = `╔═════════════════════════════════════════════════════════════╗\n`;
  text += `   🛡️ PAINEL DE DADOS — DOSSIÊ INVESTIGATIVO 360°\n`;
  text += `   📅 Gerado em: ${new Date().toLocaleString('pt-BR')} | 🔍 Termo: ${query}\n`;
  text += `╚═════════════════════════════════════════════════════════════╝\n\n`;

  const sectionTitles = {
    highlights: '🌟 DESTAQUES & INTELIGÊNCIA CRUZADA',
    identification: '🏢 IDENTIFICAÇÃO & CADASTRO OFICIAL',
    banking: '🏦 BANCOS & INTELIGÊNCIA FINANCEIRA',
    location: '📍 LOCALIZAÇÃO, DEMOGRAFIA & CLIMA',
    legal: '⚖️ JURÍDICO, DIÁRIOS OFICIAIS & PROCESSOS',
    digital: '🌐 PRESENÇA DIGITAL & CONTATOS',
    vault: '📂 REGISTROS NO DATA VAULT LOCAL',
  };

  for (const [secKey, secFields] of Object.entries(sections)) {
    if (!secFields || secFields.length === 0) continue;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `${sectionTitles[secKey] || secKey.toUpperCase()}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const f of secFields) {
      const label = formatLabel(f.key);
      const val = String(f.value).trim();
      const sources = (f.sources || []).map(s => SOURCE_LABELS[s] || s).join(', ');
      text += `• ${label}: ${val} [Fonte: ${sources}]\n`;
    }
    text += `\n`;
  }

  text += `─────────────────────────────────────────────────────────────\n`;
  text += `Relatório gerado pelo Painel de Dados v3.5.0 — Inteligência Avançada\n`;
  return text;
}

function printDossierReport(query, results) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  const sections = results?.sections || {};
  const fields = results?.fields || [];

  let html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Dossiê Investigativo - ${query}</title>`;
  html += `<style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #111; padding: 30px; line-height: 1.5; }
    .header { border-bottom: 3px solid #0066cc; padding-bottom: 15px; margin-bottom: 25px; }
    .header h1 { margin: 0; color: #0066cc; font-size: 24px; display: flex; align-items: center; gap: 8px; }
    .header p { margin: 6px 0 0; font-size: 12px; color: #555; font-family: monospace; }
    .section-title { background: #f1f5f9; border-left: 4px solid #0066cc; padding: 8px 14px; font-size: 14px; font-weight: bold; margin: 24px 0 10px; color: #0f172a; border-radius: 0 6px 6px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; font-size: 12px; }
    th { background: #f8fafc; font-weight: 600; width: 35%; color: #334155; }
    .badge { display: inline-block; padding: 2px 6px; font-size: 10px; font-family: monospace; background: #e0f2fe; color: #0369a1; border-radius: 4px; margin-right: 4px; margin-top: 4px; }
    .footer { margin-top: 40px; border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 11px; color: #64748b; text-align: center; }
  </style></head><body>`;

  html += `<div class="header">`;
  html += `<h1>🛡️ Painel de Dados — Dossiê Investigativo 360°</h1>`;
  html += `<p>Termo de Consulta: <strong>${query}</strong> | Emissão: ${new Date().toLocaleString('pt-BR')} | Total de Campos Validados: ${fields.length}</p>`;
  html += `</div>`;

  const sectionTitles = {
    highlights: '🌟 Destaques & Inteligência Cruzada',
    identification: '🏢 Identificação & Cadastro Oficial',
    banking: '🏦 Bancos & Inteligência Financeira',
    location: '📍 Localização, Demografia & Clima',
    legal: '⚖️ Jurídico, Diários Oficiais & Processos',
    digital: '🌐 Presença Digital & Contatos',
    vault: '📂 Registros no Data Vault Local',
  };

  for (const [secKey, secFields] of Object.entries(sections)) {
    if (!secFields || secFields.length === 0) continue;
    html += `<div class="section-title">${sectionTitles[secKey] || secKey}</div>`;
    html += `<table>`;
    for (const f of secFields) {
      const sourcesHtml = (f.sources || []).map(s => `<span class="badge">${SOURCE_LABELS[s] || s}</span>`).join('');
      html += `<tr><th>${formatLabel(f.key)}</th><td>${String(f.value)} <div>${sourcesHtml}</div></td></tr>`;
    }
    html += `</table>`;
  }

  html += `<div class="footer">Documento emitido pelo Painel de Dados v3.5.0. Dados protegidos e para fins de auditoria investigativa.</div>`;
  html += `<script>window.onload = function() { window.print(); };</script></body></html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}

// ---------------------------------------------------------------------------
// Componentes Auxiliares do Dashboard
// ---------------------------------------------------------------------------

function ApiBadgeCard({ api, isActive }) {
  return (
    <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/10 bg-surface/40">
      <div className="min-w-0 pr-2">
        <p className="text-xs font-semibold text-ink truncate">{api.name}</p>
        <p className="text-[10px] text-ink-dim truncate mt-0.5">{api.supports?.join(', ')}</p>
      </div>
      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 border ${
        isActive
          ? 'bg-success/20 text-success border-success/30'
          : 'bg-white/5 text-ink-faint border-white/10'
      }`}>
        {isActive ? '✓ Ativa' : 'Desativada'}
      </span>
    </div>
  );
}

function SidebarApiBadges({ catalogApis, enabledApis }) {
  return (
    <section className="dashboard-panel glass-panel rounded-2xl p-4 flex flex-col gap-2.5 mt-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-mono uppercase tracking-wider text-ink-dim font-bold">Fontes Ativas</p>
        <span className="text-[10px] font-mono text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
          {enabledApis.length} / {catalogApis.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1 no-scrollbar">
        {catalogApis.map((api) => {
          const active = enabledApis.includes(api.id);
          return (
            <div
              key={api.id}
              className={`p-2 rounded-lg border text-[11px] flex items-center justify-between gap-1 transition-all ${
                active
                  ? 'border-white/10 bg-surface/60 text-ink'
                  : 'border-transparent bg-white/5 text-ink-faint opacity-50'
              }`}
            >
              <span className="truncate">{api.name.split('(')[0].trim()}</span>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-success shadow-glow' : 'bg-white/20'}`} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ResultsStagePlaceholder() {
  return (
    <div className="relative z-10 flex flex-col items-center justify-center gap-4 text-center px-6 py-12">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shadow-glow">
        <IconSearch className="w-8 h-8 opacity-80" />
      </div>
      <div>
        <p className="font-display text-lg font-semibold text-ink">Central de Inteligência 360°</p>
        <p className="text-xs text-ink-dim max-w-sm mt-1 leading-relaxed">
          Digite um CPF, CNPJ, Nome, Telefone, E-mail, CEP, Placa ou Banco para cruzar bases oficiais em tempo real.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResultsPanel (com Barra de Automações, Abas de Seções e Cópia Rápida)
// ---------------------------------------------------------------------------

function ResultsPanel({ results, query }) {
  const [activeSection, setActiveSection] = useState('all');
  const [copiedFieldId, setCopiedFieldId] = useState(null);
  const [dossierToast, setDossierToast] = useState('');

  if (!results) return null;

  const fields = results.fields || [];
  const sections = results.sections || {};
  const queryType = (results.query_types || []).join(', ') || 'geral';
  const sources = results.sources_used || results.sources || [];

  if (fields.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-ink-dim">
        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-ink-faint mb-3">
          <IconAlert className="w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-ink">Nenhum dado encontrado</p>
        <p className="text-xs text-ink-faint mt-1 max-w-sm">
          As fontes de dados consultadas não retornaram registros para este termo. Verifique o formato digitado.
        </p>
      </div>
    );
  }

  // Filtragem por aba de seção
  const displayedFields = activeSection === 'all'
    ? fields
    : (sections[activeSection] || []);

  const sectionTabs = [
    { id: 'all', label: '🌟 Todos', count: fields.length },
    { id: 'highlights', label: '⚡ Destaques', count: sections.highlights?.length || 0 },
    { id: 'identification', label: '🏢 Cadastro', count: sections.identification?.length || 0 },
    { id: 'banking', label: '🏦 Bancos & PIX', count: sections.banking?.length || 0 },
    { id: 'location', label: '📍 Localização', count: sections.location?.length || 0 },
    { id: 'legal', label: '⚖️ Jurídico', count: sections.legal?.length || 0 },
    { id: 'digital', label: '🌐 Digital', count: sections.digital?.length || 0 },
    { id: 'vault', label: '📂 Base Local', count: sections.vault?.length || 0 },
  ].filter(tab => tab.id === 'all' || tab.count > 0);

  const handleCopyField = (field, idx) => {
    const textToCopy = String(field.value);
    navigator.clipboard?.writeText(textToCopy);
    setCopiedFieldId(idx);
    setTimeout(() => setCopiedFieldId(null), 1800);
  };

  const handleCopyFullDossier = () => {
    const fullText = generateFormattedDossierText(query || results.query, results);
    navigator.clipboard?.writeText(fullText);
    setDossierToast('📋 Dossiê copiado com sucesso! Pronto para colar.');
    setTimeout(() => setDossierToast(''), 3000);
  };

  return (
    <div className="h-full flex flex-col min-h-0 flex-1 relative">
      {/* Toast Notificação de Automação */}
      {dossierToast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold shadow-glow flex items-center gap-2 animate-bounce">
          <span>{dossierToast}</span>
        </div>
      )}

      {/* Header Fixo dos Resultados */}
      <div className="px-4 sm:px-5 py-3 border-b border-white/10 flex items-center justify-between flex-wrap gap-2 shrink-0 bg-surface/60">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success shadow-glow animate-pulse" />
          <span className="text-xs font-mono uppercase tracking-wider text-ink font-bold">
            Dossiê Investigativo 360°
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-ink-dim">
            tipo: {queryType}
          </span>
        </div>

        {/* ── BARRA DE AUTOMAÇÕES (1-CLIQUE) ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleCopyFullDossier}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 transition-all shadow-sm active:scale-95"
            title="Copiar dossiê completo formatado para WhatsApp ou Bloco de Notas"
          >
            📋 Copiar Dossiê (WhatsApp)
          </button>
          <button
            type="button"
            onClick={() => printDossierReport(query || results.query, results)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-400/40 bg-emerald-400/15 text-emerald-400 text-xs font-semibold hover:bg-emerald-400/25 transition-all shadow-sm active:scale-95"
            title="Gerar relatório formal timbrado em PDF para impressão ou download"
          >
            📥 Gerar PDF
          </button>
          <span className="text-[11px] font-mono text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
            {sources.length} {sources.length === 1 ? 'fonte' : 'fontes'}
          </span>
          <span className="text-[11px] font-mono text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded">
            {fields.length} campos
          </span>
        </div>
      </div>

      {/* Abas de Navegação por Seção de Inteligência */}
      <div className="px-4 sm:px-5 py-2 border-b border-white/10 flex gap-1.5 overflow-x-auto shrink-0 bg-surface/30 no-scrollbar">
        {sectionTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSection(tab.id)}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
              activeSection === tab.id
                ? 'bg-primary/20 text-primary border border-primary/30 font-semibold shadow-inner'
                : 'text-ink-dim hover:text-ink hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>{tab.label}</span>
            <span className="text-[9px] font-mono opacity-80 px-1.5 py-0.2 rounded-full bg-white/10">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Grid com Rolagem e Cards Consolidados */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 pr-2 max-h-[calc(75vh-90px)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pb-20 sm:pb-6">
          {displayedFields.map((f, i) => {
            const isWide = String(f.value).length > 35 || String(f.value).startsWith('http') || f.key === 'coordenadas_gps';
            const isCopied = copiedFieldId === i;
            return (
              <div
                key={i}
                className={`p-4 rounded-xl border border-white/10 bg-surface/60 hover:border-primary/40 transition-all shadow-sm group relative ${
                  isWide ? 'sm:col-span-2' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-mono uppercase text-ink-dim font-bold tracking-wide">
                    {formatLabel(f.key)}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Selos de todas as fontes que confirmaram a informação */}
                    {(f.sources || []).map((src) => (
                      <span
                        key={src}
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                          SOURCE_COLORS[src] || 'badge--blue'
                        }`}
                      >
                        {SOURCE_LABELS[src] || src}
                      </span>
                    ))}
                    {/* Botão de Cópia Rápida Individual */}
                    <button
                      type="button"
                      onClick={() => handleCopyField(f, i)}
                      className="text-ink-dim hover:text-primary transition-all p-1 rounded-md hover:bg-white/5"
                      title="Copiar este valor"
                    >
                      {isCopied ? (
                        <span className="text-[10px] text-success font-mono font-bold">✓ Copiado!</span>
                      ) : (
                        <span className="text-xs opacity-70 group-hover:opacity-100">📋</span>
                      )}
                    </button>
                  </div>
                </div>
                <div className="text-sm text-ink font-medium break-words leading-relaxed">
                  {renderValue(f.value, f.key)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App Principal
// ---------------------------------------------------------------------------

function App() {
  const [authMode, setAuthMode] = useState('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showWarmUp, setShowWarmUp] = useState(false);

  // Sessão persistente de 8 horas
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [remainingSessionText, setRemainingSessionText] = useState('');

  // Dashboard & Buscas
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  // Histórico de Buscas
  const [userHistory, setUserHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Configurações & Abas
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('perfil');
  const [settingsName, setSettingsName] = useState('');
  const [nicknameStyle, setNicknameStyle] = useState('default');
  const [settingsNicknameStyle, setSettingsNicknameStyle] = useState('default');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [enabledApis, setEnabledApis] = useState(DEFAULT_APIS.map((api) => api.id));
  const [catalogApis, setCatalogApis] = useState(DEFAULT_APIS);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);

  // Monitoramento de Conexão & Ping
  const [systemOnline, setSystemOnline] = useState(null);
  const [serverPing, setServerPing] = useState(null);
  const [isPinging, setIsPinging] = useState(false);

  // Tickets
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketCategory, setTicketCategory] = useState('bug');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketSending, setTicketSending] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // Meus Tickets (Chat no painel de configurações)
  const [userTickets, setUserTickets] = useState([]);
  const [selectedUserTicket, setSelectedUserTicket] = useState(null);
  const [userReplyText, setUserReplyText] = useState('');
  const [sendingUserReply, setSendingUserReply] = useState(false);

  const dashboardRef = useRef(null);
  const cardRef = useRef(null);
  const greetingRef = useRef(null);
  const warmUpTimerRef = useRef(null);

  // 1. Restaurar Sessão Automática de 8 Horas
  useEffect(() => {
    const saved = getStoredSession();
    if (saved) {
      setUserId(saved.user);
      setUserName(saved.display_name || 'Usuário');
      setUserEmail(saved.email || '');
      setSettingsName(saved.display_name || '');
      setNicknameStyle(saved.nickname_style || 'default');
      setSettingsNicknameStyle(saved.nickname_style || 'default');
      setIsAdmin(Boolean(saved.is_admin));
      setAuthToken(saved.id_token || '');
      if (Array.isArray(saved.enabled_apis) && saved.enabled_apis.length) {
        setEnabledApis(saved.enabled_apis);
      }
      setSessionExpiresAt(saved.expiresAt);
      setSystemOnline(true);
      setIsLogged(true);
    }
  }, []);

  // 2. Atualizar Contador Regressivo da Sessão
  useEffect(() => {
    if (!sessionExpiresAt || !isLogged) return;
    const updateCountdown = () => {
      setRemainingSessionText(formatRemainingTime(sessionExpiresAt));
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 30000);
    return () => clearInterval(interval);
  }, [sessionExpiresAt, isLogged]);

  // 3. Animações de Entrada (Completamente seguras para Android WebView)
  const animateDashboardEntry = useCallback(() => {
    try {
      if (dashboardRef.current) {
        gsap.fromTo(
          dashboardRef.current,
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', clearProps: 'all' }
        );
      }
      gsap.fromTo(
        '.dashboard-stagger',
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.06, ease: 'power2.out', delay: 0.05, clearProps: 'all' }
      );
      if (greetingRef.current) {
        gsap.fromTo(
          greetingRef.current,
          { opacity: 0, x: -8 },
          { opacity: 1, x: 0, duration: 0.45, ease: 'power2.out', delay: 0.1, clearProps: 'all' }
        );
      }
    } catch {
      if (dashboardRef.current) {
        dashboardRef.current.style.opacity = '1';
        dashboardRef.current.style.transform = 'none';
      }
    }
  }, []);

  useEffect(() => {
    if (isLogged && !isTransitioning) {
      animateDashboardEntry();
    } else if (!isLogged && !isTransitioning) {
      try {
        gsap.fromTo(
          cardRef.current,
          { opacity: 0, y: 20, scale: 0.98 },
          { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power2.out', clearProps: 'all' }
        );
      } catch {}
    }
  }, [isLogged, isTransitioning, animateDashboardEntry]);

  // 4. Checagem de Conexão e Ping Real
  const checkHealth = useCallback(async () => {
    setIsPinging(true);
    const start = performance.now();
    try {
      await axios.get(`${API}/health?_t=${Date.now()}`, { timeout: 20000 });
      const ping = Math.round(performance.now() - start);
      setServerPing(ping);
      if (ping > 1500) {
        setSystemOnline('slow');
      } else {
        setSystemOnline(true);
      }
    } catch {
      setServerPing(null);
      setSystemOnline(false);
    } finally {
      setIsPinging(false);
    }
  }, []);

  useEffect(() => {
    if (!isLogged) return;
    axios
      .get(`${API}/apis?_t=${Date.now()}`, { timeout: 30000 })
      .then((response) => {
        if (Array.isArray(response.data?.apis) && response.data.apis.length) {
          setCatalogApis(response.data.apis);
        }
        setSystemOnline(true);
      })
      .catch(() => {});

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, [isLogged, checkHealth]);

  // Keep-alive
  useEffect(() => {
    if (isLogged) {
      startKeepAlive();
    } else {
      stopKeepAlive();
    }
    return () => stopKeepAlive();
  }, [isLogged]);

  // Carregar Histórico do Usuário
  const loadUserHistory = useCallback(async () => {
    if (!userId) return;
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${API}/user/${userId}/history?_t=${Date.now()}`);
      setUserHistory(res.data?.history || []);
    } catch {
      setUserHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [userId]);

  // Carregar Tickets do Usuário
  const loadUserTickets = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await axios.get(`${API}/user/${userId}/tickets?_t=${Date.now()}`);
      const list = res.data?.tickets || [];
      setUserTickets(list);
      if (selectedUserTicket) {
        const fresh = list.find((t) => t.id === selectedUserTicket.id);
        if (fresh) setSelectedUserTicket(fresh);
      }
    } catch {
      setUserTickets([]);
    }
  }, [userId, selectedUserTicket]);

  useEffect(() => {
    if (isLogged && userId) {
      loadUserHistory();
      loadUserTickets();
    }
  }, [isLogged, userId, loadUserHistory, loadUserTickets]);

  // 5. Finalização de Login & Gravação da Sessão de 8 Horas
  const completeLogin = (data) => {
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    const sessionData = {
      ...data,
      expiresAt,
    };

    saveSession(sessionData);

    setUserId(data.user);
    setUserName(data.display_name || 'Usuário');
    setUserEmail(data.email || email);
    setSettingsName(data.display_name || '');
    setNicknameStyle(data.nickname_style || 'default');
    setSettingsNicknameStyle(data.nickname_style || 'default');
    setIsAdmin(Boolean(data.is_admin));
    setAuthToken(data.id_token || '');
    if (Array.isArray(data.enabled_apis)) {
      setEnabledApis(data.enabled_apis);
    }
    setSessionExpiresAt(expiresAt);
    setSystemOnline(true);
    setShowWarmUp(false);
    setIsLogged(true);
    setIsTransitioning(false);

    axios
      .post(`${API}/log`, { user_id: data.user, action: 'login' })
      .catch(() => {});
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);
    setShowWarmUp(false);

    warmUpTimerRef.current = setTimeout(() => {
      setShowWarmUp(true);
    }, 3000);

    try {
      const response = await axios.post(`${API}/login`, { email, password }, { timeout: 90000 });
      clearTimeout(warmUpTimerRef.current);
      completeLogin(response.data);
    } catch (error) {
      clearTimeout(warmUpTimerRef.current);
      setShowWarmUp(false);
      setLoginError(describeLoginError(error));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);
    setShowWarmUp(false);

    warmUpTimerRef.current = setTimeout(() => {
      setShowWarmUp(true);
    }, 3000);

    try {
      const response = await axios.post(`${API}/register`, {
        email,
        password,
        display_name: displayName.trim() || 'Usuário',
      });
      clearTimeout(warmUpTimerRef.current);
      completeLogin(response.data);
    } catch (error) {
      clearTimeout(warmUpTimerRef.current);
      setShowWarmUp(false);
      setLoginError(describeLoginError(error));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    setIsLogged(false);
    setIsTransitioning(false);
    setEmail('');
    setPassword('');
    setDisplayName('');
    setResults(null);
    setSearchQuery('');
    setSearchError('');
    setUserId(null);
    setUserName('');
    setUserEmail('');
    setShowSettings(false);
    setSettingsName('');
    setNicknameStyle('default');
    setSettingsNicknameStyle('default');
    setSettingsMessage('');
    setSettingsError('');
    setIsAdmin(false);
    setAuthToken('');
    setShowAdmin(false);
    setAuthMode('login');
    setShowWarmUp(false);
    setSessionExpiresAt(null);
  };

  const openSettings = () => {
    setSettingsName(userName);
    setSettingsNicknameStyle(nicknameStyle);
    setSettingsMessage('');
    setSettingsError('');
    setSettingsTab('perfil');
    setShowSettings(true);
    loadUserTickets();
    loadUserHistory();
  };

  const handleSaveSettings = async (e) => {
    e?.preventDefault?.();
    setSettingsSaving(true);
    setSettingsMessage('');
    setSettingsError('');
    try {
      const response = await axios.patch(`${API}/profile`, {
        user_id: userId,
        display_name: settingsName.trim(),
        nickname_style: settingsNicknameStyle,
        email: userEmail,
      });
      const newName = response.data.display_name || settingsName.trim();
      const newStyle = response.data.nickname_style || settingsNicknameStyle;
      setUserName(newName);
      setNicknameStyle(newStyle);
      setSettingsMessage('Apelido e personalização salvos com sucesso!');

      // Atualizar no localStorage imediatamente
      const stored = getStoredSession();
      if (stored) {
        saveSession({ ...stored, display_name: newName, nickname_style: newStyle });
      }

      gsap.fromTo('.settings-success', { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35 });
    } catch (error) {
      setSettingsError(describeLoginError(error));
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSearch = async (overrideQuery = null) => {
    const q = (overrideQuery || searchQuery).trim();
    if (!q) return;
    if (overrideQuery) setSearchQuery(overrideQuery);

    setSearchError('');
    setResults(null);
    setIsSearching(true);
    const searchStart = performance.now();
    try {
      const response = await axios.get(`${API}/search`, {
        params: { q, user_id: userId },
      });
      const searchLatency = Math.round(performance.now() - searchStart);
      setServerPing(searchLatency);
      setSystemOnline(true);
      setResults(response.data);
      loadUserHistory();
    } catch (error) {
      setSearchError(describeSearchError(error));
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendUserTicketReply = async (e) => {
    e.preventDefault();
    if (!selectedUserTicket || !userReplyText.trim()) return;
    setSendingUserReply(true);
    try {
      const res = await axios.post(`${API}/tickets/${selectedUserTicket.id}/reply`, {
        user_id: userId,
        sender_name: userName || 'Usuário',
        message: userReplyText.trim(),
      });
      const updated = res.data.ticket;
      setUserTickets((list) => list.map((t) => (t.id === selectedUserTicket.id ? updated : t)));
      setSelectedUserTicket(updated);
      setUserReplyText('');
    } catch {
      alert('Não foi possível enviar a resposta.');
    } finally {
      setSendingUserReply(false);
    }
  };

  const settingsTabs = [
    { id: 'perfil', label: '👤 Perfil', desc: 'Apelido e nome exibido' },
    { id: 'personalizacao', label: '🎨 Personalização', desc: 'Efeito RGB e temas do apelido' },
    { id: 'conta', label: '⏱️ Sessão & Conta', desc: 'Tempo restante e dados' },
    { id: 'apis', label: '⚡ Minhas APIs', desc: 'Fontes habilitadas' },
    { id: 'tickets', label: '📨 Meus Tickets', desc: 'Conversas de suporte', badge: userTickets.length },
    { id: 'historico', label: '🔍 Histórico', desc: 'Suas buscas anteriores' },
  ];

  // -------------------------------------------------------------------------
  // RENDER: Tela de Login / Cadastro
  // -------------------------------------------------------------------------

  if (!isLogged) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-between px-4 py-6 pt-[max(1.5rem,calc(env(safe-area-inset-top,0px)+1.25rem))] pb-[max(1.5rem,calc(env(safe-area-inset-bottom,0px)+1rem))] overflow-y-auto">
        <div className="app-backdrop" aria-hidden />

        <div className="w-full max-w-md my-auto pt-4 pb-6">
          <div ref={cardRef} className="glass-panel rounded-3xl p-6 sm:p-8 relative border border-white/10 shadow-glow">
            {/* Header Brand */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shadow-glow">
                <IconShield className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold text-ink">Painel de Dados</h1>
                <p className="text-xs text-ink-dim">Inteligência de busca avançada</p>
              </div>
            </div>

            {/* Auth Mode Toggle */}
            <div className="flex rounded-xl bg-surface/60 p-1 mb-6 border border-white/5">
              <button
                type="button"
                onClick={() => { setAuthMode('login'); setLoginError(''); }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  authMode === 'login' ? 'bg-primary/20 text-primary shadow-inner' : 'text-ink-dim hover:text-ink'
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('register'); setLoginError(''); }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  authMode === 'register' ? 'bg-primary/20 text-primary shadow-inner' : 'text-ink-dim hover:text-ink'
                }`}
              >
                Criar Conta
              </button>
            </div>

            {/* Form */}
            <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-ink-dim mb-1.5 block">Seu Nome</label>
                  <div className="field-focus-ring flex items-center gap-3 rounded-xl border border-white/10 bg-surface/70 px-4 py-3">
                    <IconUser className="w-4 h-4 text-ink-dim shrink-0" />
                    <input
                      type="text"
                      placeholder="Ex: João Silva"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-ink-dim mb-1.5 block">E-mail</label>
                <div className="field-focus-ring flex items-center gap-3 rounded-xl border border-white/10 bg-surface/70 px-4 py-3">
                  <IconMail className="w-4 h-4 text-ink-dim shrink-0" />
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-ink-dim mb-1.5 block">Senha</label>
                <div className="field-focus-ring flex items-center gap-3 rounded-xl border border-white/10 bg-surface/70 px-4 py-3">
                  <IconLock className="w-4 h-4 text-ink-dim shrink-0" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Sua senha secreta"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-ink-dim hover:text-ink"
                  >
                    {showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="error-banner flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-xs text-danger">
                  <IconAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              {showWarmUp && isLoggingIn && (
                <div className="flex items-center gap-2 text-xs text-amber bg-amber/10 border border-amber/20 rounded-xl p-3">
                  <span className="spinner w-3.5 h-3.5 border-amber" />
                  <span>Acordando servidor na nuvem… Isso pode levar alguns instantes.</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="btn-primary w-full flex items-center justify-center gap-2 text-white font-semibold text-sm rounded-xl py-3 mt-2"
              >
                {isLoggingIn ? <span className="spinner" /> : (authMode === 'login' ? 'Entrar no Sistema' : 'Cadastrar e Entrar')}
              </button>
            </form>
          </div>
        </div>

        {/* Rodapé de Versão no Login */}
        <footer className="w-full text-center py-4 text-[11px] font-mono text-ink-faint">
          Painel {APP_VERSION} · Atualizado em {APP_BUILD_TIME}
        </footer>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Dashboard Admin
  // -------------------------------------------------------------------------

  if (showAdmin && isAdmin) {
    return (
      <div className="relative min-h-screen flex flex-col justify-between py-6 overflow-y-auto">
        <div className="app-backdrop" aria-hidden />
        <AdminDashboard
          token={authToken}
          catalogApis={catalogApis}
          onBack={() => setShowAdmin(false)}
        />
        <footer className="w-full text-center py-4 text-[11px] font-mono text-ink-faint">
          Painel {APP_VERSION} · Atualizado em {APP_BUILD_TIME}
        </footer>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Dashboard Principal
  // -------------------------------------------------------------------------

  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-y-auto">
      <div className="app-backdrop" aria-hidden />

      <div ref={dashboardRef} className="dashboard-shell relative z-10 w-full px-4 sm:px-8 lg:px-12 pt-[max(1.25rem,calc(env(safe-area-inset-top,0px)+1rem))] pb-6">
        {/* Topbar Greeting & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative">
          <div ref={greetingRef} className="flex items-center gap-3.5">
            {/* Ícone de Escudo de Segurança Premium */}
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shadow-glow shrink-0">
              <IconShield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-2xl font-bold text-ink">
                  Olá, <span className={`nickname--${nicknameStyle}`}>{userName || 'Usuário'}</span>
                </h2>
                {isAdmin && (
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber/20 text-amber border border-amber/30">
                    Admin
                  </span>
                )}
              </div>

              {/* Status de Conexão e Ping */}
              <div className="flex items-center gap-2 text-xs mt-1">
                {systemOnline === true && (
                  <span className="flex items-center gap-1.5 text-success font-medium">
                    <span className="w-2 h-2 rounded-full bg-success shadow-glow animate-pulse" />
                    🟢 Online e pronto para uso
                    {serverPing !== null && (
                      <span className="ping-badge ping-badge--fast text-[10px] font-mono px-2 py-0.5 rounded-full border border-success/30 bg-success/15">
                        ⚡ {serverPing}ms
                      </span>
                    )}
                  </span>
                )}

                {systemOnline === 'slow' && (
                  <span className="flex items-center gap-1.5 text-amber font-medium">
                    <span className="w-2 h-2 rounded-full bg-amber animate-pulse" />
                    🟡 Conexão lenta com servidor
                    {serverPing !== null && (
                      <span className="ping-badge ping-badge--slow text-[10px] font-mono px-2 py-0.5 rounded-full border border-amber/30 bg-amber/15">
                        ⚡ {serverPing}ms
                      </span>
                    )}
                  </span>
                )}

                {systemOnline === false && (
                  <span className="flex items-center gap-1.5 text-danger font-medium">
                    <span className="w-2 h-2 rounded-full bg-danger animate-blink" />
                    🔴 Conectando ao servidor…
                    <button
                      type="button"
                      onClick={checkHealth}
                      disabled={isPinging}
                      className="text-[10px] font-mono underline ml-1 text-ink-dim hover:text-ink"
                    >
                      {isPinging ? 'testando…' : 'retestar'}
                    </button>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAdmin(true)}
                className="flex items-center gap-1.5 text-xs text-amber hover:text-ink border border-amber/30 hover:border-amber/50 rounded-xl px-3.5 py-2 transition-colors bg-amber/5"
              >
                <IconGrid className="w-4 h-4" />
                <span>Admin</span>
              </button>
            )}
            <button
              type="button"
              onClick={openSettings}
              className={`flex items-center gap-1.5 text-xs border rounded-xl px-3.5 py-2 transition-colors ${
                showSettings ? 'text-primary border-primary/40 bg-primary/10' : 'text-ink-dim hover:text-ink border-white/10'
              }`}
            >
              <IconSettings className="w-4 h-4" />
              <span>Configurações</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-ink-dim hover:text-danger border border-white/10 rounded-xl px-3.5 py-2 transition-colors hover:border-danger/30"
            >
              <IconLogout className="w-4 h-4" />
              <span>Sair</span>
            </button>
          </div>
        </div>

        {/* Modal/Painel de Configurações */}
        {showSettings && (
          <section className="dashboard-stagger glass-panel rounded-2xl mb-8 w-full border border-primary/20 shadow-glow overflow-hidden animate-fade-in">
            <div className="flex flex-col lg:flex-row min-h-[340px]">
              <aside className="lg:w-60 shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 p-4 bg-surface/40">
                <p className="text-[10px] font-mono uppercase tracking-widest text-ink-faint mb-3 px-2">Menu de Ajustes</p>
                {settingsTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setSettingsTab(tab.id); setSettingsError(''); setSettingsMessage(''); }}
                    className={`w-full text-left rounded-xl px-3 py-2.5 mb-1 transition-all flex items-center justify-between ${
                      settingsTab === tab.id
                        ? 'bg-primary/20 text-primary border border-primary/30 shadow-inner'
                        : 'text-ink-dim hover:text-ink hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div>
                      <span className="block text-xs font-semibold">{tab.label}</span>
                      <span className="block text-[10px] opacity-70 mt-0.5">{tab.desc}</span>
                    </div>
                    {tab.badge != null && tab.badge > 0 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                ))}
              </aside>

              <div className="flex-1 p-5 sm:p-6 lg:p-7">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-display text-lg font-bold text-ink">
                    {settingsTab === 'perfil' && 'Perfil e Apelido'}
                    {settingsTab === 'personalizacao' && 'Personalização & Efeitos Visuais'}
                    {settingsTab === 'conta' && 'Sessão e Dados da Conta'}
                    {settingsTab === 'apis' && 'Minhas Fontes de Dados'}
                    {settingsTab === 'tickets' && 'Meus Tickets de Suporte'}
                    {settingsTab === 'historico' && 'Histórico de Consultas'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="text-xs text-ink-dim hover:text-ink border border-white/10 rounded-lg px-3 py-1.5"
                  >
                    ✕ Fechar
                  </button>
                </div>

                {/* Aba 1: Perfil */}
                {settingsTab === 'perfil' && (
                  <form onSubmit={handleSaveSettings} className="space-y-4 max-w-md">
                    <div>
                      <label className="text-xs font-mono uppercase tracking-wider text-ink-dim mb-1.5 block">Nome / Apelido</label>
                      <div className="field-focus-ring flex items-center gap-3 rounded-xl border border-white/10 bg-surface/70 px-4 py-3">
                        <IconUser className="w-4 h-4 text-ink-dim shrink-0" />
                        <input
                          type="text"
                          placeholder="Ex: RafzZ, Gabriel, Rafael…"
                          className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none"
                          value={settingsName}
                          onChange={(e) => setSettingsName(e.target.value)}
                          required
                          minLength={2}
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-surface/40 p-4">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-ink-faint mb-1">Pré-visualização</p>
                      <p className="font-display text-xl font-bold text-ink">
                        Olá, <span className={`nickname--${settingsNicknameStyle}`}>{settingsName.trim() || '…'}</span>
                      </p>
                    </div>

                    {settingsError && (
                      <div className="error-banner rounded-xl border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
                        {settingsError}
                      </div>
                    )}

                    {settingsMessage && (
                      <div className="settings-success flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-xs text-success">
                        <IconCheck className="w-4 h-4 shrink-0" />
                        <span>{settingsMessage}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={settingsSaving || settingsName.trim().length < 2}
                      className="btn-primary flex items-center justify-center gap-2 text-white font-semibold text-xs rounded-xl px-5 py-2.5"
                    >
                      {settingsSaving ? <span className="spinner" /> : <IconCheck className="w-4 h-4" />}
                      Salvar Apelido
                    </button>
                  </form>
                )}

                {/* Aba 1.5: Personalização (RGB, Dourado, Cyberpunk, Rubi, Matrix, Ciano Padrão) */}
                {settingsTab === 'personalizacao' && (
                  <div className="space-y-5 max-w-lg">
                    {/* Live Preview Box */}
                    <div className="rounded-2xl border border-white/15 bg-surface/60 p-5 text-center relative overflow-hidden shadow-glow">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-ink-faint mb-1.5">Visualização em Tempo Real</p>
                      <p className="font-display text-2xl sm:text-3xl font-bold text-ink py-1">
                        Olá, <span className={`nickname--${settingsNicknameStyle}`}>{settingsName.trim() || userName || 'RafzZ'}</span>
                      </p>
                      <p className="text-xs text-ink-dim mt-1">
                        Estilo selecionado: <strong className="text-ink">{
                          {
                            default: '💎 Ciano Neon (Padrão Oficial)',
                            rgb: '🌈 RGB Gamer Animado (Cromático)',
                            gold: '👑 Dourado Imperial (VIP)',
                            cyberpunk: '🔮 Cyberpunk Magenta (Neon)',
                            ruby: '🔥 Rubi Carmesim (Fogo)',
                            matrix: '🌿 Matrix Hacker (Esmeralda)',
                          }[settingsNicknameStyle] || 'Padrão'
                        }</strong>
                      </p>
                    </div>

                    {/* Grid de Seleção de Estilos */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        {
                          id: 'default',
                          name: '💎 Ciano Neon',
                          desc: 'Identidade visual padrão limpa e futurista.',
                          sampleClass: 'nickname--default',
                          badge: 'Padrão',
                        },
                        {
                          id: 'rgb',
                          name: '🌈 RGB Gamer Animado',
                          desc: 'Gradiente contínuo com ciclo de cores e brilho RGB.',
                          sampleClass: 'nickname--rgb',
                          badge: 'Animado',
                        },
                        {
                          id: 'gold',
                          name: '👑 Dourado Imperial',
                          desc: 'Degradê dourado com brilho nobre.',
                          sampleClass: 'nickname--gold',
                          badge: 'VIP',
                        },
                        {
                          id: 'cyberpunk',
                          name: '🔮 Cyberpunk Magenta',
                          desc: 'Gradiente neon roxo, magenta e ciano.',
                          sampleClass: 'nickname--cyberpunk',
                          badge: 'Neon',
                        },
                        {
                          id: 'ruby',
                          name: '🔥 Rubi Carmesim',
                          desc: 'Tons vibrantes de rubi e fogo.',
                          sampleClass: 'nickname--ruby',
                          badge: 'Fogo',
                        },
                        {
                          id: 'matrix',
                          name: '🌿 Matrix Hacker',
                          desc: 'Verde esmeralda cibernético futurista.',
                          sampleClass: 'nickname--matrix',
                          badge: 'Hacker',
                        },
                      ].map((theme) => {
                        const isSelected = settingsNicknameStyle === theme.id;
                        return (
                          <div
                            key={theme.id}
                            onClick={() => setSettingsNicknameStyle(theme.id)}
                            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                              isSelected
                                ? 'border-primary bg-primary/15 shadow-glow ring-1 ring-primary/40'
                                : 'border-white/10 bg-surface/40 hover:bg-white/5 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`text-sm font-bold ${theme.sampleClass}`}>
                                {theme.name}
                              </span>
                              <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${
                                isSelected
                                  ? 'bg-primary/20 text-primary border-primary/40'
                                  : 'bg-white/5 text-ink-faint border-white/10'
                              }`}>
                                {isSelected ? '✓ Ativo' : theme.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-ink-dim leading-snug">
                              {theme.desc}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {settingsMessage && (
                      <div className="settings-success flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-xs text-success">
                        <IconCheck className="w-4 h-4 shrink-0" />
                        <span>{settingsMessage}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleSaveSettings}
                      disabled={settingsSaving}
                      className="btn-primary w-full flex items-center justify-center gap-2 text-white font-semibold text-xs rounded-xl py-3 shadow-glow"
                    >
                      {settingsSaving ? <span className="spinner" /> : <IconCheck className="w-4 h-4" />}
                      Salvar e Aplicar Tema
                    </button>
                  </div>
                )}

                {/* Aba 2: Conta & Sessão de 8 Horas */}
                {settingsTab === 'conta' && (
                  <div className="space-y-3 max-w-md">
                    <div className="rounded-xl border border-white/10 bg-surface/40 p-3.5">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-ink-faint mb-0.5">E-mail</p>
                      <p className="text-xs text-ink font-mono break-all">{userEmail || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-surface/40 p-3.5">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-ink-faint mb-0.5">ID da Conta</p>
                      <p className="text-xs text-ink-dim font-mono break-all">{userId || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-primary/30 bg-primary/10 p-3.5 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-wider text-primary mb-0.5">Sessão Ativa (8 Horas)</p>
                        <p className="text-xs text-ink font-medium flex items-center gap-1.5">
                          <IconClock className="w-3.5 h-3.5 text-primary" />
                          {remainingSessionText || '8h restantes'}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-success/20 text-success border border-success/30">
                        Persistente
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-faint pt-1">
                      Você não precisará fazer login novamente ao fechar e abrir o aplicativo durante esse período.
                    </p>
                  </div>
                )}

                {/* Aba 3: APIs */}
                {settingsTab === 'apis' && (
                  <div className="space-y-3 max-w-lg">
                    {catalogApis.map((api) => (
                      <ApiBadgeCard key={api.id} api={api} isActive={enabledApis.includes(api.id)} />
                    ))}
                  </div>
                )}

                {/* Aba 4: Meus Tickets (Chat Interativo) */}
                {settingsTab === 'tickets' && (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                    <div className="space-y-2 max-h-72 overflow-auto pr-1">
                      {userTickets.length === 0 ? (
                        <p className="text-xs text-ink-dim py-6 text-center">Você ainda não abriu tickets de suporte.</p>
                      ) : (
                        userTickets.map((t) => {
                          const isSel = selectedUserTicket?.id === t.id;
                          return (
                            <div
                              key={t.id}
                              onClick={() => setSelectedUserTicket(t)}
                              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                isSel ? 'border-primary/50 bg-primary/10' : 'border-white/10 bg-surface/50 hover:bg-white/5'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-xs font-semibold text-ink">Ticket #{t.id}</span>
                                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                                  t.status === 'respondido'
                                    ? 'bg-success/20 text-success border-success/30'
                                    : t.status === 'finalizado'
                                    ? 'bg-white/10 text-ink-faint border-white/10'
                                    : 'bg-amber/20 text-amber border-amber/30'
                                }`}>
                                  {t.status}
                                </span>
                              </div>
                              <p className="text-xs text-ink-dim line-clamp-2">{t.message}</p>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-surface/40 p-4 flex flex-col justify-between min-h-[240px]">
                      {!selectedUserTicket ? (
                        <div className="flex items-center justify-center flex-1 text-center py-8">
                          <p className="text-xs text-ink-dim">Selecione um ticket ao lado para ler as mensagens e responder.</p>
                        </div>
                      ) : (
                        <div className="flex flex-col h-full space-y-3">
                          <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                            <div>
                              <span className="text-xs font-semibold text-ink">Ticket #{selectedUserTicket.id}</span>
                              {selectedUserTicket.created_at && (
                                <span className="text-[10px] font-mono text-ink-faint ml-2">
                                  {formatBRDateTime(selectedUserTicket.created_at)}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-ink-faint">
                              Status: {selectedUserTicket.status}
                            </span>
                          </div>

                          <div className="flex-1 overflow-auto space-y-2 max-h-48 pr-1 text-xs">
                            <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                              <div className="flex items-center justify-between mb-0.5">
                                <p className="text-[10px] font-mono text-primary font-semibold">Você (Mensagem Inicial):</p>
                                {selectedUserTicket.created_at && (
                                  <span className="text-[9px] font-mono text-ink-faint">
                                    {formatBRDateTime(selectedUserTicket.created_at)}
                                  </span>
                                )}
                              </div>
                              <p className="text-ink mt-0.5">{selectedUserTicket.message}</p>
                            </div>

                            {(selectedUserTicket.responses || []).map((resp, i) => (
                              <div
                                key={i}
                                className={`p-2.5 rounded-lg border ${
                                  resp.sender_type === 'admin'
                                    ? 'bg-primary/15 border-primary/30 ml-3'
                                    : 'bg-white/5 border-white/10 mr-3'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-0.5">
                                  <p className="text-[10px] font-mono font-semibold text-primary">
                                    {resp.sender_type === 'admin' ? '🛡️ Resposta do Admin:' : 'Você:'}
                                  </p>
                                  {resp.timestamp && (
                                    <span className="text-[9px] font-mono text-ink-faint">
                                      {formatBRDateTime(resp.timestamp)}
                                    </span>
                                  )}
                                </div>
                                <p className="text-ink mt-0.5">{resp.message}</p>
                              </div>
                            ))}
                          </div>

                          {selectedUserTicket.status !== 'finalizado' ? (
                            <form onSubmit={handleSendUserTicketReply} className="pt-2 border-t border-white/10 flex gap-2">
                              <input
                                type="text"
                                placeholder="Digite sua resposta..."
                                value={userReplyText}
                                onChange={(e) => setUserReplyText(e.target.value)}
                                className="flex-1 bg-surface/80 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-ink outline-none"
                              />
                              <button
                                type="submit"
                                disabled={sendingUserReply || !userReplyText.trim()}
                                className="btn-primary text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                              >
                                {sendingUserReply ? '…' : 'Enviar'}
                              </button>
                            </form>
                          ) : (
                            <p className="text-[11px] text-center text-ink-faint pt-1">Este ticket foi finalizado pelo administrador.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Aba 5: Histórico de Consultas */}
                {settingsTab === 'historico' && (
                  <div className="space-y-3 max-h-80 overflow-auto pr-1">
                    {loadingHistory ? (
                      <p className="text-xs text-ink-dim py-6 text-center">Carregando histórico…</p>
                    ) : userHistory.length === 0 ? (
                      <p className="text-xs text-ink-dim py-6 text-center">Nenhuma busca registrada nesta conta.</p>
                    ) : (
                      userHistory.map((item) => {
                        const term = item.action?.replace('busca por ', '') || item.query || '';
                        return (
                          <div
                            key={item.id}
                            className="history-item-card flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-surface/50"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-ink truncate">{term}</p>
                              <p className="text-[10px] font-mono text-ink-faint mt-0.5">
                                {formatBRDateTime(item.timestamp)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setShowSettings(false);
                                handleSearch(term);
                              }}
                              className="text-[11px] font-semibold text-primary hover:text-white border border-primary/30 hover:bg-primary/30 rounded-lg px-2.5 py-1 transition-all shrink-0"
                            >
                              🔍 Repetir
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Rodapé interno das configurações */}
            <div className="border-t border-white/10 px-6 py-3 bg-surface/60 flex items-center justify-between text-[11px] font-mono text-ink-faint">
              <span>Painel de Dados {APP_VERSION}</span>
              <span>Atualizado em {APP_BUILD_TIME}</span>
            </div>
          </section>
        )}

        {/* Dashboard Workspace */}
        <div className="dashboard-workspace w-full">
          <aside className="dashboard-sidebar dashboard-stagger">
            <section className="dashboard-panel glass-panel rounded-2xl p-2 flex flex-col gap-2">
              <label className="field-focus-ring flex-1 flex items-center gap-3 rounded-xl border border-transparent bg-surface/60 px-4 py-3">
                <IconSearch className="w-[18px] h-[18px] text-ink-dim shrink-0" />
                <input
                  type="text"
                  placeholder="Nome, CPF, CNPJ, Telefone, E-mail…"
                  className="w-full bg-transparent text-ink placeholder:text-ink-faint text-xs sm:text-sm placeholder:truncate outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </label>
              <button
                onClick={() => handleSearch()}
                disabled={isSearching || !searchQuery.trim()}
                className="btn-primary flex items-center justify-center gap-2 text-white font-semibold text-sm rounded-xl px-6 py-3"
              >
                {isSearching ? <span className="spinner" /> : <IconSearch className="w-4 h-4" />}
                Pesquisar
              </button>
            </section>

            <div className="hidden lg:block">
              <SidebarApiBadges catalogApis={catalogApis} enabledApis={enabledApis} />
            </div>
          </aside>

          <section className="results-stage dashboard-stagger" aria-live="polite">
            <div className="results-stage-frame glass-panel rounded-2xl relative min-h-[340px] max-h-[75vh] flex flex-col overflow-hidden">
              <div className="results-stage-ambient" aria-hidden />

              {isSearching && (
                <div className="relative z-10 flex flex-col items-center justify-center gap-5 min-h-[340px] px-6 py-10">
                  <div className="search-pulse-ring" />
                  <p className="text-sm text-ink-dim font-mono animate-pulse">Consultando fontes de inteligência…</p>
                </div>
              )}

              {searchError && !isSearching && (
                <div className="relative z-10 flex flex-col items-center justify-center min-h-[340px] px-8 py-10">
                  <div className="error-banner flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-soft/80 backdrop-blur-sm px-5 py-4 text-sm text-danger max-w-md w-full">
                    <IconAlert className="w-5 h-5 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold mb-1 text-base">Busca não concluída</p>
                      <p className="text-danger/90 leading-relaxed">{searchError}</p>
                    </div>
                  </div>
                </div>
              )}

              {results && !isSearching && !searchError && (
                <div className="relative z-10 h-full flex-1 flex flex-col min-h-0">
                  <ResultsPanel results={results} query={searchQuery} />
                </div>
              )}

              {!results && !searchError && !isSearching && (
                <div className="relative z-10 h-full flex items-center justify-center">
                  <ResultsStagePlaceholder />
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── Botão flutuante de dúvidas ── */}
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="help-fab"
          title="Dúvidas e ajuda"
        >
          <IconHelp className="w-5 h-5" />
        </button>

        {/* ── Botão flutuante de ticket ── */}
        <button
          type="button"
          onClick={() => { setShowTicketModal(true); setTicketSuccess(''); }}
          className="ticket-fab"
          title="Enviar ticket"
        >
          <IconTicket className="w-5 h-5" />
        </button>

        {/* ── Modal de Ajuda ── */}
        <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />

        {/* ── Modal de Ticket com Animação Iluminada Glow ── */}
        {showTicketModal && (
          <div className="ticket-overlay" onClick={() => setShowTicketModal(false)}>
            <div className="ticket-modal glass-panel" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink">Enviar Ticket de Suporte</h3>
                  <p className="text-xs text-ink-dim mt-0.5">Reporte um erro, peça melhorias ou envie sugestões.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTicketModal(false)}
                  className="text-ink-dim hover:text-ink p-1 rounded-lg hover:bg-white/5"
                >
                  <IconClose className="w-5 h-5" />
                </button>
              </div>

              {ticketSuccess ? (
                <div className="ticket-success-wrap animate-fade-in py-6">
                  <div className="ticket-success-ring mb-4">
                    <IconCheck className="w-8 h-8" />
                  </div>
                  <h4 className="font-display text-base font-bold text-success mb-1">Ticket Enviado com Sucesso!</h4>
                  <p className="text-xs text-ink-dim max-w-xs leading-relaxed mb-4">
                    Você pode acompanhar e responder a resposta do administrador em:
                    <br />
                    <span className="text-primary font-semibold">Configurações &gt; Meus Tickets</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowTicketModal(false)}
                    className="btn-primary text-xs font-semibold px-5 py-2 rounded-xl text-white"
                  >
                    Entendido
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setTicketSending(true);
                    try {
                      await axios.post(`${API}/tickets`, {
                        user_id: userId,
                        user_email: userEmail,
                        user_name: userName,
                        category: ticketCategory,
                        message: ticketMessage.trim(),
                      });
                      setTicketSuccess('Ticket enviado com sucesso!');
                      setTicketMessage('');
                      setTicketCategory('bug');
                      loadUserTickets();
                    } catch (err) {
                      alert(err.response?.data?.detail || 'Erro ao enviar ticket.');
                    } finally {
                      setTicketSending(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="text-xs font-mono uppercase tracking-wider text-ink-dim mb-2 block">Categoria</label>
                    <div className="flex gap-2">
                      {[['bug', '🐛 Bug'], ['ideia', '💡 Ideia'], ['outro', '💬 Outro']].map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setTicketCategory(val)}
                          className={`ticket-cat-btn ${ticketCategory === val ? 'ticket-cat-btn--active' : ''}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-mono uppercase tracking-wider text-ink-dim mb-2 block">Mensagem</label>
                    <textarea
                      className="w-full bg-surface/70 border border-white/10 rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-faint outline-none resize-none field-focus-ring"
                      rows={4}
                      placeholder="Descreva detalhadamente sua dúvida, sugestão ou erro…"
                      value={ticketMessage}
                      onChange={(e) => setTicketMessage(e.target.value)}
                      required
                      maxLength={2000}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={ticketSending || !ticketMessage.trim()}
                    className="btn-primary w-full flex items-center justify-center gap-2 text-white font-semibold text-sm rounded-xl py-3"
                  >
                    {ticketSending ? <span className="spinner" /> : <IconTicket className="w-4 h-4" />}
                    Enviar Ticket
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rodapé de Versão no Dashboard */}
      <footer className="dashboard-footer w-full text-center py-4 pb-[max(2rem,env(safe-area-inset-bottom,2rem))] text-[11px] font-mono text-ink-faint relative z-10">
        Painel {APP_VERSION} · Atualizado em {APP_BUILD_TIME}
      </footer>
    </div>
  );
}

export default App;
