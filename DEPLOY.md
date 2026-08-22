# Deploy — o que falta (Render + Vercel)

O site na Vercel já sobe. O backend no Render **cai** porque falta a **service account** do Firebase.

São **duas chaves diferentes**:

| Variável | O que é | Onde pega |
|---|---|---|
| `FIREBASE_WEB_API_KEY` | Web API Key (login de senha) | Firebase → Project settings → General |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | JSON da conta de serviço (Admin) | Firebase → Project settings → Service accounts → Generate new private key |

A Web API Key **não** inicia o Firebase Admin. Por isso o Render mostra `Firebase Admin não configurado`.

O “Enable Web Analytics” da Vercel **não tem nada a ver** com isso. Pode ignorar.

## URLs atuais

- Frontend: https://painel-25xg-silk.vercel.app
- Backend: https://painel-y9f9.onrender.com

---

## 1) Render — Environment (obrigatório)

Abra o serviço **Painel** → **Environment** → **Add Environment Variable**.

Adicione:

1. `FIREBASE_WEB_API_KEY`  
   A mesma Web API Key do Firebase (a que você já tem no `.env` local).

2. `ADMIN_EMAIL`  
   `rafaelolavo28@gmail.com`

3. `FRONTEND_ORIGINS`  
   `https://painel-25xg-silk.vercel.app,http://localhost:5173`

4. `FIREBASE_SERVICE_ACCOUNT_JSON`  
   No PC, na pasta `backend`:

   ```powershell
   python print_render_env.py
   ```

   Copie **a linha inteira** que aparecer (começa com `{"type":"service_account"...`) e cole no valor da variável no Render. Sem aspas em volta.

Salve. Em **Manual Deploy** → **Deploy latest commit** (ou aguarde o auto-deploy).

Quando funcionar, https://painel-y9f9.onrender.com/health deve responder algo como:

`{"status":"ok","firebase_key":true,"admin_configured":true}`

Se o JSON único falhar no Render, use em vez dele estas 3:

- `FIREBASE_PROJECT_ID` → `corretor-imoveis-89afb`
- `FIREBASE_CLIENT_EMAIL` → o `client_email` do `serviceAccountKey.json`
- `FIREBASE_PRIVATE_KEY` → o `private_key` completo, incluindo `-----BEGIN PRIVATE KEY-----`

## 2) Vercel — Environment

Projeto **painel-25xg** → **Settings** → **Environment Variables**:

- Nome: `VITE_API_URL`
- Valor: `https://painel-y9f9.onrender.com`

Marque Production. Depois **Deployments** → último deploy → **Redeploy**.

Sem isso o site continua tentando `localhost:8000` no navegador do visitante.

## 3) Testar

1. Abra https://painel-25xg-silk.vercel.app
2. Entre com e-mail/senha do Firebase
3. Com `rafaelolavo28@gmail.com` deve aparecer o botão **Admin**
4. No Admin: contas, APIs por conta, histórico

Plano **free** do Render dorme após inatividade. O primeiro acesso pode demorar ~1 minuto. Para 24h de verdade, use plano pago.

## 4) APK (depois que o site na nuvem estiver ok)

```powershell
cd frontend
npm i
npm i @capacitor/core @capacitor/android
npm i -D @capacitor/cli
npm run build
npx cap add android
npx cap sync
npx cap open android
```

No Android Studio: Build → Build APK.
