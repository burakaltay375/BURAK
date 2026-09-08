# Panter (BURAK)

Otel ve güvenlik operasyonları için tam yığın uygulama:

- **Backend** — FastAPI + MongoDB (`backend/`)
- **Pazarlama + Admin** — Next.js (`security-website/`)
- **Mobil** — Expo / React Native (`frontend/`, isteğe bağlı)

Kaynak: [burakaltay375/PANTER](https://github.com/burakaltay375/PANTER) (public). `BURAK` deposu özel olduğu için bu public kopya kullanıldı.

## Yerel çalıştırma

MongoDB, Python 3.12 ve Node.js 22 gerekir.

```bash
# 1. Ortam dosyaları
cp backend/.env.example backend/.env
cp security-website/.env.example security-website/.env.local

# backend/.env içinde admin girişini ayarlayın:
#   SYSTEM_ADMIN_EMAIL=admin@panter.local
#   SYSTEM_ADMIN_PASSWORD=PanterAdmin123!
#   JWT_SECRET=<uzun rastgele dize>
#   MONGO_URL=mongodb://127.0.0.1:27017

# 2. MongoDB (örnek: resmi community binary)
# mongod --dbpath /tmp/panter-mongo-data --bind_ip 127.0.0.1 --port 27017

# 3. Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-local.txt
uvicorn server:app --reload --host 0.0.0.0 --port 18080

# 4. Web (ayrı terminal)
cd security-website
npm install
npx next dev --hostname 0.0.0.0 --port 14321
```

Hazır script: `bash scripts/dev.sh`

| Servis | Adres |
|--------|--------|
| Site | http://127.0.0.1:14321 |
| Admin | http://127.0.0.1:14321/admin |
| API | http://127.0.0.1:18080/api |

Admin girişi, `backend/.env` içindeki `SYSTEM_ADMIN_EMAIL` / `SYSTEM_ADMIN_PASSWORD` değerleridir.

`security-website` tarayıcıdaki `/api` isteklerini FastAPI’ye yönlendirir (`PANTER_BACKEND_ORIGIN`).

Yapay zeka / ses özellikleri için tam `backend/requirements.txt` ve `EMERGENT_LLM_KEY` gerekir.
