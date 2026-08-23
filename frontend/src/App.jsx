import { useState, useEffect, useRef, useCallback } from 'react';
import { gsap } from 'gsap';
import axios from 'axios';
import { API, startKeepAlive, stopKeepAlive } from './api';
import AdminDashboard from './AdminDashboard';
import HelpModal, { IconHelp } from './HelpModal';

const DEFAULT_APIS = [
  {
    id: 'minhareceita',
    name: 'Minha Receita (CNPJ & Sócios)',
    description: 'Dados de CNPJ, Quadro de Sócios (QSA), CNAE e Capital Social.',
    supports: ['CNPJ'],
  },
  {
    id: 'receitaws',
    name: 'ReceitaWS',
    description: 'Consulta CNPJ na Receita Federal.',
    supports: ['CNPJ'],
  },
  {
    id: 'brasilapi',
    name: 'BrasilAPI',
    description: 'CEP, CNPJ, DDD, bancos, NCM, ISBN e feriados.',
    supports: ['CEP', 'CNPJ', 'DDD', 'Telefone', 'Banco', 'NCM', 'Ano'],
  },
  {
    id: 'nameint',
    name: 'Nome Intel (Pessoas & Diários)',
    description: 'Perfis no GitHub, Diários Oficiais, Transparência Federal e Sócios.',
    supports: ['Nome'],
  },
  {
    id: 'phoneint',
    name: 'Telefone Intel',
    description: 'Operadora Anatel, região, WhatsApp, Telegram e identificadores OSINT.',
    supports: ['Telefone', 'Celular'],
  },
  {
    id: 'emailint',
    name: 'E-mail Intel',
    description: 'Gravatar, GitHub, pegada social, validação MX e anti-descartável.',
    supports: ['E-mail'],
  },
  {
    id: 'cpfint',
    name: 'CPF Intel',
    description: 'Validação algorítmica, Estado emissor (9º dígito) e portal oficial.',
    supports: ['CPF'],
  },
  {
    id: 'plateint',
    name: 'Placa Intel',
    description: 'Padrão Mercosul/Antigo e Estado de registro Denatran.',
    supports: ['Placa'],
  },
  {
    id: 'ipdomainint',
    name: 'IP/Domínio Intel',
    description: 'Geolocalização de IP e consulta RDAP de domínios.',
    supports: ['IP', 'Domínio'],
  },
];

// ---------------------------------------------------------------------------
// Icons (inline SVG, no extra dependency)
// ---------------------------------------------------------------------------

const IconBase = { width: 24, height: 24 };

const IconMail = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m3.5 6.5 8.5 6 8.5-6" />
  </svg>
);

const IconLock = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);

const IconUser = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
  </svg>
);

const IconEye = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconEyeOff = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.2 0 10 7 10 7a15.5 15.5 0 0 1-3.9 4.6M6.6 6.6C4 8.3 2 12 2 12s3.8 7 10 7c1.4 0 2.6-.3 3.7-.8" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);

const IconSearch = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

const IconLogout = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

const IconShield = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <path d="M12 3 4.5 6v6c0 4.6 3.2 7.9 7.5 9 4.3-1.1 7.5-4.4 7.5-9V6L12 3Z" />
    <path d="m9.2 12.2 1.9 1.9 3.7-3.9" />
  </svg>
);

const IconAlert = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.3 3.9 2.5 18a1.8 1.8 0 0 0 1.5 2.7h16a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z" />
  </svg>
);

const IconSettings = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

const IconCheck = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

const IconGrid = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const IconInfo = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

const IconApi = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <path d="M4 6h16M4 12h16M4 18h16" />
    <circle cx="8" cy="6" r="1.5" fill="currentColor" />
    <circle cx="16" cy="12" r="1.5" fill="currentColor" />
    <circle cx="10" cy="18" r="1.5" fill="currentColor" />
  </svg>
);

const IconTicket = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <path d="M2 9a3 3 0 0 1 3 3 3 3 0 0 1-3 3v4a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-4a3 3 0 0 1 0-6V5a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v4Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const IconClose = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...IconBase} {...props}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describeLoginError(error) {
  if (error.code === 'ECONNABORTED') {
    return 'O servidor demorou para responder (o Render free "dorme"). Espere 1 minuto e tente de novo.';
  }
  if (error.code === 'ERR_NETWORK' || !error.response) {
    return `Não foi possível falar com a API (${API}). Confirme se o Render está Live e tente novamente.`;
  }
  const detail = error.response.data?.detail;
  if (error.response.status === 404) {
    return 'Rota não encontrada no servidor. Reinicie o backend (python main.py) para carregar as rotas novas.';
  }
  if (error.response.status === 401) {
    const detail = error.response.data?.detail;
    if (typeof detail === 'string' && detail !== 'INVALID_LOGIN_CREDENTIALS') return detail;
    return 'E-mail ou senha incorretos.';
  }
  if (error.response.status === 409) {
    return 'Este e-mail já está cadastrado. Use "Entrar" ou outro e-mail.';
  }
  if (typeof detail === 'string') return detail;
  return 'Não foi possível concluir a operação. Tente novamente em instantes.';
}

function describeSearchError(error) {
  if (error.code === 'ERR_NETWORK' || !error.response) {
    return 'Não foi possível falar com o servidor. Verifique se o backend está rodando.';
  }
  const detail = error.response.data?.detail;
  const status = error.response.status;

  if (status === 503) {
    return typeof detail === 'string'
      ? detail
      : 'A API externa de CPF (ReceitaWS) bloqueou ou limitou a consulta. Aguarde alguns minutos e tente novamente.';
  }
  if (status === 429) {
    return typeof detail === 'string'
      ? detail
      : 'Limite de consultas atingido na API ReceitaWS. Aguarde um momento antes de pesquisar de novo.';
  }
  if (status === 502) {
    return typeof detail === 'string'
      ? detail
      : 'Serviço de consulta indisponível no momento. Tente novamente mais tarde.';
  }
  if (typeof detail === 'string') return detail;
  return 'Não foi possível concluir a busca. Verifique o valor informado e tente novamente.';
}

function flattenResults(data, prefix = '') {
  if (data && Array.isArray(data.fields)) {
    return data.fields.map((field) => ({
      key: field.key,
      value: field.value,
      sources: field.sources || [],
    }));
  }
  if (data === null || data === undefined) return [{ key: prefix || 'valor', value: '—' }];
  if (typeof data !== 'object') return [{ key: prefix || 'valor', value: String(data) }];
  if (Array.isArray(data)) {
    return data.flatMap((item, i) => flattenResults(item, prefix ? `${prefix}[${i}]` : `[${i}]`));
  }
  return Object.entries(data)
    .filter(([k]) => !['sources_used', 'sources_enabled', 'sources_skipped', 'errors', 'query_types', 'query', 'total'].includes(k))
    .flatMap(([k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object') return flattenResults(v, key);
      return [{ key, value: v === null || v === undefined ? '—' : String(v) }];
    });
}

function StatusDots() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="console-dot bg-danger/70" />
      <span className="console-dot bg-amber/70" />
      <span className="console-dot bg-success/70" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// WarmUpBanner — shown when login takes > 3s (Render cold start)
// ---------------------------------------------------------------------------

function WarmUpBanner() {
  const [seconds, setSeconds] = useState(60);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="warmup-banner">
      <div className="relative z-10 flex items-center gap-3">
        <div className="warmup-wave">
          <span /><span /><span /><span /><span />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-primary font-medium">O servidor está acordando…</p>
          <p className="text-[11px] text-ink-dim mt-0.5">
            O Render free "dorme" após inatividade. Aguarde, a conexão será estabelecida automaticamente.
          </p>
        </div>
        <div className="warmup-countdown" title="Tempo estimado restante">
          {seconds}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API Badge Card — elegant read-only view for user's enabled APIs
// ---------------------------------------------------------------------------

function ApiBadgeCard({ api, isActive }) {
  return (
    <div className={`api-badge-card api-badge-enter ${isActive ? 'api-badge-card--active' : 'api-badge-card--inactive'}`}>
      <div className="flex items-center gap-3 mb-2">
        <span className={`api-status-dot ${isActive ? 'api-status-dot--active' : 'api-status-dot--inactive'}`} />
        <span className="text-sm font-medium text-ink">{api.name}</span>
        <span className={`ml-auto text-[10px] font-mono uppercase tracking-wider ${isActive ? 'text-success' : 'text-ink-faint'}`}>
          {isActive ? 'Ativa' : 'Inativa'}
        </span>
      </div>
      <p className="text-[11px] text-ink-dim mb-2.5 leading-relaxed">{api.description}</p>
      {api.supports?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {api.supports.map((type) => (
            <span key={type} className="api-chip">{type}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar API Badges — compact inline badges
// ---------------------------------------------------------------------------

function SidebarApiBadges({ catalogApis, enabledApis }) {
  const active = catalogApis.filter((api) => enabledApis.includes(api.id));
  if (active.length === 0) {
    return (
      <p className="text-xs text-ink-faint px-1 mt-4">
        Nenhuma API ativa nesta conta. Fale com o administrador.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2.5 px-1">
      <p className="text-[10px] font-mono uppercase tracking-widest text-ink-faint">
        Fontes ativas na sua conta
      </p>
      <div className="flex flex-wrap gap-2">
        {active.map((api) => (
          <span key={api.id} className="api-sidebar-badge api-badge-enter">
            <span className="api-status-dot api-status-dot--active" />
            {api.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function ResultsStagePlaceholder() {
  return (
    <div className="results-stage-idle flex flex-col items-center justify-center text-center px-8 py-10 min-h-[280px]">
      <div className="results-stage-glow" aria-hidden />
      <div className="relative z-10 flex flex-col items-center gap-5 max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary/70 results-idle-icon">
          <IconSearch className="w-7 h-7" />
        </div>
        <div>
          <p className="font-display text-lg text-ink/90 font-medium mb-2">Área de resultados</p>
          <p className="text-sm text-ink-dim leading-relaxed">
            Os dados da consulta aparecerão aqui assim que você pesquisar.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-ink-faint uppercase tracking-widest">
          <span className="w-1 h-1 rounded-full bg-primary/50" />
          pronto para consulta
          <span className="w-1 h-1 rounded-full bg-primary/50" />
        </div>
      </div>
    </div>
  );
}

function ResultsPanel({ results, variant = 'default' }) {
  const panelRef = useRef(null);
  const fields = flattenResults(results);
  const isStage = variant === 'stage';

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, x: isStage ? 32 : 0, y: isStage ? 0 : 28, scale: 0.98 },
        { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.6, ease: 'power3.out' }
      );
      gsap.fromTo(
        '.result-field',
        { opacity: 0, x: 20, filter: 'blur(6px)' },
        {
          opacity: 1,
          x: 0,
          filter: 'blur(0px)',
          duration: 0.5,
          stagger: 0.035,
          ease: 'power2.out',
          delay: 0.12,
        }
      );
      gsap.fromTo(
        '.result-glow-line',
        { scaleX: 0 },
        { scaleX: 1, duration: 0.9, ease: 'power2.inOut', delay: 0.08 }
      );
    }, panelRef);

    return () => ctx.revert();
  }, [results, isStage]);

  return (
    <div ref={panelRef} className={`scan-ring shadow-glow w-full h-full ${isStage ? 'results-panel-stage' : ''}`}>
      <div className="scan-ring__inner overflow-hidden h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <StatusDots />
            <div>
              <span className="text-xs font-mono text-ink-dim uppercase tracking-widest">resultado da consulta</span>
              {results?.query_types?.length > 0 && (
                <p className="text-[10px] font-mono text-ink-faint mt-0.5 truncate">
                  tipo: {results.query_types.join(', ')}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {results?.sources_used?.length > 0 && (
              <span className="hidden sm:inline text-[10px] font-mono text-primary/80 px-2 py-1 rounded-full bg-primary/10 border border-primary/20">
                {results.sources_used.length} fontes
              </span>
            )}
            <span className="text-[11px] font-mono text-success/80 px-2.5 py-1 rounded-full bg-success/10 border border-success/20">
              {fields.length} campos
            </span>
          </div>
        </div>
        <div className="result-glow-line h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent origin-left shrink-0" />
        <div className={`data-readout p-5 overflow-auto flex-1 ${isStage ? 'max-h-[340px]' : 'max-h-[460px]'}`}>
          {fields.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-ink-dim mb-3">
                <IconSearch className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-ink mb-1">Nenhum registro retornado</p>
              <p className="text-xs text-ink-dim max-w-sm">
                Tente buscar por um CPF (ex: 123.456.789-00), CNPJ, Telefone com DDD, E-mail, Placa de carro ou Nome completo.
              </p>
            </div>
          ) : (
            <div className={`grid gap-2.5 ${isStage ? 'sm:grid-cols-2' : 'sm:grid-cols-2'}`}>
              {fields.map(({ key, value, sources }) => {
                const isLink = typeof value === 'string' && (value.startsWith('https://') || value.startsWith('http://'));
                const isAvatar = key.toLowerCase().includes('avatar') || key.toLowerCase().includes('gravatar_foto');
                const isAlert = key.startsWith('⚠️') || key.toLowerCase().includes('alerta');
                const isValid = typeof value === 'string' && value.startsWith('✅');
                const isInvalid = typeof value === 'string' && value.startsWith('❌');

                // Label inteligente para links OSINT
                const getLinkLabel = () => {
                  const k = key.toLowerCase();
                  if (k.includes('whatsapp')) return { icon: '💬', text: 'Abrir no WhatsApp', color: 'text-[#25D366] hover:text-[#128C7E]' };
                  if (k.includes('telegram')) return { icon: '✈️', text: 'Abrir no Telegram', color: 'text-[#0088cc] hover:text-[#006daa]' };
                  if (k.includes('google_maps')) return { icon: '📍', text: 'Ver no Google Maps', color: 'text-[#4285F4] hover:text-[#1a73e8]' };
                  if (k.includes('portal_transparencia')) return { icon: '🏛️', text: 'Consultar Portal da Transparência', color: 'text-amber hover:text-ink' };
                  if (k.includes('diarios_oficiais')) return { icon: '📰', text: 'Buscar em Diários Oficiais (Querido Diário)', color: 'text-primary hover:text-ink' };
                  if (k.includes('jusbrasil')) return { icon: '⚖️', text: 'Buscar Processos no Jusbrasil', color: 'text-primary hover:text-ink' };
                  if (k.includes('escavador')) return { icon: '📄', text: 'Buscar no Escavador', color: 'text-primary hover:text-ink' };
                  if (k.includes('github')) return { icon: '🐙', text: 'Ver Perfil no GitHub', color: 'text-ink hover:text-primary' };
                  if (k.includes('truecaller')) return { icon: '📞', text: 'Consultar no Truecaller', color: 'text-[#0087FF] hover:text-ink' };
                  if (k.includes('syncme')) return { icon: '🔍', text: 'Consultar no Sync.me', color: 'text-[#00C389] hover:text-ink' };
                  if (k.includes('receita_federal')) return { icon: '📑', text: 'Comprovante Oficial da Receita Federal', color: 'text-amber hover:text-ink' };
                  if (k.includes('twitter') || k.includes('x.com')) return { icon: '🐦', text: 'Ver Perfil no X (Twitter)', color: 'text-ink hover:text-primary' };
                  if (k.includes('google_account')) return { icon: '🔍', text: 'Verificar Conta Google', color: 'text-[#EA4335] hover:text-ink' };
                  if (k.includes('instagram')) return { icon: '📸', text: 'Verificar Conta Instagram', color: 'text-[#E1306C] hover:text-ink' };
                  return { icon: '🔗', text: value, color: 'text-primary hover:text-ink' };
                };

                const linkInfo = isLink ? getLinkLabel() : null;

                return (
                  <div
                    key={`${key}-${value}`}
                    className={`result-field glass-panel rounded-xl px-4 py-3.5 border transition-all duration-300 ${
                      isAlert
                        ? 'border-amber/30 bg-amber/5 hover:border-amber/50'
                        : isValid
                        ? 'border-success/20 hover:border-success/40'
                        : isInvalid
                        ? 'border-danger/20 hover:border-danger/40'
                        : 'border-white/5 hover:border-primary/25 hover:shadow-[0_0_20px_rgba(58,167,255,0.08)]'
                    }`}
                  >
                    <p className={`text-[10px] font-mono uppercase tracking-wider mb-1.5 truncate ${
                      isAlert ? 'text-amber' : isValid ? 'text-success' : isInvalid ? 'text-danger' : 'text-primary/80'
                    }`}>{key.replace(/_/g, ' ')}</p>

                    {isAvatar ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={value}
                          alt="Avatar"
                          className="w-14 h-14 rounded-full border-2 border-primary/40 shadow-lg object-cover bg-surface"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <div>
                          <p className="text-xs font-semibold text-ink">Foto / Avatar Público</p>
                          <p className="text-[11px] text-ink-dim font-mono truncate max-w-[160px]">{value}</p>
                        </div>
                      </div>
                    ) : isLink ? (
                      <a
                        href={value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-2 text-xs font-mono font-medium break-words transition-colors underline underline-offset-2 ${linkInfo.color}`}
                      >
                        <span>{linkInfo.icon}</span>
                        <span>{linkInfo.text}</span>
                      </a>
                    ) : (
                      <p className={`text-sm font-mono break-words ${
                        isValid ? 'text-success font-medium' : isInvalid ? 'text-danger font-medium' : 'text-ink/90'
                      }`}>{value}</p>
                    )}

                    {sources?.length > 0 && (
                      <p className="text-[10px] font-mono text-ink-faint mt-2">{sources.join(' · ')}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
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

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
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
  const [systemOnline, setSystemOnline] = useState(null);
  const [serverPing, setServerPing] = useState(null);
  const [isPinging, setIsPinging] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketCategory, setTicketCategory] = useState('bug');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketSending, setTicketSending] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const dashboardRef = useRef(null);
  const cardRef = useRef(null);
  const greetingRef = useRef(null);
  const transitionRef = useRef(null);
  const warmUpTimerRef = useRef(null);

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
      gsap.fromTo(
        '.greeting-name',
        { backgroundPosition: '200% center' },
        { backgroundPosition: '0% center', duration: 1.2, ease: 'power2.out', delay: 0.35 }
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

  const checkHealth = useCallback(async () => {
    setIsPinging(true);
    const start = performance.now();
    try {
      await axios.get(`${API}/health`, { timeout: 15000 });
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
      .get(`${API}/apis`, { timeout: 30000 })
      .then((response) => {
        if (Array.isArray(response.data?.apis) && response.data.apis.length) {
          setCatalogApis(response.data.apis);
        }
      })
      .catch(() => {});

    checkHealth();
    const interval = setInterval(checkHealth, 20000);
    return () => clearInterval(interval);
  }, [isLogged, checkHealth]);

  // Start/stop keep-alive when login state changes
  useEffect(() => {
    if (isLogged) {
      startKeepAlive();
    } else {
      stopKeepAlive();
    }
    return () => stopKeepAlive();
  }, [isLogged]);

  const completeLogin = (data) => {
    setUserId(data.user);
    setUserName(data.display_name || 'Usuário');
    setUserEmail(data.email || email);
    setSettingsName(data.display_name || '');
    setIsAdmin(Boolean(data.is_admin));
    setAuthToken(data.id_token || '');
    if (Array.isArray(data.enabled_apis)) {
      setEnabledApis(data.enabled_apis);
    }
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

    // Show warm-up banner after 3 seconds if still logging in
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
        display_name: displayName.trim(),
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
  };

  const openSettings = () => {
    setSettingsName(userName);
    setSettingsMessage('');
    setSettingsError('');
    setSettingsTab('perfil');
    setShowSettings(true);
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
      setUserName(response.data.display_name);
      setSettingsMessage('Nome atualizado com sucesso!');
      gsap.fromTo('.settings-success', { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35 });
      gsap.fromTo('.greeting-name', { scale: 0.92 }, { scale: 1, duration: 0.4, ease: 'back.out(1.6)' });
    } catch (error) {
      setSettingsError(describeLoginError(error));
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchError('');
    setResults(null);
    setIsSearching(true);
    try {
      const response = await axios.get(`${API}/search`, {
        params: { q: searchQuery.trim(), user_id: userId },
      });
      setResults(response.data);
      axios
        .post(`${API}/log`, {
          user_id: userId,
          action: `busca por ${searchQuery}`,
        })
        .catch(() => {});
    } catch (error) {
      setSearchError(describeSearchError(error));
    } finally {
      setIsSearching(false);
    }
  };

  const switchAuthMode = (mode) => {
    setAuthMode(mode);
    setLoginError('');
    setShowWarmUp(false);
  };

  // Settings tabs config
  const settingsTabs = [
    { id: 'perfil', label: 'Perfil', desc: 'Nome e apelido' },
    { id: 'conta', label: 'Conta', desc: 'E-mail e sessão' },
    ...(!isAdmin ? [{ id: 'apis', label: 'Minhas APIs', desc: 'Fontes de dados' }] : []),
  ];

  // -------------------------------------------------------------------
  // Login / Register screen
  // -------------------------------------------------------------------

  if (!isLogged) {
    return (
      <div className="relative min-h-screen font-body flex items-center justify-center px-4 overflow-hidden">
        <div className="app-backdrop">
          <div className="scanline-sweep" />
          <div className="glow-blob w-[420px] h-[420px] bg-primary/20 animate-pulse-soft" style={{ top: '8%', left: '4%' }} />
          <div className="glow-blob w-[360px] h-[360px] bg-amber/10 animate-pulse-soft" style={{ bottom: '4%', right: '8%', animationDelay: '1.5s' }} />
          <div className="glow-blob w-[280px] h-[280px] bg-primary/15 animate-pulse-soft" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', animationDelay: '0.8s' }} />
        </div>

        {/* Transição pós-login */}
        <div
          ref={transitionRef}
          className="login-transition-overlay fixed inset-0 z-50 flex items-center justify-center pointer-events-none opacity-0"
        >
          <div className="text-center">
            <div className="login-transition-ring mx-auto mb-4" />
            <p className="font-display text-lg text-ink/90 tracking-wide">Acesso autorizado</p>
          </div>
        </div>

        <div ref={cardRef} className="relative z-10 w-full max-w-md">
          <div className="scan-ring shadow-glow">
            <div className="scan-ring__inner px-8 py-9">
              <div className="flex items-center justify-between mb-7">
                <StatusDots />
                <span className="flex items-center gap-1.5 text-[11px] tracking-widest uppercase font-mono text-ink-dim">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-blink" />
                  canal seguro
                </span>
              </div>

              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center text-primary shrink-0">
                  <IconShield className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="font-display text-xl font-semibold text-ink leading-tight">Acesso Restrito</h1>
                  <p className="text-xs text-ink-dim">Autentique-se para abrir o painel</p>
                </div>
              </div>

              {/* Tabs Entrar / Criar conta */}
              <div className="mt-5 flex rounded-xl bg-surface/60 p-1 border border-white/5">
                <button
                  type="button"
                  onClick={() => switchAuthMode('login')}
                  className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all duration-300 ${
                    authMode === 'login'
                      ? 'bg-primary/20 text-primary shadow-inner'
                      : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => switchAuthMode('register')}
                  className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all duration-300 ${
                    authMode === 'register'
                      ? 'bg-primary/20 text-primary shadow-inner'
                      : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  Criar conta
                </button>
              </div>

              <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="mt-5 space-y-4">
                {authMode === 'register' && (
                  <label className="field-focus-ring flex items-center gap-3 rounded-xl border border-white/10 bg-surface/70 px-4 py-3">
                    <IconUser className="w-[18px] h-[18px] text-ink-dim shrink-0" />
                    <input
                      type="text"
                      placeholder="Seu nome (ex: Rafael, João…)"
                      autoComplete="name"
                      className="w-full bg-transparent text-ink placeholder:text-ink-faint text-sm outline-none"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                    />
                  </label>
                )}

                <label className="field-focus-ring flex items-center gap-3 rounded-xl border border-white/10 bg-surface/70 px-4 py-3">
                  <IconMail className="w-[18px] h-[18px] text-ink-dim shrink-0" />
                  <input
                    type="email"
                    placeholder="E-mail"
                    autoComplete="username"
                    className="w-full bg-transparent text-ink placeholder:text-ink-faint text-sm outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>

                <label className="field-focus-ring flex items-center gap-3 rounded-xl border border-white/10 bg-surface/70 px-4 py-3">
                  <IconLock className="w-[18px] h-[18px] text-ink-dim shrink-0" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Senha"
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                    className="w-full bg-transparent text-ink placeholder:text-ink-faint text-sm outline-none"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="text-ink-dim hover:text-ink transition-colors shrink-0"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <IconEyeOff className="w-[18px] h-[18px]" /> : <IconEye className="w-[18px] h-[18px]" />}
                  </button>
                </label>

                {authMode === 'register' && (
                  <p className="text-[11px] text-ink-faint px-1">
                    O nome escolhido aparecerá como saudação no painel — ex: &quot;Olá, João&quot;.
                  </p>
                )}

                {/* Warm-up banner — appears when login takes > 3s */}
                {showWarmUp && isLoggingIn && <WarmUpBanner />}

                {loginError && (
                  <div className="error-banner flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
                    <IconAlert className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-white font-semibold text-sm rounded-xl py-3.5 mt-2"
                >
                  {isLoggingIn ? (
                    <>
                      <span className="spinner" />
                      {authMode === 'login' ? 'Conectando ao servidor…' : 'Criando conta…'}
                    </>
                  ) : (
                    authMode === 'login' ? 'Entrar' : 'Criar conta e entrar'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Dashboard
  // -------------------------------------------------------------------

  if (showAdmin && isAdmin) {
    return (
      <div className="relative min-h-screen font-body">
        <div className="app-backdrop">
          <div className="glow-blob w-[480px] h-[480px] bg-primary/10 animate-pulse-soft" style={{ top: '-8%', left: '-5%' }} />
        </div>
        <div className="relative z-10 pt-8">
          <AdminDashboard
            token={authToken}
            catalogApis={catalogApis}
            onBack={() => setShowAdmin(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen font-body">
      <div className="app-backdrop">
        <div className="glow-blob w-[480px] h-[480px] bg-primary/10 animate-pulse-soft" style={{ top: '-8%', left: '-5%' }} />
        <div className="glow-blob w-[320px] h-[320px] bg-amber/8 animate-pulse-soft" style={{ bottom: '8%', right: '3%', animationDelay: '2s' }} />
      </div>

      <div ref={dashboardRef} className="dashboard-shell relative z-10 w-full min-h-screen px-6 sm:px-10 lg:px-14 pt-8 pb-14">
        <div className="dashboard-topbar dashboard-stagger relative w-full mb-10 lg:mb-14">
          <div className="flex items-start gap-5 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-primary-soft flex items-center justify-center text-primary greeting-avatar shrink-0">
              <IconShield className="w-7 h-7" />
            </div>
            <div ref={greetingRef} className="min-w-0">
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.25rem] font-bold text-ink leading-[1.1] tracking-tight">
                Olá,{' '}
                <span className="greeting-name inline-block bg-gradient-to-r from-primary via-ink to-primary bg-[length:200%_auto] bg-clip-text text-transparent">
                  {userName}
                </span>
              </h1>
              {systemOnline === true && (
                <div className="mt-2 max-w-xl flex items-center gap-2.5 flex-wrap">
                  <p className="text-sm sm:text-base text-ink-dim flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-success animate-blink shrink-0" />
                    Sistema online e pronto para uso.
                  </p>
                  {serverPing !== null && (
                    <span className="ping-badge ping-badge--fast inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded-md border border-success/30 bg-success/10 text-success">
                      ⚡ {serverPing}ms
                    </span>
                  )}
                </div>
              )}
              {systemOnline === 'slow' && (
                <div className="mt-2 max-w-xl">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <p className="text-sm sm:text-base text-amber flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber animate-blink shrink-0" />
                      Conexão lenta/fraca com o servidor.
                    </p>
                    {serverPing !== null && (
                      <span className="ping-badge ping-badge--slow inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded-md border border-amber/30 bg-amber/10 text-amber">
                        ⚡ {serverPing >= 1000 ? (serverPing / 1000).toFixed(1) + 's' : serverPing + 'ms'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-faint mt-1">
                    O servidor está respondendo, mas as consultas podem levar alguns segundos a mais.
                  </p>
                </div>
              )}
              {systemOnline === false && (
                <div className="mt-2 max-w-xl">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <p className="text-sm text-danger flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-danger shrink-0" />
                      Sem conexão com o servidor.
                    </p>
                    <span className="ping-badge ping-badge--offline inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded-md border border-danger/30 bg-danger/10 text-danger">
                      ✕ Offline
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <button
                      type="button"
                      onClick={checkHealth}
                      disabled={isPinging}
                      className="text-xs text-primary hover:text-ink underline underline-offset-2 font-medium flex items-center gap-1"
                    >
                      {isPinging ? <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> : '🔄'} Tentar reconectar
                    </button>
                    <span className="text-ink-faint text-xs">·</span>
                    <button
                      type="button"
                      onClick={() => setShowTicketModal(true)}
                      className="text-xs text-ink-dim hover:text-ink underline underline-offset-2"
                    >
                      Enviar ticket ao administrador →
                    </button>
                  </div>
                </div>
              )}
              {systemOnline === null && (
                <p className="text-sm text-ink-dim mt-2 max-w-xl flex items-center gap-2">
                  <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
                  Verificando conexão com o servidor…
                </p>
              )}
              <div className="flex items-center gap-1.5 text-xs text-ink-dim mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-blink" />
                <span className="font-mono truncate">{userEmail || userId}</span>
              </div>
            </div>
          </div>

          <div className="dashboard-actions absolute top-0 right-0 flex items-center gap-2 flex-wrap justify-end max-w-[55%]">
            {isAdmin && (
              <button
                onClick={() => setShowAdmin(true)}
                className="flex items-center gap-2 text-sm text-amber hover:text-ink border border-amber/30 hover:border-amber/50 rounded-lg px-3.5 py-2 transition-colors"
              >
                <IconGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Admin</span>
              </button>
            )}
            <button
              onClick={openSettings}
              className={`flex items-center gap-2 text-sm border rounded-lg px-3.5 py-2 transition-colors ${
                showSettings
                  ? 'text-primary border-primary/40 bg-primary/10'
                  : 'text-ink-dim hover:text-ink border-white/10 hover:border-primary/30'
              }`}
              title="Configurações"
            >
              <IconSettings className="w-4 h-4" />
              <span className="hidden sm:inline">Configurações</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm text-ink-dim hover:text-ink border border-white/10 hover:border-white/20 rounded-lg px-3.5 py-2 transition-colors"
            >
              <IconLogout className="w-4 h-4" />
              Sair
            </button>
          </div>
        </div>

        {showSettings && (
          <section className="dashboard-stagger settings-panel glass-panel rounded-2xl mb-8 w-full border border-primary/15 shadow-glow overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-stretch min-h-[320px]">
              <aside className="settings-sidebar lg:w-56 shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 p-4 lg:p-5">
                <p className="text-[10px] font-mono uppercase tracking-widest text-ink-faint mb-3 px-2">Menu</p>
                {settingsTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setSettingsTab(tab.id); setSettingsError(''); setSettingsMessage(''); }}
                    className={`settings-tab w-full text-left rounded-xl px-3 py-2.5 mb-1 transition-colors ${
                      settingsTab === tab.id
                        ? 'bg-primary/15 text-primary border border-primary/25'
                        : 'text-ink-dim hover:text-ink hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <span className="block text-sm font-medium">{tab.label}</span>
                    <span className="block text-[11px] opacity-70 mt-0.5">{tab.desc}</span>
                  </button>
                ))}
              </aside>

              <div className="flex-1 p-5 sm:p-6 lg:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-ink">
                      {settingsTab === 'perfil' && 'Perfil e apelido'}
                      {settingsTab === 'conta' && 'Dados da conta'}
                      {settingsTab === 'apis' && 'Minhas APIs'}
                    </h2>
                    <p className="text-xs text-ink-dim mt-1">
                      {settingsTab === 'perfil' && 'Defina como você quer ser chamado ao entrar no painel.'}
                      {settingsTab === 'conta' && 'Informações da sua sessão atual.'}
                      {settingsTab === 'apis' && 'Veja quais fontes de dados estão habilitadas na sua conta.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="text-ink-dim hover:text-ink text-sm px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors shrink-0"
                  >
                    Fechar
                  </button>
                </div>

                {settingsTab === 'perfil' && (
                  <form onSubmit={handleSaveSettings} className="space-y-5 max-w-lg">
                    <label className="block">
                      <span className="text-xs font-mono uppercase tracking-wider text-ink-dim mb-2 block">Nome / Apelido</span>
                      <div className="field-focus-ring flex items-center gap-3 rounded-xl border border-white/10 bg-surface/70 px-4 py-3">
                        <IconUser className="w-[18px] h-[18px] text-ink-dim shrink-0" />
                        <input
                          type="text"
                          placeholder="Ex: Rafael, João, Gabriel…"
                          className="w-full bg-transparent text-ink placeholder:text-ink-faint text-sm outline-none"
                          value={settingsName}
                          onChange={(e) => setSettingsName(e.target.value)}
                          required
                          minLength={2}
                        />
                      </div>
                    </label>

                    <div className="greeting-preview rounded-xl border border-white/10 bg-surface/40 px-5 py-4">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-ink-faint mb-2">Pré-visualização</p>
                      <p className="font-display text-2xl font-bold text-ink">
                        Olá,{' '}
                        <span className="text-primary">{settingsName.trim() || '…'}</span>
                      </p>
                    </div>

                    {settingsError && (
                      <div className="error-banner flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
                        <IconAlert className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{settingsError}</span>
                      </div>
                    )}

                    {settingsMessage && (
                      <div className="settings-success flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                        <IconCheck className="w-4 h-4 shrink-0" />
                        <span>{settingsMessage}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={settingsSaving || settingsName.trim().length < 2}
                      className="btn-primary flex items-center justify-center gap-2 text-white font-semibold text-sm rounded-xl px-6 py-3"
                    >
                      {settingsSaving ? <span className="spinner" /> : <IconCheck className="w-4 h-4" />}
                      Salvar apelido
                    </button>
                  </form>
                )}

                {settingsTab === 'conta' && (
                  <div className="space-y-4 max-w-lg">
                    <div className="settings-info-row rounded-xl border border-white/10 bg-surface/40 px-4 py-3.5">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-ink-faint mb-1">E-mail</p>
                      <p className="text-sm text-ink font-mono break-all">{userEmail || '—'}</p>
                    </div>
                    <div className="settings-info-row rounded-xl border border-white/10 bg-surface/40 px-4 py-3.5">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-ink-faint mb-1">ID do usuário</p>
                      <p className="text-sm text-ink-dim font-mono break-all">{userId || '—'}</p>
                    </div>
                    <div className="settings-info-row rounded-xl border border-white/10 bg-surface/40 px-4 py-3.5">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-ink-faint mb-1">Status da sessão</p>
                      <p className="text-sm text-success flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-success animate-blink" />
                        Conectado e autenticado
                      </p>
                    </div>
                    <p className="text-xs text-ink-faint pt-1">
                      As APIs da sua conta são definidas pelo administrador. Sua conta é gerenciada pelo Firebase.
                    </p>
                  </div>
                )}

                {settingsTab === 'apis' && (
                  <div className="space-y-4 max-w-lg">
                    <div className="space-y-3">
                      {catalogApis.map((api) => (
                        <ApiBadgeCard
                          key={api.id}
                          api={api}
                          isActive={enabledApis.includes(api.id)}
                        />
                      ))}
                    </div>

                    <div className="info-note">
                      <IconInfo className="w-4 h-4" />
                      <span>
                        As APIs são configuradas pelo administrador do sistema. Para ativar ou desativar uma fonte de dados, entre em contato com o admin.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <div className="dashboard-workspace w-full">
          <aside className="dashboard-sidebar dashboard-stagger">
            <section className="dashboard-panel glass-panel rounded-2xl p-2 flex flex-col gap-2">
              <label className="field-focus-ring flex-1 flex items-center gap-3 rounded-xl border border-transparent bg-surface/60 px-4 py-3">
                <IconSearch className="w-[18px] h-[18px] text-ink-dim shrink-0" />
                <input
                  type="text"
                  placeholder="CPF, CNPJ, CEP, telefone, e-mail, placa, IP, domínio…"
                  className="w-full bg-transparent text-ink placeholder:text-ink-faint text-sm outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </label>
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="btn-primary flex items-center justify-center gap-2 text-white font-semibold text-sm rounded-xl px-6 py-3"
              >
                {isSearching ? <span className="spinner" /> : <IconSearch className="w-4 h-4" />}
                Pesquisar
              </button>
            </section>

            {/* Sidebar API badges — visual, elegant, hidden on small screens */}
            <div className="hidden lg:block">
              <SidebarApiBadges catalogApis={catalogApis} enabledApis={enabledApis} />
            </div>
          </aside>

          <section className="results-stage dashboard-stagger" aria-live="polite">
            <div className="results-stage-frame glass-panel rounded-2xl overflow-hidden relative min-h-[280px] max-h-[440px]">
              <div className="results-stage-ambient" aria-hidden />

              {isSearching && (
                <div className="relative z-10 flex flex-col items-center justify-center gap-5 min-h-[280px] px-6 py-10">
                  <div className="search-pulse-ring" />
                  <p className="text-sm text-ink-dim font-mono animate-pulse">Consultando base de dados…</p>
                </div>
              )}

              {searchError && !isSearching && (
                <div className="relative z-10 flex flex-col items-center justify-center min-h-[280px] px-8 py-10">
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
                <div className="relative z-10 h-full max-h-[440px] p-1 sm:p-1.5">
                  <ResultsPanel results={results} variant="stage" />
                </div>
              )}

              {!results && !searchError && !isSearching && (
                <div className="relative z-10 h-full">
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

        {/* ── Modal de Ajuda/Dúvidas ── */}
        <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />

        {/* ── Modal de Ticket ── */}
        {showTicketModal && (
          <div className="ticket-overlay" onClick={() => setShowTicketModal(false)}>
            <div className="ticket-modal glass-panel" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink">Enviar Ticket</h3>
                  <p className="text-xs text-ink-dim mt-0.5">Reporte um problema ou envie uma ideia.</p>
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
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center text-success">
                    <IconCheck className="w-6 h-6" />
                  </div>
                  <p className="text-sm text-success font-medium">{ticketSuccess}</p>
                  <button
                    type="button"
                    onClick={() => setShowTicketModal(false)}
                    className="text-xs text-ink-dim hover:text-ink mt-2"
                  >
                    Fechar
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
                        category: ticketCategory,
                        message: ticketMessage.trim(),
                      });
                      setTicketSuccess('Ticket enviado com sucesso! O admin será notificado.');
                      setTicketMessage('');
                      setTicketCategory('bug');
                    } catch (err) {
                      setTicketSuccess('');
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
                      placeholder="Descreva o problema ou sua ideia…"
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
                    Enviar ticket
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
