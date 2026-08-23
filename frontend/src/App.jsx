import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import gsap from 'gsap';
import { API, startKeepAlive, stopKeepAlive } from './api';
import HelpModal from './HelpModal';
import AdminDashboard from './AdminDashboard';
import './styles/index.css';

const APP_VERSION = 'v3.2.0';
const APP_BUILD_TIME = '23/08 às 19:30';
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

// ---------------------------------------------------------------------------
// Constants & Config
// ---------------------------------------------------------------------------

const DEFAULT_APIS = [
  { id: 'minhareceita', name: 'Minha Receita (CNPJ & Sócios)', supports: ['CNPJ', 'Sócios/QSA', 'CNAE', 'Capital'] },
  { id: 'receitaws', name: 'ReceitaWS', supports: ['CNPJ'] },
  { id: 'brasilapi', name: 'BrasilAPI', supports: ['CNPJ', 'CEP', 'DDD', 'Feriados'] },
  { id: 'nameint', name: 'Nome Intel (Pessoas & Diários)', supports: ['Nome', 'GitHub', 'Transparência', 'Jusbrasil', 'SUS', 'Discord'] },
  { id: 'phoneint', name: 'Telefone Intel', supports: ['Operadora', 'Portabilidade', 'ABR Telecom', 'WhatsApp', 'Telegram', 'Truecaller', 'SUS'] },
  { id: 'emailint', name: 'E-mail Intel', supports: ['Gravatar', 'GitHub', 'MX DNS', 'Anti-Spam'] },
  { id: 'cpfint', name: 'CPF Intel', supports: ['Validação', 'Região Fiscal', 'Receita Federal', 'ConecteSUS'] },
  { id: 'plateint', name: 'Placa Intel', supports: ['Mercosul', 'Denatran UF'] },
  { id: 'ipdomainint', name: 'IP/Domínio Intel', supports: ['Geolocalização', 'Registro.br RDAP', 'ISP'] },
  { id: 'crossintel', name: 'Dossiê Cruzado (Bancos, Sócios & Vazamentos)', supports: ['Bancos', 'PIX', 'Sócios', 'Vazamentos', 'Registrato'] },
];

const SOURCE_COLORS = {
  minhareceita: 'badge--cyan',
  receitaws: 'badge--blue',
  brasilapi: 'badge--green',
  nameint: 'badge--purple',
  phoneint: 'badge--cyan',
  emailint: 'badge--gold',
  cpfint: 'badge--green',
  plateint: 'badge--gold',
  ipdomainint: 'badge--purple',
  crossintel: 'badge--cyan',
};

const SOURCE_LABELS = {
  minhareceita: 'Minha Receita',
  receitaws: 'ReceitaWS',
  brasilapi: 'BrasilAPI',
  nameint: 'Nome Intel',
  phoneint: 'Telefone Intel',
  emailint: 'E-mail Intel',
  cpfint: 'CPF Intel',
  plateint: 'Placa Intel',
  ipdomainint: 'IP/Domínio Intel',
  crossintel: 'Dossiê Cruzado',
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
  return key
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderValue(value) {
  if (value === null || value === undefined) return '—';
  const str = String(value);

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

  // Links clicáveis com legendas explicativas completas
  if (str.startsWith('http://') || str.startsWith('https://')) {
    let linkLabel = 'Abrir link oficial ↗';
    let btnClass = 'text-primary border-primary/30 bg-primary/10 hover:bg-primary/20';
    let explanation = 'Link externo para consulta de registros públicos.';

    if (str.includes('conectesus')) {
      linkLabel = '🏥 ConecteSUS / Ministério da Saúde ↗';
      btnClass = 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/20';
      explanation = 'Requer login na conta gov.br para acessar o Cartão Nacional de Saúde (CNS), vacinas e histórico do SUS.';
    } else if (str.includes('receitafederal')) {
      linkLabel = '🏛️ Receita Federal (Comprovante CPF) ↗';
      btnClass = 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10 hover:bg-emerald-400/20';
      explanation = 'Consulta pública oficial da Receita Federal para verificar a situação cadastral e emitir o comprovante de inscrição do CPF.';
    } else if (str.includes('consultanumero.abrtelecom')) {
      linkLabel = '📞 ABR Telecom (Portabilidade Oficial) ↗';
      btnClass = 'text-amber border-amber/30 bg-amber/10 hover:bg-amber/20';
      explanation = 'Base oficial em tempo real da ABR Telecom para checar a operadora atualizada de linhas portadas (Claro, TIM, Vivo).';
    } else if (str.includes('registrato.bcb.gov.br')) {
      linkLabel = '🏛️ Banco Central (Registrato / Contas & PIX) ↗';
      btnClass = 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10 hover:bg-emerald-400/20';
      explanation = 'Sistema oficial do Banco Central do Brasil para emitir relatório de todas as contas bancárias e chaves PIX ativas no CPF (Requer gov.br).';
    } else if (str.includes('haveibeenpwned')) {
      linkLabel = '🛡️ HaveIBeenPwned (Checagem de Vazamentos) ↗';
      btnClass = 'text-rose-400 border-rose-400/30 bg-rose-400/10 hover:bg-rose-400/20';
      explanation = 'Verifica se o e-mail ou credenciais já foram expostos em grandes incidentes de segurança públicos conhecidos na internet.';
    } else if (str.includes('wa.me')) {
      linkLabel = '💬 Conversar no WhatsApp ↗';
      btnClass = 'text-success border-success/30 bg-success/10 hover:bg-success/20';
      explanation = 'Inicia conversa direta no WhatsApp ou WhatsApp Web sem precisar adicionar o número à agenda de contatos.';
    } else if (str.includes('t.me')) {
      linkLabel = '✈️ Abrir no Telegram ↗';
      btnClass = 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/20';
      explanation = 'Localiza perfil ou canal vinculado a este número de telefone no aplicativo Telegram.';
    } else if (str.includes('truecaller')) {
      linkLabel = '📞 Consultar no Truecaller ↗';
      btnClass = 'text-blue-400 border-blue-400/30 bg-blue-400/10 hover:bg-blue-400/20';
      explanation = 'Identificador comunitário de chamadas para verificar o nome informado por outros usuários e a operadora recente.';
    } else if (str.includes('sync.me')) {
      linkLabel = '🔍 Consultar no Sync.me ↗';
      btnClass = 'text-indigo-400 border-indigo-400/30 bg-indigo-400/10 hover:bg-indigo-400/20';
      explanation = 'Identificador de chamadas colaborativo e busca de redes sociais associadas ao número.';
    } else if (str.includes('github.com')) {
      linkLabel = '🐙 Perfil no GitHub ↗';
      btnClass = 'text-primary border-primary/30 bg-primary/10 hover:bg-primary/20';
      explanation = 'Perfil público de desenvolvedor com foto, biografia, empresa e repositórios abertos.';
    } else if (str.includes('portaldatransparencia')) {
      linkLabel = '🏛️ Portal da Transparência ↗';
      btnClass = 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/20';
      explanation = 'Base do Governo Federal para consulta de servidores públicos, Pessoas Expostas Politicamente (PEP) e benefícios.';
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
    } else if (str.includes('discord')) {
      linkLabel = '👾 Comunidade / Usuário no Discord ↗';
      btnClass = 'text-indigo-400 border-indigo-400/30 bg-indigo-400/10 hover:bg-indigo-400/20';
      explanation = 'Localizador de servidores e contas de usuários na plataforma Discord.';
    } else if (str.includes('linkedin')) {
      linkLabel = '💼 Buscar no LinkedIn ↗';
      btnClass = 'text-blue-400 border-blue-400/30 bg-blue-400/10 hover:bg-blue-400/20';
      explanation = 'Busca de histórico profissional e perfis corporativos no LinkedIn.';
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
// Components
// ---------------------------------------------------------------------------

function ApiBadgeCard({ api, isActive }) {
  return (
    <div className={`api-card flex items-center justify-between gap-4 rounded-xl border p-3.5 transition-all ${
      isActive ? 'border-primary/30 bg-surface/80' : 'border-white/5 bg-surface/30 opacity-60'
    }`}>
      <div className="flex items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isActive ? 'bg-success shadow-glow' : 'bg-ink-faint'}`} />
        <div>
          <p className="text-sm font-semibold text-ink">{api.name}</p>
          <p className="text-xs text-ink-dim mt-0.5">{api.supports?.join(' · ')}</p>
        </div>
      </div>
      <span className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded-md border ${
        isActive
          ? 'bg-success/10 text-success border-success/20'
          : 'bg-white/5 text-ink-faint border-white/10'
      }`}>
        {isActive ? 'Ativa' : 'Inativa'}
      </span>
    </div>
  );
}

function SidebarApiBadges({ catalogApis, enabledApis }) {
  return (
    <div className="glass-panel rounded-2xl p-4 mt-4">
      <p className="text-[10px] font-mono uppercase tracking-widest text-ink-dim mb-3">
        Fontes ativas na sua conta ({enabledApis?.length || 0})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {catalogApis.map((api) => {
          const on = (enabledApis || []).includes(api.id);
          return (
            <span
              key={api.id}
              className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-lg border transition-all ${
                on
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-white/5 bg-surface/30 text-ink-faint line-through'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-primary shadow-glow' : 'bg-ink-faint'}`} />
              {api.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ResultsStagePlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] h-full text-center px-6 py-12">
      <div className="w-16 h-16 rounded-2xl bg-surface/80 border border-white/10 flex items-center justify-center text-primary mb-4 shadow-glow">
        <IconSearch className="w-7 h-7 opacity-70" />
      </div>
      <h3 className="font-display text-lg font-semibold text-ink mb-1">Aguardando Consulta</h3>
      <p className="text-xs text-ink-dim max-w-sm leading-relaxed">
        Digite um Nome completo, CPF, CNPJ, Telefone com DDD, E-mail, Placa Mercosul ou IP/Domínio para iniciar a busca unificada.
      </p>
    </div>
  );
}

function ResultsPanel({ results }) {
  const fields = results?.fields || [];
  const sources = results?.sources || [];
  const queryType = results?.query?.kinds?.join(', ') || 'geral';

  if (!fields.length) {
    return (
      <div className="p-8 text-center flex flex-col items-center justify-center min-h-[260px]">
        <p className="text-sm font-semibold text-amber mb-1">Nenhum registro retornado</p>
        <p className="text-xs text-ink-dim max-w-md">
          As fontes de dados consultadas não retornaram registros para este termo. Verifique o formato digitado.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 flex-1">
      {/* Header Fixo dos Resultados */}
      <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between flex-wrap gap-2 shrink-0 bg-surface/40">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success shadow-glow animate-pulse" />
          <span className="text-xs font-mono uppercase tracking-wider text-ink font-semibold">
            Resultado da Consulta
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-ink-dim">
            tipo: {queryType}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
            {sources.length} {sources.length === 1 ? 'fonte' : 'fontes'}
          </span>
          <span className="text-[11px] font-mono text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded">
            {fields.length} campos
          </span>
        </div>
      </div>

      {/* Grid com Rolagem Perfeita e Suave */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 pr-2 max-h-[calc(75vh-50px)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pb-4">
          {fields.map((f, i) => {
            const isWide = String(f.value).length > 35 || String(f.value).startsWith('http');
            return (
              <div
                key={i}
                className={`p-4 rounded-xl border border-white/10 bg-surface/60 hover:border-primary/40 transition-all shadow-sm ${
                  isWide ? 'sm:col-span-2' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-mono uppercase text-ink-dim font-semibold tracking-wide">
                    {formatLabel(f.key)}
                  </span>
                  <div className="flex gap-1 flex-wrap">
                    {(f.sources || []).map((src) => (
                      <span
                        key={src}
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                          SOURCE_COLORS[src] || 'badge--blue'
                        }`}
                      >
                        {SOURCE_LABELS[src] || src}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-sm text-ink font-medium break-words leading-relaxed">
                  {renderValue(f.value)}
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

  // 3. Animações de Entrada
  const animateDashboardEntry = useCallback(() => {
    gsap.fromTo(
      dashboardRef.current,
      { opacity: 0, y: 32, filter: 'blur(8px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.75, ease: 'power3.out' }
    );
    gsap.fromTo(
      '.dashboard-stagger',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.55, stagger: 0.09, ease: 'power2.out', delay: 0.12 }
    );
    if (greetingRef.current) {
      gsap.fromTo(
        greetingRef.current,
        { opacity: 0, x: -12 },
        { opacity: 1, x: 0, duration: 0.6, ease: 'power2.out', delay: 0.25 }
      );
    }
  }, []);

  useEffect(() => {
    if (isLogged && !isTransitioning) {
      animateDashboardEntry();
    } else if (!isLogged && !isTransitioning) {
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 30, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out' }
      );
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
    setSettingsMessage('');
    setSettingsError('');
    setSettingsTab('perfil');
    setShowSettings(true);
    loadUserTickets();
    loadUserHistory();
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsMessage('');
    setSettingsError('');
    try {
      const response = await axios.patch(`${API}/profile`, {
        user_id: userId,
        display_name: settingsName.trim(),
        email: userEmail,
      });
      const newName = response.data.display_name;
      setUserName(newName);
      setSettingsMessage('Apelido atualizado e salvo com sucesso!');

      // Atualizar no localStorage imediatamente
      const stored = getStoredSession();
      if (stored) {
        saveSession({ ...stored, display_name: newName });
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
      <div className="relative min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 overflow-y-auto">
        <div className="app-backdrop" aria-hidden />

        <div className="w-full max-w-md my-auto pt-8 pb-6">
          <div ref={cardRef} className="glass-panel rounded-3xl p-6 sm:p-8 relative border border-white/10 shadow-glow">
            {/* Header Brand */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shadow-glow">
                <IconShield className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold text-ink">Painel de Dados</h1>
                <p className="text-xs text-ink-dim">Inteligência unificada e busca avançada</p>
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

      <div ref={dashboardRef} className="dashboard-shell relative z-10 w-full px-4 sm:px-8 lg:px-12 py-6">
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
                  Olá, <span className="text-primary">{userName || 'Usuário'}</span>
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
                          placeholder="Ex: João, Gabriel, Rafael…"
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
                        Olá, <span className="text-primary">{settingsName.trim() || '…'}</span>
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
                            <span className="text-xs font-semibold text-ink">Ticket #{selectedUserTicket.id}</span>
                            <span className="text-[10px] font-mono text-ink-faint">
                              Status: {selectedUserTicket.status}
                            </span>
                          </div>

                          <div className="flex-1 overflow-auto space-y-2 max-h-48 pr-1 text-xs">
                            <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                              <p className="text-[10px] font-mono text-primary font-semibold">Você (Mensagem Inicial):</p>
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
                                <p className="text-[10px] font-mono font-semibold text-primary">
                                  {resp.sender_type === 'admin' ? '🛡️ Resposta do Admin:' : 'Você:'}
                                </p>
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
                                {item.timestamp?.replace('T', ' ').slice(0, 16)}
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
                  placeholder="Nome, CPF, CNPJ, Telefone, E-mail, Placa, IP…"
                  className="w-full bg-transparent text-ink placeholder:text-ink-faint text-sm outline-none"
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
                  <ResultsPanel results={results} />
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
      <footer className="w-full text-center py-4 text-[11px] font-mono text-ink-faint relative z-10">
        Painel {APP_VERSION} · Atualizado em {APP_BUILD_TIME}
      </footer>
    </div>
  );
}

export default App;
