import { useEffect, useState } from 'react';
import axios from 'axios';
import { API, authHeaders } from './api';

const CATEGORY_LABELS = {
  bug: { emoji: '🐛', label: 'Bug', color: 'text-danger' },
  ideia: { emoji: '💡', label: 'Ideia', color: 'text-primary' },
  outro: { emoji: '💬', label: 'Outro', color: 'text-ink-dim' },
};

const STATUS_LABELS = {
  aberto: { label: 'Aberto', color: 'bg-amber/15 text-amber border-amber/30' },
  respondido: { label: 'Respondido', color: 'bg-success/15 text-success border-success/30' },
  finalizado: { label: 'Finalizado', color: 'bg-white/10 text-ink-faint border-white/10' },
};

export default function AdminDashboard({ token, onBack, catalogApis }) {
  const [activeTab, setActiveTab] = useState('contas');
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Deletar conta
  const [userToDelete, setUserToDelete] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Tickets
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [ticketFilter, setTicketFilter] = useState('todos');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [adminReplyText, setAdminReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

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
      const list = response.data.tickets || [];
      setTickets(list);
      setOpenCount(response.data.open_count || 0);
      if (selectedTicket) {
        const fresh = list.find((t) => t.id === selectedTicket.id);
        if (fresh) setSelectedTicket(fresh);
      }
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

  const handleDeleteAccount = async () => {
    if (!userToDelete) return;
    setDeletingUser(true);
    try {
      await axios.delete(`${API}/admin/accounts/${userToDelete.user}`, {
        headers: authHeaders(token),
      });
      setAccounts((list) => list.filter((u) => u.user !== userToDelete.user));
      if (selected?.user === userToDelete.user) setSelected(null);
      setUserToDelete(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Não foi possível excluir a conta.');
    } finally {
      setDeletingUser(false);
    }
  };

  const handleUpdateTicketStatus = async (ticketId, status) => {
    try {
      const res = await axios.patch(
        `${API}/admin/tickets/${ticketId}/status`,
        { status },
        { headers: authHeaders(token) },
      );
      const updated = res.data.ticket;
      setTickets((list) => list.map((t) => (t.id === ticketId ? updated : t)));
      if (selectedTicket?.id === ticketId) setSelectedTicket(updated);
      loadTickets();
    } catch (err) {
      setError(err.response?.data?.detail || 'Falha ao atualizar status do ticket.');
    }
  };

  const handleSendAdminReply = async (e) => {
    e.preventDefault();
    if (!selectedTicket || !adminReplyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await axios.post(
        `${API}/admin/tickets/${selectedTicket.id}/reply`,
        { message: adminReplyText.trim(), status: 'respondido' },
        { headers: authHeaders(token) },
      );
      const updated = res.data.ticket;
      setTickets((list) => list.map((t) => (t.id === selectedTicket.id ? updated : t)));
      setSelectedTicket(updated);
      setAdminReplyText('');
      loadTickets();
    } catch (err) {
      setError(err.response?.data?.detail || 'Falha ao enviar resposta.');
    } finally {
      setSendingReply(false);
    }
  };

  const filteredTickets =
    ticketFilter === 'todos'
      ? tickets
      : tickets.filter((t) => t.status === ticketFilter);

  const tabs = [
    { id: 'contas', label: '🧑‍💻 Contas', badge: accounts.length },
    { id: 'tickets', label: '📨 Tickets & Suporte', badge: openCount, highlight: openCount > 0 },
  ];

  return (
    <div className="relative z-10 w-full px-4 sm:px-8 lg:px-12 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-primary mb-1">painel restrito</p>
          <h2 className="font-display text-3xl font-bold text-ink">Dashboard Admin</h2>
          <p className="text-sm text-ink-dim mt-1">Gerencie contas, APIs, exclusão de usuários e tickets interativos.</p>
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
        <div className="mb-6 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="text-xs underline ml-2">Fechar</button>
        </div>
      )}

      {/* ── Tab: Contas ── */}
      {activeTab === 'contas' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <section className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest text-ink-dim">contas cadastradas</span>
              <span className="text-[11px] font-mono text-ink-faint">{accounts.length}</span>
            </div>
            {loading ? (
              <p className="px-5 py-10 text-sm text-ink-dim">Carregando contas…</p>
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
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-ink font-medium truncate">{account.display_name}</p>
                      {account.is_admin && (
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber/20 text-amber border border-amber/30 shrink-0">Admin</span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-ink-dim truncate mt-0.5">{account.email}</p>
                    <p className="text-[11px] text-ink-faint mt-1 truncate">
                      {(account.enabled_apis || []).join(', ') || 'todas as fontes'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="glass-panel rounded-2xl p-5 min-h-[320px]">
            {!selected ? (
              <div className="flex flex-col items-center justify-center min-h-[280px] text-center">
                <p className="text-sm text-ink-dim">Selecione uma conta para gerenciar APIs, ver histórico ou excluir.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-semibold text-ink">{selected.display_name}</h3>
                    <p className="text-xs font-mono text-ink-dim mt-1 break-all">{selected.email}</p>
                  </div>
                  {!selected.is_admin && (
                    <button
                      type="button"
                      onClick={() => setUserToDelete(selected)}
                      className="text-xs font-medium text-danger hover:text-white border border-danger/40 hover:bg-danger/80 rounded-lg px-3 py-1.5 transition-colors shrink-0 flex items-center gap-1"
                    >
                      🗑️ Excluir Conta
                    </button>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-ink-faint mb-3">APIs ativas para este usuário</p>
                  <div className="space-y-2 max-h-60 overflow-auto pr-1">
                    {catalogApis.map((api) => {
                      const on = (selected.enabled_apis || []).includes(api.id);
                      return (
                        <div key={api.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-xs text-ink font-medium truncate">{api.name}</p>
                            <p className="text-[10px] text-ink-faint truncate">{api.supports?.join(' · ')}</p>
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
                  <p className="text-[10px] font-mono uppercase tracking-widest text-ink-faint mb-2">histórico de ações</p>
                  <div className="max-h-48 overflow-auto space-y-2 pr-1">
                    {history.length === 0 && (
                      <p className="text-xs text-ink-dim">Nenhuma ação registrada ainda.</p>
                    )}
                    {history.map((item) => (
                      <div key={item.id} className="rounded-lg bg-surface/50 px-3 py-2">
                        <p className="text-xs text-ink">{item.action}</p>
                        <p className="text-[10px] font-mono text-ink-faint mt-0.5">{item.timestamp?.replace('T', ' ').slice(0, 16)}</p>
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)]">
          {/* Lista de Tickets */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap justify-between">
              <div className="flex items-center gap-1.5">
                {[
                  ['todos', 'Todos'],
                  ['aberto', '🟡 Abertos'],
                  ['respondido', '🟢 Respondidos'],
                  ['finalizado', '⚪ Finalizados'],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setTicketFilter(val)}
                    className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                      ticketFilter === val
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : 'text-ink-dim border-white/10 hover:border-white/20'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={loadTickets}
                className="text-xs text-ink-dim hover:text-ink border border-white/10 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                ↻
              </button>
            </div>

            {ticketsLoading ? (
              <p className="text-sm text-ink-dim py-8 text-center">Carregando tickets…</p>
            ) : filteredTickets.length === 0 ? (
              <div className="glass-panel rounded-2xl p-8 text-center">
                <p className="text-sm text-ink-dim">Nenhum ticket encontrado neste filtro.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[70vh] overflow-auto pr-1">
                {filteredTickets.map((ticket) => {
                  const cat = CATEGORY_LABELS[ticket.category] || CATEGORY_LABELS.outro;
                  const st = STATUS_LABELS[ticket.status] || STATUS_LABELS.aberto;
                  const isSel = selectedTicket?.id === ticket.id;

                  return (
                    <div
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      className={`ticket-card glass-panel rounded-2xl p-4 border cursor-pointer transition-all ${
                        isSel ? 'border-primary/50 bg-primary/10 shadow-glow' : 'border-white/5 hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base">{cat.emoji}</span>
                          <span className={`text-xs font-medium ${cat.color}`}>{cat.label}</span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${st.color}`}>
                            {st.label}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-ink-faint shrink-0">#{ticket.id}</span>
                      </div>

                      <p className="text-sm text-ink leading-snug mb-2 line-clamp-2">{ticket.message}</p>

                      <div className="flex items-center justify-between text-[11px] text-ink-dim font-mono">
                        <span className="truncate max-w-[180px]">{ticket.user_name || ticket.user_email}</span>
                        <span>{ticket.created_at?.replace('T', ' ').slice(0, 16)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Conversa do Ticket Selecionado */}
          <div className="glass-panel rounded-2xl p-5 min-h-[380px] flex flex-col">
            {!selectedTicket ? (
              <div className="flex flex-col items-center justify-center flex-1 text-center py-12">
                <p className="text-sm text-ink-dim">Selecione um ticket para ver as mensagens e responder ao usuário.</p>
              </div>
            ) : (
              <div className="flex flex-col h-full space-y-4">
                {/* Cabeçalho do Ticket */}
                <div className="border-b border-white/10 pb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base">{(CATEGORY_LABELS[selectedTicket.category] || CATEGORY_LABELS.outro).emoji}</span>
                      <h3 className="text-sm font-semibold text-ink">Ticket #{selectedTicket.id}</h3>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${(STATUS_LABELS[selectedTicket.status] || STATUS_LABELS.aberto).color}`}>
                        {(STATUS_LABELS[selectedTicket.status] || STATUS_LABELS.aberto).label}
                      </span>
                    </div>
                    <p className="text-xs text-ink-dim font-mono mt-1">
                      De: <span className="text-ink">{selectedTicket.user_name}</span> ({selectedTicket.user_email})
                    </p>
                  </div>

                  {/* Ações de Status pelo Admin */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleUpdateTicketStatus(selectedTicket.id, 'aberto')}
                      className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                        selectedTicket.status === 'aberto' ? 'bg-amber/20 text-amber border-amber/40' : 'text-ink-dim border-white/10'
                      }`}
                    >
                      Aberto
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateTicketStatus(selectedTicket.id, 'respondido')}
                      className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                        selectedTicket.status === 'respondido' ? 'bg-success/20 text-success border-success/40' : 'text-ink-dim border-white/10'
                      }`}
                    >
                      Respondido
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateTicketStatus(selectedTicket.id, 'finalizado')}
                      className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                        selectedTicket.status === 'finalizado' ? 'bg-white/20 text-ink border-white/30' : 'text-ink-dim border-white/10'
                      }`}
                    >
                      Finalizar
                    </button>
                  </div>
                </div>

                {/* Mensagens da Conversa */}
                <div className="flex-1 overflow-auto space-y-3 max-h-[45vh] pr-1">
                  {/* Mensagem Inicial do Usuário */}
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between text-[11px] font-mono text-ink-faint mb-1.5">
                      <span className="font-semibold text-primary">{selectedTicket.user_name} (Mensagem Inicial)</span>
                      <span>{selectedTicket.created_at?.replace('T', ' ').slice(0, 16)}</span>
                    </div>
                    <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{selectedTicket.message}</p>
                  </div>

                  {/* Respostas Anteriores */}
                  {(selectedTicket.responses || []).map((resp, idx) => {
                    const isAdmin = resp.sender_type === 'admin';
                    return (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-xl border ${
                          isAdmin
                            ? 'bg-primary/10 border-primary/25 ml-4'
                            : 'bg-white/5 border-white/10 mr-4'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
                          <span className={isAdmin ? 'font-semibold text-primary' : 'font-semibold text-ink'}>
                            {isAdmin ? '🛡️ ' + (resp.sender_name || 'Admin') : resp.sender_name || 'Usuário'}
                          </span>
                          <span className="text-ink-faint">{resp.created_at?.replace('T', ' ').slice(0, 16)}</span>
                        </div>
                        <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{resp.message}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Campo de Resposta do Admin */}
                <form onSubmit={handleSendAdminReply} className="pt-2 border-t border-white/10 space-y-2">
                  <textarea
                    rows={3}
                    placeholder="Digite a resposta do administrador para o usuário…"
                    value={adminReplyText}
                    onChange={(e) => setAdminReplyText(e.target.value)}
                    className="w-full bg-surface/70 border border-white/10 rounded-xl p-3 text-sm text-ink placeholder:text-ink-faint outline-none resize-none focus:border-primary/50"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={sendingReply || !adminReplyText.trim()}
                      className="btn-primary text-xs font-semibold px-4 py-2 rounded-xl text-white flex items-center gap-2"
                    >
                      {sendingReply ? 'Enviando…' : '✉️ Enviar Resposta'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Conta */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel rounded-2xl p-6 max-w-md w-full border border-danger/30 shadow-glow">
            <h4 className="font-display text-xl font-bold text-danger mb-2">Excluir Conta Permanentemente?</h4>
            <p className="text-sm text-ink leading-relaxed mb-4">
              Você está prestes a excluir a conta de <span className="font-semibold text-white">{userToDelete.display_name}</span> ({userToDelete.email}).
              Todos os dados, histórico e tickets deste usuário serão removidos.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={deletingUser}
                className="text-xs text-ink-dim hover:text-ink px-4 py-2 rounded-lg border border-white/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deletingUser}
                className="text-xs font-semibold bg-danger hover:bg-danger/80 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
              >
                {deletingUser ? 'Excluindo…' : 'Sim, Excluir Conta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
