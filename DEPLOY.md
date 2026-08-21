# Painel de Dados — deploy e Firebase

## Firebase (obrigatório)

1. Console Firebase → Authentication → ative **E-mail/senha**.
2. Firestore → criar banco (modo produção).
3. Project settings → **Web API Key** → `FIREBASE_WEB_API_KEY`.
4. Project settings → Service accounts → Generate new private key.
   - Local: salve como `backend/serviceAccountKey.json`.
   - Render: cole o JSON inteiro em `FIREBASE_SERVICE_ACCOUNT_JSON` (uma linha).
5. Firestore Rules: publique `firebase/firestore.rules` (clientes não acessam direto).
6. Defina `ADMIN_EMAIL` com **o seu** e-mail Firebase. Só ele entra no dashboard admin.

## Render (backend 24h)

1. New Web Service → este repositório.
2. Root directory: `backend`.
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Env:
   - `FIREBASE_WEB_API_KEY`
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `ADMIN_EMAIL=seu-email@gmail.com`
   - `FRONTEND_ORIGINS=https://SEU-APP.vercel.app,http://localhost:5173,capacitor://localhost`
6. Copie a URL, ex: `https://painel-dados-api.onrender.com`

Plano free do Render pode “dormir” após inatividade. Plano pago fica 24h.

## Vercel (frontend)

1. New Project → pasta `frontend`.
2. Framework: Vite.
3. Env: `VITE_API_URL=https://painel-dados-api.onrender.com`
4. Deploy. O link da Vercel é o acesso do painel.

Depois, volte no Render e coloque o domínio da Vercel em `FRONTEND_ORIGINS`.

## APK (Capacitor)

No PC, com Node e Android Studio:

```bash
cd frontend
npm i
npm i -D @capacitor/cli
npm i @capacitor/core @capacitor/android
npm run build
npx cap init "Painel de Dados" com.paineldados.app --web-dir dist
npx cap add android
npx cap sync
npx cap open android
```

No Android Studio: Build → Build APK. O app chama o backend na nuvem (`VITE_API_URL` precisa estar no build).
