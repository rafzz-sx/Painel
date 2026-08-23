import os
from typing import Optional
from concurrent.futures import ThreadPoolExecutor
import json
import urllib.request
import urllib.error
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, auth, firestore
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from dotenv import load_dotenv
from search import AVAILABLE_APIS, DEFAULT_SOURCES, run_search

load_dotenv()

FIREBASE_WEB_API_KEY = os.getenv("FIREBASE_WEB_API_KEY")
ADMIN_EMAIL = (os.getenv("ADMIN_EMAIL") or "").strip().lower()


def _load_service_account_info():
    """Credencial Admin do Firebase (NÃO é a Web API Key)."""
    raw = (os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON") or "").strip()
    if raw:
        if (raw.startswith("'") and raw.endswith("'")) or (raw.startswith('"') and raw.endswith('"') and raw.count('{') == 0):
            raw = raw[1:-1]
        try:
            info = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                "FIREBASE_SERVICE_ACCOUNT_JSON não é um JSON válido. "
                "Cole o conteúdo inteiro do serviceAccountKey.json (incluindo { }). "
                f"Detalhe: {exc}"
            ) from exc
        if info.get("private_key"):
            info["private_key"] = str(info["private_key"]).replace("\\n", "\n")
        return info

    private_key = (os.getenv("FIREBASE_PRIVATE_KEY") or "").replace("\\n", "\n").strip()
    client_email = (os.getenv("FIREBASE_CLIENT_EMAIL") or "").strip()
    project_id = (os.getenv("FIREBASE_PROJECT_ID") or "").strip()
    if private_key and client_email and project_id:
        return {
            "type": "service_account",
            "project_id": project_id,
            "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID", ""),
            "private_key": private_key,
            "client_email": client_email,
            "client_id": os.getenv("FIREBASE_CLIENT_ID", ""),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        }

    key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or "serviceAccountKey.json"
    if os.path.exists(key_path):
        with open(key_path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    return None


_firebase_inited = False
db = None

def init_firebase():
    global _firebase_inited, db
    if firebase_admin._apps:
        _firebase_inited = True
        if db is None:
            try:
                db = firestore.client()
            except Exception as exc:
                print(f"Aviso Firestore client: {exc}")
        return True
    info = _load_service_account_info()
    if not info:
        print("AVISO: Credenciais Firebase Admin Service Account não encontradas. O painel funcionará com Firebase Web API.")
        return False
    try:
        firebase_admin.initialize_app(credentials.Certificate(info))
        _firebase_inited = True
        try:
            db = firestore.client()
        except Exception as exc:
            print(f"Aviso Firestore client: {exc}")
        return True
    except Exception as exc:
        print(f"Aviso ao inicializar Firebase Admin: {exc}")
        return False


try:
    init_firebase()
except Exception as _e:
    print(f"Aviso na inicialização do Firebase: {_e}")

app = FastAPI(title="Painel de Dados API")

_default_origins = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost,capacitor://localhost,https://localhost,"
    "https://painel-25xg-silk.vercel.app,https://painel-y9f9.onrender.com"
)
origin_list = [
    item.strip()
    for item in os.getenv("FRONTEND_ORIGINS", _default_origins).split(",")
    if item.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origin_list,
    allow_origin_regex=r"https://.*\.(vercel\.app|onrender\.com)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)


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


def require_admin(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Token de administrador ausente")
    token = authorization.split(" ", 1)[1].strip()
    try:
        decoded = auth.verify_id_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Sessão admin inválida ou expirada")
    if not is_admin_email(decoded.get("email")):
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")
    return decoded


_local_users = {}
_local_activity = []
_executor = ThreadPoolExecutor(max_workers=4)


def _safe_firestore_get_user(uid: str):
    if db is None:
        return None
    try:
        doc = db.collection("users").document(uid).get(timeout=2)
        if doc.exists:
            data = doc.to_dict()
            _local_users[uid] = {**_local_users.get(uid, {}), **data}
            return data
    except Exception as e:
        print(f"Firestore get_user aviso: {e}")
    return None


def _safe_firestore_set_user(uid: str, data: dict):
    if db is None:
        return
    try:
        db.collection("users").document(uid).set(data, timeout=3)
    except Exception as e:
        print(f"Firestore set_user aviso: {e}")


def _safe_firestore_activity(payload: dict):
    if db is None:
        return
    try:
        db.collection("user_activity").document().set(payload, timeout=3)
    except Exception as e:
        print(f"Firestore activity aviso: {e}")


def user_enabled_apis(uid: str) -> list:
    cached = _local_users.get(uid, {}).get("enabled_apis")
    if isinstance(cached, list) and cached:
        allowed = {api["id"] for api in AVAILABLE_APIS}
        return [src for src in cached if src in allowed]
    
    # Tenta Firestore rapidamente em thread
    try:
        future = _executor.submit(_safe_firestore_get_user, uid)
        data = future.result(timeout=0.6)
        if data and isinstance(data.get("enabled_apis"), list):
            allowed = {api["id"] for api in AVAILABLE_APIS}
            return [src for src in data["enabled_apis"] if src in allowed]
    except Exception:
        pass
    return DEFAULT_SOURCES[:]


def write_activity(user_id: str, action: str, extra: Optional[dict] = None, request: Optional[Request] = None):
    payload = {
        "user_id": user_id,
        "action": action,
        "timestamp": datetime.now().isoformat(),
        "device_info": get_device_info(request),
    }
    if extra:
        payload.update(extra)
    _local_activity.insert(0, payload)
    if len(_local_activity) > 500:
        _local_activity.pop()
    # Executa no Firestore em background sem travar a requisição
    _executor.submit(_safe_firestore_activity, payload)


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
    cached = _local_users.get(uid, {}).get("display_name")
    if cached:
        return cached
    if email:
        local = email.split("@")[0]
        return local.replace(".", " ").replace("_", " ").title()
    return "Usuário"


def update_user_display_name(uid: str, display_name: str, email: Optional[str] = None) -> str:
    display_name = display_name.strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="Informe um nome válido")
    
    current = _local_users.get(uid, {})
    current["display_name"] = display_name
    if email:
        current["email"] = email
    current["updated_at"] = datetime.now().isoformat()
    _local_users[uid] = current

    # Persiste em background
    payload = {
        "display_name": display_name,
        "email": email or current.get("email", ""),
        "enabled_apis": current.get("enabled_apis", DEFAULT_SOURCES[:]),
        "updated_at": current["updated_at"],
    }
    _executor.submit(_safe_firestore_set_user, uid, payload)
    return display_name


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
                    "returnSecureToken": True
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
    
    _local_users[uid] = {
        **_local_users.get(uid, {}),
        "display_name": display_name,
        "email": email,
        "enabled_apis": _local_users.get(uid, {}).get("enabled_apis", DEFAULT_SOURCES[:]),
    }

    _executor.submit(_safe_firestore_set_user, uid, {
        "display_name": display_name,
        "email": email,
        "enabled_apis": _local_users[uid]["enabled_apis"],
        "created_at": datetime.now().isoformat(),
    })
    
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

    _local_users[uid] = {
        "display_name": display_name,
        "email": email,
        "enabled_apis": DEFAULT_SOURCES[:],
        "created_at": datetime.now().isoformat(),
    }

    _executor.submit(_safe_firestore_set_user, uid, _local_users[uid])
    write_activity(uid, "conta criada", request=request)

    payload = session_payload(
        uid, email, display_name, login_result.get("idToken", ""),
        extra={"status": "created"},
    )
    return JSONResponse(payload)


@app.get("/profile/{user_id}")
async def get_profile(user_id: str):
    cached = _local_users.get(user_id)
    if cached:
        return JSONResponse({
            "user": user_id,
            "display_name": cached.get("display_name") or get_user_display_name(user_id, cached.get("email")),
            "email": cached.get("email", ""),
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
    updated_name = update_user_display_name(user_id, display_name, email)
    write_activity(user_id, "atualizou apelido", {"display_name": updated_name}, request)
    return JSONResponse({"status": "updated", "user": user_id, "display_name": updated_name})


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
async def log_activity(request: Request):
    data = await request.json()
    user_id = data.get("user_id")
    action = data.get("action")
    if not user_id or not action:
        raise HTTPException(status_code=400, detail="user_id e action são obrigatórios")
    write_activity(user_id, action, request=request)
    return JSONResponse({"status": "logged"})


@app.get("/admin/accounts")
async def admin_accounts(authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    accounts = []
    try:
        for user in auth.list_users().iterate_all():
            data = _local_users.get(user.uid, {})
            if not data and db is not None:
                try:
                    doc = db.collection("users").document(user.uid).get(timeout=2)
                    if doc.exists:
                        data = doc.to_dict()
                except Exception:
                    pass
            accounts.append({
                "user": user.uid,
                "email": user.email,
                "display_name": data.get("display_name") or user.display_name or get_user_display_name(user.uid, user.email),
                "disabled": bool(user.disabled),
                "enabled_apis": data.get("enabled_apis", user_enabled_apis(user.uid)),
                "created_at": data.get("created_at") or (
                    datetime.fromtimestamp(user.user_metadata.creation_timestamp / 1000).isoformat()
                    if user.user_metadata and user.user_metadata.creation_timestamp else None
                ),
                "is_admin": is_admin_email(user.email),
            })
    except Exception as exc:
        print(f"Aviso admin_accounts list_users: {exc}")
        # Retorna contas do cache local
        for uid, data in _local_users.items():
            accounts.append({
                "user": uid,
                "email": data.get("email", ""),
                "display_name": data.get("display_name", "Usuário"),
                "disabled": False,
                "enabled_apis": data.get("enabled_apis", DEFAULT_SOURCES[:]),
                "created_at": data.get("created_at"),
                "is_admin": is_admin_email(data.get("email")),
            })
    accounts.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return JSONResponse({"accounts": accounts, "apis": AVAILABLE_APIS})


@app.get("/admin/accounts/{user_id}/history")
async def admin_history(user_id: str, authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    items = [act for act in _local_activity if act.get("user_id") == user_id]
    if db is not None and len(items) < 10:
        try:
            docs = db.collection("user_activity").where("user_id", "==", user_id).stream(timeout=3)
            for doc in docs:
                row = doc.to_dict()
                row["id"] = doc.id
                if not any(it.get("timestamp") == row.get("timestamp") for it in items):
                    items.append(row)
        except Exception:
            pass
    items.sort(key=lambda item: item.get("timestamp") or "", reverse=True)
    return JSONResponse({"history": items[:200]})


@app.patch("/admin/accounts/{user_id}/apis")
async def admin_update_apis(user_id: str, request: Request, authorization: Optional[str] = Header(None)):
    admin = require_admin(authorization)
    data = await request.json()
    enabled_apis = data.get("enabled_apis")
    if not isinstance(enabled_apis, list):
        raise HTTPException(status_code=400, detail="Informe a lista enabled_apis")
    allowed = {api["id"] for api in AVAILABLE_APIS}
    cleaned = [src for src in enabled_apis if src in allowed]
    
    current = _local_users.get(user_id, {})
    current["enabled_apis"] = cleaned
    current["updated_at"] = datetime.now().isoformat()
    _local_users[user_id] = current

    payload = {
        "enabled_apis": cleaned,
        "email": current.get("email", ""),
        "updated_at": current["updated_at"],
    }
    _executor.submit(_safe_firestore_set_user, user_id, payload)
    
    write_activity(
        user_id,
        "admin alterou APIs",
        {"enabled_apis": cleaned, "admin": admin.get("email")},
        request,
    )
    return JSONResponse({"status": "updated", "user": user_id, "enabled_apis": cleaned})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
