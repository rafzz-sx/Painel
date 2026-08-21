import os
from typing import Optional
import json
import urllib.request
import urllib.error
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, auth, firestore
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from search import AVAILABLE_APIS, DEFAULT_SOURCES, run_search

load_dotenv()

FIREBASE_WEB_API_KEY = os.getenv("FIREBASE_WEB_API_KEY")
ADMIN_EMAIL = (os.getenv("ADMIN_EMAIL") or "").strip().lower()


def init_firebase():
    if firebase_admin._apps:
        return
    raw_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or "serviceAccountKey.json"
    if raw_json:
        cred = credentials.Certificate(json.loads(raw_json))
    elif os.path.exists(key_path):
        cred = credentials.Certificate(key_path)
    else:
        raise RuntimeError(
            "Firebase não configurado. Defina FIREBASE_SERVICE_ACCOUNT_JSON "
            "ou coloque serviceAccountKey.json na pasta backend."
        )
    firebase_admin.initialize_app(cred)


init_firebase()
db = firestore.client()

if not FIREBASE_WEB_API_KEY:
    print("AVISO: FIREBASE_WEB_API_KEY não definida. O login vai falhar.")
if not ADMIN_EMAIL:
    print("AVISO: ADMIN_EMAIL não definida. O painel admin ficará inacessível.")

app = FastAPI(title="Painel de Dados API")

_default_origins = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost,capacitor://localhost,https://localhost"
)
origin_list = [
    item.strip()
    for item in os.getenv("FRONTEND_ORIGINS", _default_origins).split(",")
    if item.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origin_list,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


def user_enabled_apis(uid: str) -> list:
    doc = db.collection("users").document(uid).get()
    if doc.exists:
        stored = doc.to_dict().get("enabled_apis")
        if isinstance(stored, list) and stored:
            allowed = {api["id"] for api in AVAILABLE_APIS}
            return [src for src in stored if src in allowed]
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
    db.collection("user_activity").document().set(payload)


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
    doc = db.collection("users").document(uid).get()
    if doc.exists:
        stored = doc.to_dict().get("display_name")
        if stored:
            return stored
    try:
        user_record = auth.get_user(uid)
        if user_record.display_name:
            return user_record.display_name
    except Exception:
        pass
    if email:
        local = email.split("@")[0]
        return local.replace(".", " ").replace("_", " ").title()
    return "Usuário"


def update_user_display_name(uid: str, display_name: str, email: Optional[str] = None) -> str:
    display_name = display_name.strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="Informe um nome válido")
    auth.update_user(uid, display_name=display_name)
    user_ref = db.collection("users").document(uid)
    payload = {
        "display_name": display_name,
        "updated_at": datetime.now().isoformat(),
    }
    if email:
        payload["email"] = email
    if user_ref.get().exists:
        user_ref.update(payload)
    else:
        user_ref.set({
            **payload,
            "email": email or "",
            "enabled_apis": DEFAULT_SOURCES[:],
            "created_at": datetime.now().isoformat(),
        })
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
        with urllib.request.urlopen(req) as resp:
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


@app.post("/login")
async def login(request: Request):
    data = await request.json()
    email = data.get("email")
    password = data.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="E-mail e senha são obrigatórios")

    result = verify_password_with_firebase(email, password)
    uid = result["localId"]
    display_name = get_user_display_name(uid, email)
    user_ref = db.collection("users").document(uid)
    if not user_ref.get().exists:
        user_ref.set({
            "display_name": display_name,
            "email": email,
            "enabled_apis": DEFAULT_SOURCES[:],
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

    try:
        user_record = auth.create_user(email=email, password=password, display_name=display_name)
    except auth.EmailAlreadyExistsError:
        raise HTTPException(status_code=409, detail="Este e-mail já está cadastrado")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    db.collection("users").document(user_record.uid).set({
        "display_name": display_name,
        "email": email,
        "enabled_apis": DEFAULT_SOURCES[:],
        "created_at": datetime.now().isoformat(),
    })
    login_result = verify_password_with_firebase(email, password)
    write_activity(user_record.uid, "conta criada", request=request)
    payload = session_payload(
        login_result["localId"], email, display_name, login_result.get("idToken", ""),
        extra={"status": "created"},
    )
    return JSONResponse(payload)


@app.get("/profile/{user_id}")
async def get_profile(user_id: str):
    doc = db.collection("users").document(user_id).get()
    if doc.exists:
        data = doc.to_dict()
        return JSONResponse({
            "user": user_id,
            "display_name": data.get("display_name") or get_user_display_name(user_id, data.get("email")),
            "email": data.get("email", ""),
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
    try:
        auth.get_user(user_id)
    except auth.UserNotFoundError:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
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
    for user in auth.list_users().iterate_all():
        doc = db.collection("users").document(user.uid).get()
        data = doc.to_dict() if doc.exists else {}
        accounts.append({
            "user": user.uid,
            "email": user.email,
            "display_name": data.get("display_name") or user.display_name or get_user_display_name(user.uid, user.email),
            "disabled": bool(user.disabled),
            "enabled_apis": user_enabled_apis(user.uid),
            "created_at": data.get("created_at") or (
                datetime.fromtimestamp(user.user_metadata.creation_timestamp / 1000).isoformat()
                if user.user_metadata and user.user_metadata.creation_timestamp else None
            ),
            "is_admin": is_admin_email(user.email),
        })
    accounts.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return JSONResponse({"accounts": accounts, "apis": AVAILABLE_APIS})


@app.get("/admin/accounts/{user_id}/history")
async def admin_history(user_id: str, authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    docs = db.collection("user_activity").where("user_id", "==", user_id).stream()
    items = []
    for doc in docs:
        row = doc.to_dict()
        row["id"] = doc.id
        items.append(row)
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
    try:
        record = auth.get_user(user_id)
    except auth.UserNotFoundError:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    user_ref = db.collection("users").document(user_id)
    payload = {
        "enabled_apis": cleaned,
        "email": record.email or "",
        "updated_at": datetime.now().isoformat(),
    }
    if user_ref.get().exists:
        user_ref.update(payload)
    else:
        user_ref.set({
            **payload,
            "display_name": record.display_name or get_user_display_name(user_id, record.email),
            "created_at": datetime.now().isoformat(),
        })
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
