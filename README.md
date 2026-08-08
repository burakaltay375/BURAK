# Panter (BURAK)

Full-stack security operations platform:

- **Backend** — FastAPI + MongoDB (`backend/`)
- **Marketing + Admin** — Next.js (`security-website/`)
- **Mobile** — Expo / React Native (`frontend/`)

## Environment setup

Environment templates live in `.env.example` files (placeholders only). Copy them to local env files and replace placeholders with your own values. **Never commit real secrets.**

| Template | Copy to | Used by |
|----------|---------|---------|
| `backend/.env.example` | `backend/.env` | FastAPI API (`backend/server.py`) |
| `security-website/.env.example` | `security-website/.env.local` | Next.js landing + admin UI |
| `frontend/.env.example` | `frontend/.env` | Expo mobile app |
| [`.env.example`](.env.example) | *(reference only)* | Full list for the whole repo |

### 1. Create local env files

**macOS / Linux:**

```bash
cp backend/.env.example backend/.env
cp security-website/.env.example security-website/.env.local
cp frontend/.env.example frontend/.env
```

**Windows PowerShell:**

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item security-website\.env.example security-website\.env.local
Copy-Item frontend\.env.example frontend\.env
```

Then edit each local file:

- Set `SYSTEM_ADMIN_EMAIL` and `SYSTEM_ADMIN_PASSWORD` in `backend/.env` for admin login.
- Change `JWT_SECRET` to a long random string before any shared or production deployment.
- Point `MONGO_URL` at your MongoDB instance (local or Atlas).

### 2. Variables by app

**Backend (`backend/.env`)**

| Variable | Development | Production |
|----------|-------------|------------|
| `MONGO_URL` | Required | Required |
| `DB_NAME` | Required | Required |
| `JWT_SECRET` | Required | Required (strong random secret) |
| `SYSTEM_ADMIN_EMAIL` | Required | Required |
| `SYSTEM_ADMIN_PASSWORD` | Required | Required (strong password) |
| `OPENAI_API_KEY` | Required for reception AI | Required for reception AI |
| `OPENAI_MODEL` | Optional (`gpt-4o-mini`) | Optional (`gpt-4o` or `gpt-4o-mini`) |
| `OSM_USER_AGENT` | Optional; repository URL default is used | Recommended; identify the deployed Hospira instance |
| `IDENTITY_ENCRYPTION_KEY` | Optional | Strongly recommended |
| `EMERGENT_LLM_KEY` | Optional | Required if using AI / voice features |
| `RESEND_API_KEY` | Optional (emails logged only) | Required for real email |
| `EMAIL_FROM` | Optional | Required with Resend |

**security-website (`security-website/.env.local`)**

| Variable | Development | Production |
|----------|-------------|------------|
| `NEXT_PUBLIC_API_URL` | Required if backend is not on `http://localhost:8000/api` | Required (public URL, include `/api`) |
| `NEXT_PUBLIC_PANTER_API_URL` | Optional alias | Optional alias |

**frontend (`frontend/.env`)**

| Variable | Development | Production |
|----------|-------------|------------|
| `EXPO_PUBLIC_BACKEND_URL` | Required if backend is not on `http://localhost:8000` | Required (public API origin, no `/api` suffix) |

Keşfet and hotel previews use **Leaflet + OpenStreetMap** and require no map API key.
Nearby businesses come from the OpenStreetMap Overpass API. “Konumu Bul” calls
Nominatim only when the administrator presses the button; requests are cached and
rate-limited by the backend. Browser geolocation works only on HTTPS origins or
`localhost`.

The public `tile.openstreetmap.org` service is suitable for normal interactive use,
not bulk downloading or heavy production traffic. High-volume deployments should use
an OSM-compatible hosted tile provider or self-hosted tiles while retaining attribution.

**Optional frontend dev tooling** (commented in `frontend/.env.example`; not needed for normal app use):

- `METRO_CACHE_ROOT` — custom Metro cache directory
- `CMD_GUARD_RULES` — path to install-guard rules JSON
- `CMD_GUARD_DEBUG` — enable install-guard debug logging

### 3. Git and secrets

These local files must stay out of Git:

- `backend/.env`
- `security-website/.env.local`
- `frontend/.env`

Only the `.env.example` templates are tracked in the repository.

### 4. Run locally

MongoDB must be reachable at `MONGO_URL` before starting the backend.

```bash
# Backend
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

```bash
# Marketing + admin
cd security-website
npm install
npm run dev
# http://localhost:3000  |  admin: http://localhost:3000/admin
```

```bash
# Mobile (optional)
cd frontend
npm install
npm start
```

Sign in to `/admin` with the `SYSTEM_ADMIN_EMAIL` and `SYSTEM_ADMIN_PASSWORD` values from your local `backend/.env`.

## Project layout

| Path | Role |
|------|------|
| `backend/server.py` | FastAPI application entry |
| `backend/requirements.txt` | Python dependencies |
| `security-website/` | Next.js landing page + admin UI |
| `frontend/` | Expo mobile client |

## Production notes

- Use unique, strong values for `JWT_SECRET`, `SYSTEM_ADMIN_PASSWORD`, and `IDENTITY_ENCRYPTION_KEY`.
- Point `MONGO_URL` at a managed MongoDB service (for example Atlas) with a dedicated `DB_NAME`.
- Set `NEXT_PUBLIC_API_URL` to your public API URL including `/api`; set `EXPO_PUBLIC_BACKEND_URL` to the same host without `/api`.
- Configure `RESEND_API_KEY` and `EMAIL_FROM` if the app should send transactional email.
- Store production secrets in your host’s secret manager or server env — not in Git.
