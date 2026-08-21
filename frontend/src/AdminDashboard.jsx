import { useEffect, useState } from 'react';
import axios from 'axios';
import { API, authHeaders } from './api';

export default function AdminDashboard({ token, onBack, catalogApis }) {
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadAccounts = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API}/admin/accounts`, {
        headers: authHeaders(token),
      });
      setAccounts(response.data.accounts || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Não foi possível carregar as contas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const openAccount = async (account) => {
    setSelected(account);
    setHistory([]);
    try {
      const response = await axios.get(`${API}/admin/accounts/${account.user}/history`, {
        headers: authHeaders(token),
      });
      setHistory(response.data.history || []);
    } catch {
      setHistory([]);
    }
  };

  const toggleApi = async (apiId) => {
    if (!selected) return;
    const current = selected.enabled_apis || [];
    const next = current.includes(apiId)
      ? current.filter((id) => id !== apiId)
      : [...current, apiId];
    setSaving(true);
    try {
      const response = await axios.patch(
        `${API}/admin/accounts/${selected.user}/apis`,
        { enabled_apis: next },
        { headers: authHeaders(token) },
      );
      const updated = { ...selected, enabled_apis: response.data.enabled_apis };
      setSelected(updated);
      setAccounts((list) => list.map((item) => (item.user === updated.user ? updated : item)));
    } catch (err) {
      setError(err.response?.data?.detail || 'Falha ao atualizar APIs.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative z-10 w-full px-4 sm:px-8 lg:px-12 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-primary mb-1">painel restrito</p>
          <h2 className="font-display text-3xl font-bold text-ink">Dashboard admin</h2>
          <p className="text-sm text-ink-dim mt-1">Contas, APIs por usuário e histórico de uso.</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-ink-dim hover:text-ink border border-white/10 rounded-lg px-3.5 py-2"
        >
          Voltar ao painel
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="glass-panel rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-widest text-ink-dim">contas</span>
            <span className="text-[11px] font-mono text-ink-faint">{accounts.length}</span>
          </div>
          {loading ? (
            <p className="px-5 py-10 text-sm text-ink-dim">Carregando…</p>
          ) : (
            <div className="max-h-[70vh] overflow-auto divide-y divide-white/5">
              {accounts.map((account) => (
                <button
                  key={account.user}
                  type="button"
                  onClick={() => openAccount(account)}
                  className={`w-full text-left px-5 py-4 hover:bg-white/5 transition-colors ${
                    selected?.user === account.user ? 'bg-primary/10' : ''
                  }`}
                >
                  <p className="text-sm text-ink font-medium truncate">{account.display_name}</p>
                  <p className="text-xs font-mono text-ink-dim truncate mt-0.5">{account.email}</p>
                  <p className="text-[11px] text-ink-faint mt-1">
                    {(account.enabled_apis || []).join(', ') || 'nenhuma API'}
                    {account.is_admin ? ' · admin' : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="glass-panel rounded-2xl p-5 min-h-[320px]">
          {!selected ? (
            <p className="text-sm text-ink-dim">Selecione uma conta para gerenciar APIs e ver o histórico.</p>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="font-display text-xl font-semibold text-ink">{selected.display_name}</h3>
                <p className="text-xs font-mono text-ink-dim mt-1 break-all">{selected.email}</p>
              </div>

              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-ink-faint mb-3">APIs desta conta</p>
                <div className="space-y-2">
                  {catalogApis.map((api) => {
                    const on = (selected.enabled_apis || []).includes(api.id);
                    return (
                      <div key={api.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-3">
                        <div>
                          <p className="text-sm text-ink">{api.name}</p>
                          <p className="text-[11px] text-ink-faint">{api.supports?.join(' · ')}</p>
                        </div>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => toggleApi(api.id)}
                          className={`api-toggle shrink-0 ${on ? 'api-toggle--on' : ''}`}
                          aria-checked={on}
                          role="switch"
                        >
                          <span className="api-toggle-knob" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-ink-faint mb-3">histórico</p>
                <div className="max-h-64 overflow-auto space-y-2">
                  {history.length === 0 && (
                    <p className="text-xs text-ink-dim">Nenhuma ação registrada ainda.</p>
                  )}
                  {history.map((item) => (
                    <div key={item.id} className="rounded-lg bg-surface/50 px-3 py-2">
                      <p className="text-xs text-ink">{item.action}</p>
                      <p className="text-[10px] font-mono text-ink-faint mt-0.5">{item.timestamp}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
