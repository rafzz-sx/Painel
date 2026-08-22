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
