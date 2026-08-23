import { useEffect, useState } from 'react';
import axios from 'axios';
import { API, authHeaders } from './api';

const CATEGORY_LABELS = {
  bug: { emoji: '🐛', label: 'Bug', color: 'text-danger' },
  ideia: { emoji: '💡', label: 'Ideia', color: 'text-primary' },
  outro: { emoji: '💬', label: 'Outro', color: 'text-ink-dim' },
};

export default function AdminDashboard({ token, onBack, catalogApis }) {
  const [activeTab, setActiveTab] = useState('contas');
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Tickets
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [ticketFilter, setTicketFilter] = useState('todos');

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

  const loadTickets = async () => {
    setTicketsLoading(true);
    try {
      const response = await axios.get(`${API}/admin/tickets`, {
        headers: authHeaders(token),
      });
      setTickets(response.data.tickets || []);
      setOpenCount(response.data.open_count || 0);
    } catch {
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
    loadTickets();
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

  const resolveTicket = async (ticketId) => {
    try {
      await axios.patch(
        `${API}/admin/tickets/${ticketId}`,
        {},
        { headers: authHeaders(token) },
      );
      setTickets((list) =>
        list.map((t) => (t.id === ticketId ? { ...t, status: 'resolvido' } : t))
      );
      setOpenCount((c) => Math.max(0, c - 1));
    } catch (err) {
      setError(err.response?.data?.detail || 'Falha ao resolver ticket.');
    }
  };

  const filteredTickets =
    ticketFilter === 'todos'
      ? tickets
      : tickets.filter((t) => t.status === ticketFilter);

  const tabs = [
    { id: 'contas', label: '🧑‍💻 Contas', badge: accounts.length },
    { id: 'tickets', label: '📨 Tickets', badge: openCount, highlight: openCount > 0 },
  ];

  return (
    <div className="relative z-10 w-full px-4 sm:px-8 lg:px-12 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-primary mb-1">painel restrito</p>
          <h2 className="font-display text-3xl font-bold text-ink">Dashboard Admin</h2>
          <p className="text-sm text-ink-dim mt-1">Gerencie contas, APIs e tickets de suporte.</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-ink-dim hover:text-ink border border-white/10 rounded-lg px-3.5 py-2 transition-colors hover:border-white/20"
        >
          ← Voltar ao painel
        </button>
      </div>

      {/* Tabs */}
      <div className="admin-tabs flex gap-1 mb-6 p-1 rounded-xl bg-surface/60 border border-white/5 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`admin-tab flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg transition-all duration-300 ${
              activeTab === tab.id
                ? 'bg-primary/20 text-primary shadow-inner'
                : 'text-ink-dim hover:text-ink'
            }`}
          >
            {tab.label}
            {tab.badge != null && (
              <span
                className={`admin-tab-badge text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                  tab.highlight
                    ? 'bg-danger/20 text-danger border border-danger/30'
                    : 'bg-white/10 text-ink-faint'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* ── Tab: Contas ── */}
      {activeTab === 'contas' && (
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
              <div className="flex flex-col items-center justify-center min-h-[280px] text-center">
                <p className="text-sm text-ink-dim">Selecione uma conta para gerenciar APIs e ver o histórico.</p>
              </div>
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
      )}

      {/* ── Tab: Tickets ── */}
      {activeTab === 'tickets' && (
        <div className="space-y-5">
          {/* Filtros */}
          <div className="flex items-center gap-2 flex-wrap">
            {[['todos', 'Todos'], ['aberto', '🟢 Abertos'], ['resolvido', '✅ Resolvidos']].map(
              ([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setTicketFilter(val)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                    ticketFilter === val
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'text-ink-dim border-white/10 hover:border-white/20'
                  }`}
                >
                  {label}
                </button>
              )
            )}
            <button
              type="button"
              onClick={loadTickets}
              className="ml-auto text-xs text-ink-dim hover:text-ink border border-white/10 rounded-lg px-3 py-1.5 transition-colors"
            >
              ↻ Atualizar
            </button>
          </div>

          {ticketsLoading ? (
            <p className="text-sm text-ink-dim py-8 text-center">Carregando tickets…</p>
          ) : filteredTickets.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center">
              <p className="text-sm text-ink-dim">Nenhum ticket {ticketFilter !== 'todos' ? ticketFilter : ''} encontrado.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredTickets.map((ticket) => {
                const cat = CATEGORY_LABELS[ticket.category] || CATEGORY_LABELS.outro;
                const isOpen = ticket.status === 'aberto';
                return (
                  <div
                    key={ticket.id}
                    className={`ticket-card glass-panel rounded-2xl p-4 border transition-all ${
                      isOpen ? 'border-primary/15' : 'border-white/5 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base">{cat.emoji}</span>
                        <span className={`text-xs font-medium ${cat.color}`}>{cat.label}</span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          isOpen
                            ? 'bg-success/15 text-success border border-success/25'
                            : 'bg-white/5 text-ink-faint'
                        }`}>
                          {isOpen ? 'aberto' : 'resolvido'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-ink-faint shrink-0">
                        #{ticket.id}
                      </span>
                    </div>

                    <p className="text-sm text-ink leading-relaxed mb-3 line-clamp-3">
                      {ticket.message}
                    </p>

                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-mono text-ink-dim truncate">
                          {ticket.user_email || ticket.user_id}
                        </p>
                        <p className="text-[10px] font-mono text-ink-faint mt-0.5">
                          {ticket.created_at?.replace('T', ' ').slice(0, 16)}
                        </p>
                      </div>
                      {isOpen && (
                        <button
                          type="button"
                          onClick={() => resolveTicket(ticket.id)}
                          className="text-xs font-medium text-success hover:text-ink border border-success/30 hover:border-success/50 rounded-lg px-3 py-1.5 transition-colors shrink-0"
                        >
                          ✓ Resolver
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
