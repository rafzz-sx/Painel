import os
from typing import Optional
import json
import urllib.request
import urllib.error
from datetime import datetime
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from dotenv import load_dotenv
from search import AVAILABLE_APIS, DEFAULT_SOURCES, run_search
import database as db

load_dotenv()

FIREBASE_WEB_API_KEY = os.getenv("FIREBASE_WEB_API_KEY")
ADMIN_EMAIL = (os.getenv("ADMIN_EMAIL") or "").strip().lower()


# ── FastAPI ────────────────────────────────────────────────────────────────

app = FastAPI(title="Painel de Dados API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)


# ── Helpers ────────────────────────────────────────────────────────────────

def get_device_info(request: Optional[Request] = None):
    forwarded = ""
    ua = ""
    if request is not None:
        forwarded = request.headers.get("x-forwarded-for") or (
            request.client.host if request.client else ""
        )
        ua = request.headers.get("user-agent", "")
    return {
        "ip": forwarded.split(",")[0].strip() if forwarded else "N/A",
        "user_agent": ua[:240],
    }


def is_admin_email(email: Optional[str]) -> bool:
    return bool(ADMIN_EMAIL) and (email or "").strip().lower() == ADMIN_EMAIL


def write_activity(user_id: str, action: str, extra: Optional[dict] = None, request: Optional[Request] = None):
    info = get_device_info(request)
    db.log_activity(user_id, action, extra=extra, ip=info["ip"], user_agent=info["user_agent"])


def user_enabled_apis(uid: str) -> list:
    user = db.get_user(uid)
    if user and isinstance(user.get("enabled_apis"), list) and user["enabled_apis"]:
        allowed = {api["id"] for api in AVAILABLE_APIS}
        return [src for src in user["enabled_apis"] if src in allowed]
    return DEFAULT_SOURCES[:]


def session_payload(uid: str, email: str, display_name: str, id_token: str, extra: Optional[dict] = None):
    body = {
        "status": "success",
        "user": uid,
        "display_name": display_name,
        "email": email,
        "is_admin": is_admin_email(email),
        "id_token": id_token,
        "enabled_apis": user_enabled_apis(uid),
    }
    if extra:
        body.update(extra)
    return body


def get_user_display_name(uid: str, email: Optional[str] = None) -> str:
    user = db.get_user(uid)
    if user and user.get("display_name"):
        return user["display_name"]
    if email:
        local = email.split("@")[0]
        return local.replace(".", " ").replace("_", " ").title()
    return "Usuário"


# ── Firebase REST Auth (sem gRPC, sem travamento) ─────────────────────────

def verify_password_with_firebase(email: str, password: str) -> dict:
    if not FIREBASE_WEB_API_KEY:
        raise HTTPException(status_code=500, detail="FIREBASE_WEB_API_KEY não configurada no servidor.")
    url = (
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
        f"?key={FIREBASE_WEB_API_KEY}"
    )
    payload = json.dumps(
        {"email": email, "password": password, "returnSecureToken": True}
    ).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            error_body = json.loads(e.read().decode("utf-8"))
            message = error_body.get("error", {}).get("message", "INVALID_LOGIN_CREDENTIALS")
        except Exception:
            message = "INVALID_LOGIN_CREDENTIALS"
        raise HTTPException(status_code=401, detail=message)
    except urllib.error.URLError:
        raise HTTPException(status_code=502, detail="Não foi possível contatar o Firebase.")


def register_with_firebase_rest(email: str, password: str, display_name: str) -> dict:
    if not FIREBASE_WEB_API_KEY:
        raise HTTPException(status_code=500, detail="FIREBASE_WEB_API_KEY não configurada no servidor.")
    url = (
        "https://identitytoolkit.googleapis.com/v1/accounts:signUp"
        f"?key={FIREBASE_WEB_API_KEY}"
    )
    payload = json.dumps(
        {"email": email, "password": password, "returnSecureToken": True}
    ).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            # Atualiza o display name no Firebase Auth
            try:
                up_url = f"https://identitytoolkit.googleapis.com/v1/accounts:update?key={FIREBASE_WEB_API_KEY}"
                up_payload = json.dumps({
                    "idToken": data.get("idToken"),
                    "displayName": display_name,
                    "returnSecureToken": True,
                }).encode("utf-8")
                up_req = urllib.request.Request(up_url, data=up_payload, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(up_req, timeout=8) as up_resp:
                    up_data = json.loads(up_resp.read().decode("utf-8"))
                    data.update(up_data)
            except Exception:
                pass
            return data
    except urllib.error.HTTPError as e:
        try:
            error_body = json.loads(e.read().decode("utf-8"))
            msg = error_body.get("error", {}).get("message", "")
            if "EMAIL_EXISTS" in msg:
                raise HTTPException(status_code=409, detail="Este e-mail já está cadastrado")
            detail = msg or "Não foi possível criar a conta"
        except HTTPException:
            raise
        except Exception:
            detail = "Não foi possível criar a conta"
        raise HTTPException(status_code=400, detail=detail)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao contatar Firebase: {exc}")


def _verify_admin_token(authorization: Optional[str]) -> dict:
    """
    Verifica o token JWT do Firebase de forma leve:
    decodifica o payload (Base64) para checar email e expiração.
    Não requer o SDK Admin nem gRPC.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Token de administrador ausente")
    token = authorization.split(" ", 1)[1].strip()
    import base64
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Token inválido")
    try:
        # Decode JWT payload (part 1)
        padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido ou malformado")
    # Check expiration
    import time
    exp = payload.get("exp", 0)
    if exp and time.time() > exp:
        raise HTTPException(status_code=401, detail="Sessão expirada. Faça login novamente.")
    email = payload.get("email", "")
    if not is_admin_email(email):
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")
    return payload


# ── Rotas ──────────────────────────────────────────────────────────────────

@app.post("/login")
async def login(request: Request):
    data = await request.json()
    email = data.get("email")
    password = data.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="E-mail e senha são obrigatórios")

    result = verify_password_with_firebase(email, password)
    uid = result["localId"]
    display_name = result.get("displayName") or get_user_display_name(uid, email)

    db.get_or_create_user(uid, email=email, display_name=display_name, is_admin=is_admin_email(email))
    write_activity(uid, "login", request=request)
    return JSONResponse(session_payload(uid, email, display_name, result.get("idToken", "")))


@app.post("/register")
async def register(request: Request):
    data = await request.json()
    email = data.get("email")
    password = data.get("password")
    display_name = (data.get("display_name") or "").strip()
    if not email or not password:
        raise HTTPException(status_code=400, detail="E-mail e senha são obrigatórios")
    if not display_name:
        raise HTTPException(status_code=400, detail="Informe o nome para exibir no painel")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos 6 caracteres")

    login_result = register_with_firebase_rest(email, password, display_name)
    uid = login_result.get("localId")

    db.get_or_create_user(uid, email=email, display_name=display_name, is_admin=is_admin_email(email))
    write_activity(uid, "conta criada", request=request)

    payload = session_payload(
        uid, email, display_name, login_result.get("idToken", ""),
        extra={"status": "created"},
    )
    return JSONResponse(payload)


@app.get("/profile/{user_id}")
async def get_profile(user_id: str):
    user = db.get_user(user_id)
    if user:
        return JSONResponse({
            "user": user_id,
            "display_name": user.get("display_name") or get_user_display_name(user_id, user.get("email")),
            "email": user.get("email", ""),
            "enabled_apis": user_enabled_apis(user_id),
        })
    return JSONResponse({
        "user": user_id,
        "display_name": get_user_display_name(user_id),
        "email": "",
        "enabled_apis": DEFAULT_SOURCES[:],
    })


@app.patch("/profile")
async def update_profile(request: Request):
    data = await request.json()
    user_id = data.get("user_id")
    display_name = (data.get("display_name") or "").strip()
    email = data.get("email")
    if not user_id:
        raise HTTPException(status_code=400, detail="Usuário não identificado")
    if "enabled_apis" in data:
        raise HTTPException(
            status_code=403,
            detail="Somente o administrador pode ativar ou desativar APIs de uma conta.",
        )
    if not display_name:
        raise HTTPException(status_code=400, detail="Informe um nome válido")
    db.update_user_name(user_id, display_name)
    write_activity(user_id, "atualizou apelido", {"display_name": display_name}, request)
    return JSONResponse({"status": "updated", "user": user_id, "display_name": display_name})


@app.get("/apis")
async def list_apis():
    return JSONResponse({"apis": AVAILABLE_APIS, "defaults": DEFAULT_SOURCES})


@app.get("/search")
async def search_data(
    request: Request,
    q: str = Query(..., min_length=1),
    user_id: str = Query(..., min_length=1),
):
    enabled = user_enabled_apis(user_id)
    if not enabled:
        raise HTTPException(status_code=403, detail="Nenhuma API está ativa para esta conta. Peça ao administrador.")
    result = run_search(q, enabled)
    write_activity(user_id, f"busca por {q}", {"query": q, "sources": enabled}, request)
    if not result["fields"]:
        messages = [err.get("detail") for err in result["errors"] if err.get("detail")]
        detail = messages[0] if messages else "Nenhuma API retornou dados para essa informação."
        raise HTTPException(status_code=404, detail=detail)
    return JSONResponse(result)


@app.get("/health")
async def health():
    return JSONResponse({
        "status": "ok",
        "firebase_key": bool(FIREBASE_WEB_API_KEY),
        "admin_configured": bool(ADMIN_EMAIL),
        "database": "sqlite",
    })


@app.get("/", response_class=HTMLResponse)
async def root():
    site = os.getenv("FRONTEND_URL", "https://painel-25xg-silk.vercel.app").rstrip("/")
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Painel de Dados — API</title>
  <style>
    body {{ margin:0; min-height:100vh; display:grid; place-items:center;
      font-family: Inter, system-ui, sans-serif; background:#070B12; color:#E8EEF7; }}
    .card {{ max-width: 28rem; padding: 2rem; border: 1px solid rgba(58,167,255,.25);
      border-radius: 1.25rem; background: rgba(15,22,34,.8); }}
    a {{ color:#3AA7FF; }}
    p {{ color:#8492A6; line-height:1.5; }}
    code {{ color:#FFB648; font-size: .85rem; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>Esta URL é a API</h1>
    <p>O site do painel não fica no Render. Abra o frontend na Vercel:</p>
    <p><a href="{site}">{site}</a></p>
    <p>Teste da API: <a href="/health"><code>/health</code></a></p>
  </div>
</body>
</html>"""


@app.post("/log")
async def log_activity_endpoint(request: Request):
    data = await request.json()
    user_id = data.get("user_id")
    action = data.get("action")
    if not user_id or not action:
        raise HTTPException(status_code=400, detail="user_id e action são obrigatórios")
    write_activity(user_id, action, request=request)
    return JSONResponse({"status": "logged"})


# ── Admin ──────────────────────────────────────────────────────────────────

@app.get("/admin/accounts")
async def admin_accounts(authorization: Optional[str] = Header(None)):
    _verify_admin_token(authorization)
    users = db.list_all_users()
    accounts = []
    for u in users:
        accounts.append({
            "user": u["uid"],
            "email": u.get("email", ""),
            "display_name": u.get("display_name", "Usuário"),
            "disabled": False,
            "enabled_apis": u.get("enabled_apis", DEFAULT_SOURCES[:]),
            "created_at": u.get("created_at"),
            "is_admin": is_admin_email(u.get("email")),
        })
    return JSONResponse({"accounts": accounts, "apis": AVAILABLE_APIS})


@app.get("/admin/accounts/{user_id}/history")
async def admin_history(user_id: str, authorization: Optional[str] = Header(None)):
    _verify_admin_token(authorization)
    items = db.get_user_history(user_id)
    return JSONResponse({"history": items})


@app.patch("/admin/accounts/{user_id}/apis")
async def admin_update_apis(user_id: str, request: Request, authorization: Optional[str] = Header(None)):
    admin = _verify_admin_token(authorization)
    data = await request.json()
    enabled_apis = data.get("enabled_apis")
    if not isinstance(enabled_apis, list):
        raise HTTPException(status_code=400, detail="Informe a lista enabled_apis")
    allowed = {api["id"] for api in AVAILABLE_APIS}
    cleaned = [src for src in enabled_apis if src in allowed]

    db.update_user_apis(user_id, cleaned)
    write_activity(
        user_id,
        "admin alterou APIs",
        {"enabled_apis": cleaned, "admin": admin.get("email")},
        request,
    )
    return JSONResponse({"status": "updated", "user": user_id, "enabled_apis": cleaned})


# ── Tickets ────────────────────────────────────────────────────────────────

@app.post("/tickets")
async def create_ticket(request: Request):
    data = await request.json()
    user_id = data.get("user_id")
    user_email = data.get("user_email", "")
    category = data.get("category", "bug")
    message = (data.get("message") or "").strip()
    if not user_id or not message:
        raise HTTPException(status_code=400, detail="user_id e message são obrigatórios")
    if category not in ("bug", "ideia", "outro"):
        category = "outro"
    if len(message) > 2000:
        raise HTTPException(status_code=400, detail="Mensagem muito longa (máx. 2000 caracteres)")
    result = db.create_ticket(user_id, user_email, category, message)
    write_activity(user_id, f"ticket criado: {category}", {"ticket_id": result["id"]}, request)
    return JSONResponse({"status": "created", **result})


@app.get("/admin/tickets")
async def admin_tickets(
    authorization: Optional[str] = Header(None),
    status: Optional[str] = Query(None),
):
    _verify_admin_token(authorization)
    status_filter = status if status in ("aberto", "resolvido") else None
    tickets = db.list_tickets(status_filter)
    open_count = db.count_open_tickets()
    return JSONResponse({"tickets": tickets, "open_count": open_count})


@app.patch("/admin/tickets/{ticket_id}")
async def admin_resolve_ticket(ticket_id: int, request: Request, authorization: Optional[str] = Header(None)):
    admin = _verify_admin_token(authorization)
    result = db.resolve_ticket(ticket_id)
    write_activity(
        admin.get("user_id", "admin"),
        f"ticket #{ticket_id} resolvido",
        {"ticket_id": ticket_id, "admin": admin.get("email")},
        request,
    )
    return JSONResponse(result)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

