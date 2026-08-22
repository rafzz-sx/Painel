import axios from 'axios';

const RENDER_API = 'https://painel-y9f9.onrender.com';

function resolveApi() {
  const fromEnv = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
  if (fromEnv && !fromEnv.includes('localhost')) return fromEnv;

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.includes('vercel.app') || host.includes('netlify.app')) {
      return RENDER_API;
    }
  }

  if (fromEnv) return fromEnv;
  return import.meta.env.PROD ? RENDER_API : 'http://localhost:8000';
}

export const API = resolveApi();

axios.defaults.timeout = 90000;
axios.defaults.headers.common['Content-Type'] = 'application/json';

export function authHeaders(token) {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
