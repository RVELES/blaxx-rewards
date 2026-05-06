# Deploy Blaxx Pontos: Fly.io (backend) + Netlify (front)

Tempo total: ~30 minutos. Custo: gratuito (free tier de ambos).

---

## Arquitetura final

```
[Celular / Browser]
        |
        v
  Netlify (frontend HTML/JS estatico, HTTPS, CDN global)
        |
   chamada fetch
        v
  Fly.io (backend Flask + SQLite em volume persistente)
```

---

## 1) Backend no Fly.io (~15 min)

### 1.1. Instale o flyctl

Windows (PowerShell como administrador):
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Confirme:
```powershell
fly version
```

### 1.2. Crie conta e faca login

```powershell
fly auth signup    # primeira vez (ou: fly auth login)
```

> Fly pede cartao de credito para evitar abuso, mas o free tier nao cobra
> nada se voce ficar dentro de 3 maquinas pequenas, 3GB de volume e ~160GB
> de banda/mes. O Blaxx cabe folgado no free.

### 1.3. Edite `backend/fly.toml`

Mude o `app = "blaxx-pontos-backend"` para um nome unico no mundo:
```toml
app = "blaxx-pontos-RICARDO"
```

### 1.4. Lance o app

Na pasta `backend/`:
```powershell
cd "C:\Ricardo Veles\Blaxx Pontos\blaxx\backend"

# Cria o volume persistente (1 GB) na regiao de Sao Paulo
fly volumes create blaxx_data --region gru --size 1

# Define segredos (nunca commitar)
fly secrets set SECRET_KEY="$(openssl rand -hex 32)"
fly secrets set CORS_ORIGINS="https://blaxx-pontos.netlify.app"
# Atualize CORS_ORIGINS depois com a URL real do Netlify

# Deploy
fly deploy
```

Em ~2-3 minutos voce ganha:
```
https://blaxx-pontos-RICARDO.fly.dev
```

### 1.5. Verifique

```powershell
curl https://blaxx-pontos-RICARDO.fly.dev/health
# {"status":"ok","service":"blaxx-pontos-backend"}

curl https://blaxx-pontos-RICARDO.fly.dev/pix/packages
# 4 pacotes JSON
```

### 1.6. Logs em tempo real (opcional)

```powershell
fly logs
```

---

## 2) Frontend no Netlify (~10 min)

### 2.1. Aponte o front para o backend

Edite `assets/blaxx-config.js`, descomente e troque a URL:
```js
window.BLAXX_API = "https://blaxx-pontos-RICARDO.fly.dev";
```

### 2.2. Suba para o Netlify (3 caminhos)

#### Caminho A - Drag & drop (mais rapido)

1. Acesse https://app.netlify.com/drop
2. Arraste a pasta `blaxx/` inteira para a area indicada
3. Em ~30 segundos voce ganha:
   ```
   https://blaxx-pontos-XXX.netlify.app
   ```

#### Caminho B - Conectado ao GitHub (recomendado)

1. Empurre o repo para GitHub (privado se quiser).
2. https://app.netlify.com → "Add new site" → "Import existing project"
3. Conecte GitHub, escolha o repo, branch `main`.
4. Netlify detecta o `netlify.toml` automaticamente.
5. Cada push vira deploy automatico.

#### Caminho C - Netlify CLI

```powershell
npm install -g netlify-cli
netlify login
cd "C:\Ricardo Veles\Blaxx Pontos\blaxx"
netlify deploy --prod --dir=.
```

### 2.3. Atualize o CORS no Fly.io com a URL real

```powershell
cd backend
fly secrets set CORS_ORIGINS="https://blaxx-pontos-XXX.netlify.app"
fly deploy   # redeploy para pegar o novo segredo
```

### 2.4. Pronto. Acesse no celular:

```
https://blaxx-pontos-XXX.netlify.app/login.html
```

Toque em "Adicionar a Tela de Inicio" no Safari (iOS) ou no banner do
Chrome (Android). Vira app instalado, com push, biometria, etc.

---

## 3) Manutencao

### Atualizar o backend
```powershell
cd backend
# Edita o codigo
fly deploy
```

### Atualizar o frontend
- Caminho A: re-arraste a pasta no /drop
- Caminho B: `git push` (deploy automatico)
- Caminho C: `netlify deploy --prod --dir=.`

### Trocar de SQLite para Postgres (quando crescer)

```powershell
fly postgres create --name blaxx-db --region gru
fly postgres attach blaxx-db --app blaxx-pontos-RICARDO
# Fly seta DATABASE_URL automaticamente. SQLAlchemy ja entende.
fly deploy
```

### Custo esperado

- Fly.io free tier: 3 VMs shared-cpu-1x com 256MB, 3GB volume, 160GB egress.
  O Blaxx em demo: ~50 MB de uso, 0 R$.
- Netlify free tier: 100 GB de banda/mes, builds ilimitados, HTTPS gratis.
  ~0 R$.

### Quando passar do free

- Fly.io: `Hobby Plan` US$ 5/mes (mais 3 VMs). Production-grade > US$ 25.
- Netlify: `Pro` US$ 19/mes (envs de preview, formularios).

---

## 4) Domínio próprio (opcional, ~R$ 40/ano)

1. Compre o dominio (Registro.br para `.com.br`, ou Namecheap/Cloudflare para `.com`).
2. **Frontend**: no Netlify, "Domain settings" → "Add custom domain" → `blaxxpontos.com.br`. Netlify gera DNS, voce aponta no registrador.
3. **Backend**: `fly certs add api.blaxxpontos.com.br`. Aponte CNAME no DNS para o app Fly. Atualize `BLAXX_API` no `blaxx-config.js`.
4. HTTPS automatico em ambos (Let's Encrypt).

---

## Troubleshooting

| Problema | Solucao |
|---|---|
| `Error: app name not unique` no Fly | Mude `app = ` no `fly.toml` |
| 502 no /health | Veja `fly logs` - geralmente o seed.py travou |
| CORS error no console do navegador | Atualize `CORS_ORIGINS` no Fly e refaca deploy |
| Login da Mariana nao funciona | Backend dorme no free tier - 1a request demora ~10s para acordar |
| Saldo zera | Volume nao montado direito - confirme `fly volumes list` |
