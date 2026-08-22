import axios from 'axios';

const RENDER_API = 'https://painel-y9f9.onrender.com';

/**
 * Na Vercel o browser chama a mesma origem (/api/...),
 * e a Vercel encaminha para o Render. Assim não depende de CORS
 * nem de variável mal gravada no build.
 */
function resolveApi() {
  if (typeof window === 'undefined') {
    return import.meta.env.DEV ? 'http://localhost:8000' : '/api';
  }
  const host = window.location.hostname;
  if (host.includes('vercel.app')) return '/api';
  if (host === 'localhost' || host === '127.0.0.1') {
    return import.meta.env.DEV ? 'http://localhost:8000' : RENDER_API;
  }
  return RENDER_API;
}

export const API = resolveApi();

axios.defaults.timeout = 90000;

export function authHeaders(token) {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Keep-alive: pinga /health para acordar o Render antes do login
// ---------------------------------------------------------------------------

let _keepAliveTimer = null;

/** Pinga /health silenciosamente. Retorna true se o server respondeu. */
export async function pingBackend() {
  try {
    await axios.get(`${API}/health`, { timeout: 60000 });
    return true;
  } catch {
    return false;
  }
}

/** Inicia keep-alive: pinga /health a cada 10 min enquanto logado. */
export function startKeepAlive() {
  stopKeepAlive();
  _keepAliveTimer = setInterval(() => {
    pingBackend();
  }, 10 * 60 * 1000); // 10 minutos
}

/** Para o keep-alive. */
export function stopKeepAlive() {
  if (_keepAliveTimer) {
    clearInterval(_keepAliveTimer);
    _keepAliveTimer = null;
  }
}

// Pre-warm: assim que a página carrega, já pinga silenciosamente
if (typeof window !== 'undefined') {
  pingBackend();
}
