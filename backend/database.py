"""
database.py — SQLite local para armazenar usuários, logs de atividade e tickets interativos.
Substitui chamadas bloqueantes por operações locais rápidas (0.1ms).
Thread-safe via check_same_thread=False + lock manual.
"""

import json
import os
import sqlite3
import threading
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "database.db")

_lock = threading.Lock()


def _conn():
    """Cria conexão SQLite configurada."""
    c = sqlite3.connect(DB_PATH, timeout=5, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA busy_timeout=3000")
    return c


def init_db():
    """Cria tabelas se não existirem e adiciona colunas faltantes."""
    with _lock:
        c = _conn()
        c.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                uid TEXT PRIMARY KEY,
                email TEXT NOT NULL DEFAULT '',
                display_name TEXT NOT NULL DEFAULT 'Usuário',
                enabled_apis TEXT NOT NULL DEFAULT '[]',
                is_admin INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                extra TEXT NOT NULL DEFAULT '{}',
                ip TEXT NOT NULL DEFAULT 'N/A',
                user_agent TEXT NOT NULL DEFAULT '',
                timestamp TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                user_email TEXT NOT NULL DEFAULT '',
                user_name TEXT NOT NULL DEFAULT 'Usuário',
                category TEXT NOT NULL DEFAULT 'bug',
                message TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'aberto',
                responses TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT '',
                resolved_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
            CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
        """)
        
        # Migrações seguras de colunas existentes
        try:
            c.execute("ALTER TABLE tickets ADD COLUMN responses TEXT NOT NULL DEFAULT '[]'")
        except Exception:
            pass
        try:
            c.execute("ALTER TABLE tickets ADD COLUMN user_name TEXT NOT NULL DEFAULT 'Usuário'")
        except Exception:
            pass
        try:
            c.execute("ALTER TABLE tickets ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''")
        except Exception:
            pass

        c.commit()
        c.close()


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def get_user(uid):
    """Retorna dict do usuário ou None."""
    with _lock:
        c = _conn()
        row = c.execute("SELECT * FROM users WHERE uid = ?", (uid,)).fetchone()
        c.close()
    if row is None:
        return None
    return _row_to_user(row)


def get_or_create_user(uid, email="", display_name="Usuário", enabled_apis=None, is_admin=False):
    """Retorna o usuário; cria se não existir."""
    user = get_user(uid)
    if user:
        # Se display_name informado for novo e não vazio, atualiza se estiver 'Usuário'
        if display_name and display_name != "Usuário" and user.get("display_name") == "Usuário":
            update_user_name(uid, display_name)
            user["display_name"] = display_name
        return user
    apis = json.dumps(enabled_apis or [])
    now = datetime.now().isoformat()
    with _lock:
        c = _conn()
        c.execute(
            "INSERT OR IGNORE INTO users (uid, email, display_name, enabled_apis, is_admin, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
            (uid, email, display_name, apis, int(is_admin), now, now),
        )
        c.commit()
        c.close()
    return get_user(uid) or {
        "uid": uid, "email": email, "display_name": display_name,
        "enabled_apis": enabled_apis or [],
        "is_admin": is_admin, "created_at": now, "updated_at": now,
    }


def update_user_name(uid, display_name):
    """Atualiza o nome do usuário."""
    now = datetime.now().isoformat()
    with _lock:
        c = _conn()
        c.execute("UPDATE users SET display_name = ?, updated_at = ? WHERE uid = ?", (display_name, now, uid))
        c.commit()
        c.close()
    return display_name


def update_user_apis(uid, enabled_apis):
    """Atualiza as APIs ativas de um usuário."""
    now = datetime.now().isoformat()
    apis = json.dumps(enabled_apis)
    with _lock:
        c = _conn()
        c.execute("UPDATE users SET enabled_apis = ?, updated_at = ? WHERE uid = ?", (apis, now, uid))
        c.commit()
        c.close()


def delete_user(uid):
    """Exclui permanentemente o usuário e seus registros relacionados."""
    with _lock:
        c = _conn()
        c.execute("DELETE FROM users WHERE uid = ?", (uid,))
        c.execute("DELETE FROM activity_logs WHERE user_id = ?", (uid,))
        c.execute("DELETE FROM tickets WHERE user_id = ?", (uid,))
        c.commit()
        c.close()
    return True


def list_all_users():
    """Retorna lista de todos os usuários."""
    with _lock:
        c = _conn()
        rows = c.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
        c.close()
    return [_row_to_user(r) for r in rows]


def _row_to_user(row):
    """Converte sqlite3.Row em dict."""
    d = dict(row)
    try:
        d["enabled_apis"] = json.loads(d.get("enabled_apis", "[]"))
    except Exception:
        d["enabled_apis"] = []
    d["is_admin"] = bool(d.get("is_admin", 0))
    return d


# ---------------------------------------------------------------------------
# Activity Logs
# ---------------------------------------------------------------------------

def log_activity(user_id, action, extra=None, ip="N/A", user_agent=""):
    """Grava um log de atividade."""
    now = datetime.now().isoformat()
    extra_json = json.dumps(extra or {}, ensure_ascii=False)
    with _lock:
        c = _conn()
        c.execute(
            "INSERT INTO activity_logs (user_id, action, extra, ip, user_agent, timestamp) VALUES (?,?,?,?,?,?)",
            (user_id, action, extra_json, ip, user_agent[:240], now),
        )
        c.commit()
        c.close()


def get_user_history(user_id, limit=200):
    """Retorna os últimos N logs de um usuário."""
    with _lock:
        c = _conn()
        rows = c.execute(
            "SELECT * FROM activity_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        c.close()
    items = []
    for r in rows:
        d = dict(r)
        try:
            d["extra"] = json.loads(d.get("extra", "{}"))
        except Exception:
            d["extra"] = {}
        items.append({
            "id": str(d.get("id", "")),
            "user_id": d["user_id"],
            "action": d["action"],
            "timestamp": d["timestamp"],
            "device_info": {"ip": d.get("ip", "N/A"), "user_agent": d.get("user_agent", "")},
            **d.get("extra", {}),
        })
    return items


# ---------------------------------------------------------------------------
# Tickets (com suporte a conversação interativa e status)
# ---------------------------------------------------------------------------

def create_ticket(user_id, user_email, category, message, user_name="Usuário"):
    """Cria um ticket de suporte."""
    now = datetime.now().isoformat()
    with _lock:
        c = _conn()
        c.execute(
            "INSERT INTO tickets (user_id, user_email, user_name, category, message, status, responses, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (user_id, user_email, user_name, category, message, "aberto", "[]", now, now),
        )
        c.commit()
        ticket_id = c.execute("SELECT last_insert_rowid()").fetchone()[0]
        c.close()
    return {"id": ticket_id, "status": "aberto", "created_at": now, "responses": []}


def get_user_tickets(user_id):
    """Retorna todos os tickets do usuário com suas mensagens."""
    with _lock:
        c = _conn()
        rows = c.execute(
            "SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC", (user_id,)
        ).fetchall()
        c.close()
    return [_row_to_ticket(r) for r in rows]


def list_tickets(status_filter=None):
    """Lista todos os tickets para o Admin."""
    with _lock:
        c = _conn()
        if status_filter:
            rows = c.execute(
                "SELECT * FROM tickets WHERE status = ? ORDER BY created_at DESC", (status_filter,)
            ).fetchall()
        else:
            rows = c.execute("SELECT * FROM tickets ORDER BY created_at DESC").fetchall()
        c.close()
    return [_row_to_ticket(r) for r in rows]


def reply_ticket(ticket_id, sender_type, sender_name, message, new_status=None):
    """Adiciona uma resposta na thread do ticket."""
    now = datetime.now().isoformat()
    with _lock:
        c = _conn()
        row = c.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        if not row:
            c.close()
            return None
        
        t = _row_to_ticket(row)
        responses = t.get("responses", [])
        responses.append({
            "sender_type": sender_type,  # "admin" ou "user"
            "sender_name": sender_name,
            "message": message,
            "created_at": now,
        })
        
        status = new_status or ("respondido" if sender_type == "admin" else "aberto")
        responses_json = json.dumps(responses, ensure_ascii=False)
        
        c.execute(
            "UPDATE tickets SET responses = ?, status = ?, updated_at = ? WHERE id = ?",
            (responses_json, status, now, ticket_id)
        )
        c.commit()
        updated_row = c.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        c.close()
    return _row_to_ticket(updated_row) if updated_row else None


def update_ticket_status(ticket_id, status):
    """Admin altera o status do ticket (aberto, respondido, finalizado)."""
    now = datetime.now().isoformat()
    resolved_at = now if status == "finalizado" else None
    with _lock:
        c = _conn()
        c.execute(
            "UPDATE tickets SET status = ?, updated_at = ?, resolved_at = ? WHERE id = ?",
            (status, now, resolved_at, ticket_id),
        )
        c.commit()
        row = c.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        c.close()
    return _row_to_ticket(row) if row else None


def count_open_tickets():
    """Conta tickets abertos ou pendentes."""
    with _lock:
        c = _conn()
        row = c.execute("SELECT COUNT(*) FROM tickets WHERE status IN ('aberto', 'respondido')").fetchone()
        c.close()
    return row[0] if row else 0


def _row_to_ticket(row):
    """Converte sqlite3.Row em dict de ticket."""
    d = dict(row)
    try:
        d["responses"] = json.loads(d.get("responses", "[]"))
    except Exception:
        d["responses"] = []
    return d


# Inicializa o banco de dados
init_db()
