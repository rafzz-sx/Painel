const fallback = 'http://localhost:8000';

export const API = (import.meta.env.VITE_API_URL || fallback).replace(/\/$/, '');

export function authHeaders(token) {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
