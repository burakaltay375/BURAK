"""
Otel Akıllı Operasyon Merkezi - FastAPI Backend
Hotel Smart Operations Center

- JWT auth (email + password, bcrypt)
- AI Orchestrator (Claude Sonnet 4.5) for guest requests
- Voice transcription (OpenAI Whisper-1)
- Request lifecycle (state machine): ALINDI -> PERSONEL_GIDIYOR -> TAMAMLANDI / REDDEDILDI
"""
import os
import json
import uuid
import logging
import asyncio
import tempfile
import re
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any, Literal

import bcrypt
import jwt as pyjwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
JWT_ALG = "HS256"
JWT_TTL_HOURS = 24 * 7

# --------------------------------------------------------------------------
# DB
# --------------------------------------------------------------------------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# --------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("hotel-ops")

# --------------------------------------------------------------------------
# App
# --------------------------------------------------------------------------
app = FastAPI(title="Otel Akıllı Operasyon Merkezi")
api = APIRouter(prefix="/api")

security = HTTPBearer(auto_error=False)

DEPARTMENTS = {
    "kuru_temizleme": "Kuru Temizleme",
    "oda_servisi": "Oda Servisi",
    "teknik_destek": "Teknik Destek",
    "housekeeping": "Housekeeping",
    "vale": "Vale",
}

STATUS_FLOW = ["ALINDI", "PERSONEL_GIDIYOR", "TAMAMLANDI"]

# --------------------------------------------------------------------------
# Models
# --------------------------------------------------------------------------
class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Literal["guest", "staff", "admin"]
    department: Optional[str] = None
    room_no: Optional[str] = None

class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["guest", "staff", "admin"] = "guest"
    department: Optional[str] = None
    room_no: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class AuthOut(BaseModel):
    token: str
    user: UserPublic

class ChatIn(BaseModel):
    message: str
    session_id: Optional[str] = None

class ChatOut(BaseModel):
    session_id: str
    reply: str
    ready: bool
    request_id: Optional[str] = None
    parsed: Optional[Dict[str, Any]] = None

class RequestOut(BaseModel):
    id: str
    guest_id: str
    guest_name: str
    room_no: str
    departman: str
    hizmet_turu: str
    zaman: str
    detay: str
    oncelik: Literal["DUSUK", "ORTA", "YUKSEK"]
    status: Literal["ALINDI", "PERSONEL_GIDIYOR", "TAMAMLANDI", "REDDEDILDI"]
    assigned_staff_id: Optional[str] = None
    assigned_staff_name: Optional[str] = None
    proof_photo: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: str
    updated_at: str

class CompleteIn(BaseModel):
    proof_photo: str  # base64 data URI or raw base64

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(cred: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if not cred:
        raise HTTPException(status_code=401, detail="Yetki gerekli")
    try:
        payload = pyjwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Geçersiz token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")
    return user

def public_user(u: dict) -> UserPublic:
    return UserPublic(
        id=u["id"], email=u["email"], name=u["name"], role=u["role"],
        department=u.get("department"), room_no=u.get("room_no"),
    )

def public_request(r: dict) -> RequestOut:
    return RequestOut(
        id=r["id"], guest_id=r["guest_id"], guest_name=r["guest_name"],
        room_no=r["room_no"], departman=r["departman"], hizmet_turu=r["hizmet_turu"],
        zaman=r["zaman"], detay=r["detay"], oncelik=r["oncelik"], status=r["status"],
        assigned_staff_id=r.get("assigned_staff_id"),
        assigned_staff_name=r.get("assigned_staff_name"),
        proof_photo=r.get("proof_photo"),
        completed_at=r.get("completed_at"),
        created_at=r["created_at"], updated_at=r["updated_at"],
    )

# --------------------------------------------------------------------------
# Orchestrator (rule-based + Claude Sonnet 4.5)
# --------------------------------------------------------------------------
DEPT_KEYWORDS = {
    "kuru_temizleme": ["kuru temizleme", "yıkama", "yikama", "ütü", "utu", "leke", "kıyafet", "kiyafet", "elbise", "takım"],
    # Teknik servis: tamirat ve arıza işleri (klima, TV, cam, musluk vb.)
    "teknik_destek": [
        "arıza", "ariza", "lamba", "ampul", "tesisat", "klima", "elektrik",
        "tv", "televizyon", "musluk", "sıcak su", "sicak su", "wifi", "internet",
        "çalışmıyor", "calismiyor", "bozuk", "cam", "pencere", "kapı kilidi",
        "kapı", "kilit", "duş", "dus", "tuvalet tıkalı", "lavabo",
    ],
    # Housekeeping: yiyecek, içecek, havlu, çarşaf, temizlik (oda servisi de buraya)
    "housekeeping": [
        # Temizlik / textile
        "havlu", "çarşaf", "carsaf", "temizlik", "yatak", "tuvalet kağıdı", "sabun",
        "şampuan", "sampuan", "oda temizliği", "diş fırçası", "terlik",
        # Yiyecek / içecek (oda servisi)
        "oda servisi", "yemek", "kahvaltı", "kahvalti", "akşam yemeği", "öğle yemeği",
        "içecek", "icecek", "kahve", "espresso", "latte", "çay", "cay", "su",
        "tost", "burger", "sandviç", "sandvic", "sandvi", "meyve", "pasta", "tatlı",
    ],
    "vale": ["vale", "araba", "araç", "park", "otopark", "anahtar"],
}

PRIORITY_KEYWORDS = {
    "YUKSEK": ["acil", "hemen", "şimdi", "simdi", "çok önemli", "kritik", "tehlikeli"],
    "DUSUK": ["acil değil", "müsait olunca", "vakit varsa", "yarın", "yarin"],
}

def rule_based_extract(text: str) -> Dict[str, Any]:
    t = text.lower()
    out: Dict[str, Any] = {"departman": None, "oda_no": None, "zaman": None,
                           "hizmet_turu": None, "detay": text.strip(), "oncelik": "ORTA"}
    for dept, kws in DEPT_KEYWORDS.items():
        if any(k in t for k in kws):
            out["departman"] = dept
            out["hizmet_turu"] = DEPARTMENTS[dept]
            break
    m = re.search(r"oda\s*(?:no(?:su)?\s*[:\-]?\s*)?(\d{2,4})", t)
    if m:
        out["oda_no"] = m.group(1)
    m = re.search(r"(\d{1,2})[:\.](\d{2})", t)
    if m:
        out["zaman"] = f"{int(m.group(1)):02d}:{m.group(2)}"
    else:
        m2 = re.search(r"saat\s+(\d{1,2})", t)
        if m2:
            out["zaman"] = f"{int(m2.group(1)):02d}:00"
    for pri, kws in PRIORITY_KEYWORDS.items():
        if any(k in t for k in kws):
            out["oncelik"] = pri
            break
    return out

ORCH_SYSTEM = """Sen "Otel Akıllı Operasyon Merkezi" yapay zekasısın (AI Concierge). Misafirlerin taleplerini dinler, niyetlerini analiz eder ve İLGİLİ DEPARTMANA yönlendirirsin.

AKILLI YÖNLENDİRME KURALLARI:
- housekeeping (Kat Hizmetleri):
    • Yiyecek / içecek: yemek, kahvaltı, kahve, espresso, çay, su, tost, sandviç, burger, meyve, pasta, tatlı, oda servisi
    • Tekstil / temizlik malzemesi: havlu, çarşaf, sabun, şampuan, terlik, oda temizliği
- teknik_destek (Teknik Servis / Maintenance):
    • Tamirat / arıza işleri: klima, TV, televizyon, cam, pencere, musluk, lavabo, duş, lamba, ampul, elektrik, wifi, internet, kapı, kilit, sıcak su, "çalışmıyor", "bozuk"
- kuru_temizleme: Yıkama, ütü, leke çıkarma, kıyafet bakımı
- vale: Araç park etme / getirme, otopark, anahtar

ÖNEMLİ DAVRANIŞLAR:
1. GENEL SORULAR (otel hakkında bilgi, çalışma saatleri, restoran tavsiyesi, hava durumu, "merhaba" gibi sohbet) → ASLA talep oluşturma. ready=false, request=null. reply'da nazikçe ve faydalı şekilde kendin cevap ver.
2. EYLEMLİ TALEPLER (yukarıdaki kategorilere giren somut bir hizmet isteği) → İlgili departmana yönlendir.
3. Eksik bilgi varsa (oda no, saat, spesifik detay) nezaketle sor; ready=false, request=null.
4. Tüm bilgiler tamamsa: ready=true ve request dolu olsun; reply'da "talebiniz alındı ve ... departmanına iletildi" tarzı bir onay ver.
5. Departman SADECE bu 4'ten biri olabilir: housekeeping, teknik_destek, kuru_temizleme, vale.

YANIT FORMATI (HER ZAMAN sadece geçerli JSON, başka metin yok):
{
  "reply": "<misafire göstereceğin nazik kısa Türkçe cevap>",
  "ready": true/false,
  "request": {
    "departman": "housekeeping|teknik_destek|kuru_temizleme|vale",
    "oda_no": "XXX",
    "hizmet_turu": "Kısa tanım",
    "zaman": "HH:MM",
    "detay": "Ek bilgiler",
    "oncelik": "DUSUK|ORTA|YUKSEK"
  }
}

ÖNEMLİ: Sadece JSON dön. Markdown bloğu, açıklama yok. Sadece ham JSON. "request" alanı null olabilir, bu durumda atla veya null koy."""


async def call_llm(session_id: str, message: str, history: List[dict]) -> Dict[str, Any]:
    """Call Claude Sonnet 4.5 via emergentintegrations. Returns parsed dict or raises."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=ORCH_SYSTEM,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    # Replay history (kept short)
    full_text = ""
    for h in history[-8:]:
        full_text += f"[{h['role']}]: {h['content']}\n"
    full_text += f"[user]: {message}"
    resp = await chat.send_message(UserMessage(text=full_text))
    text = str(resp).strip()
    # Strip markdown fences if any
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def fallback_orchestrate(message: str, history: List[dict]) -> Dict[str, Any]:
    """Pure rule-based fallback when LLM unavailable."""
    # Aggregate context from previous user messages
    full = " ".join([h["content"] for h in history if h["role"] == "user"] + [message])
    parsed = rule_based_extract(full)
    missing = []
    if not parsed["departman"]:
        return {"reply": "Tabii, size yardımcı olmaktan mutluluk duyarım. Hangi konuda yardıma ihtiyacınız var? (oda servisi, kuru temizleme, teknik destek, housekeeping veya vale)", "ready": False, "request": None}
    if not parsed["oda_no"]:
        missing.append("oda numaranız")
    if not parsed["zaman"]:
        missing.append("istediğiniz saat")
    if missing:
        ask = " ve ".join(missing)
        return {"reply": f"Anladım, {DEPARTMENTS[parsed['departman']]} talebiniz için lütfen {ask} bilgisini paylaşır mısınız?", "ready": False, "request": None}
    parsed["hizmet_turu"] = parsed["hizmet_turu"] or DEPARTMENTS[parsed["departman"]]
    return {
        "reply": f"Tabii. {parsed['oda_no']} numaralı odanız için {DEPARTMENTS[parsed['departman']]} talebiniz saat {parsed['zaman']} için alındı ve ilgili departmana iletildi.",
        "ready": True,
        "request": parsed,
    }


async def orchestrate(session_id: str, message: str, history: List[dict]) -> Dict[str, Any]:
    if EMERGENT_LLM_KEY:
        try:
            return await call_llm(session_id, message, history)
        except Exception as e:
            logger.warning(f"LLM failed, falling back to rules: {e}")
    return fallback_orchestrate(message, history)

# --------------------------------------------------------------------------
# Auth endpoints
# --------------------------------------------------------------------------
@api.post("/auth/register", response_model=AuthOut)
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(409, "Bu e-posta zaten kayıtlı")
    if body.role == "staff" and body.department not in DEPARTMENTS:
        raise HTTPException(400, "Geçerli bir departman seçin")
    user = {
        "id": str(uuid.uuid4()),
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": body.role,
        "department": body.department if body.role == "staff" else None,
        "room_no": body.room_no if body.role == "guest" else None,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user.copy())
    return AuthOut(token=make_token(user["id"]), user=public_user(user))

@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    u = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not u or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(401, "E-posta veya şifre hatalı")
    return AuthOut(token=make_token(u["id"]), user=public_user(u))

@api.get("/auth/me", response_model=UserPublic)
async def me(u: dict = Depends(get_current_user)):
    return public_user(u)

# --------------------------------------------------------------------------
# Chat / Orchestrator
# --------------------------------------------------------------------------
@api.post("/chat", response_model=ChatOut)
async def chat(body: ChatIn, u: dict = Depends(get_current_user)):
    if u["role"] != "guest":
        raise HTTPException(403, "Sadece misafirler kullanabilir")
    session_id = body.session_id or str(uuid.uuid4())

    # Load history
    history_docs = await db.chat_messages.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    history = [{"role": h["role"], "content": h["content"]} for h in history_docs]

    # Persist user message
    await db.chat_messages.insert_one({
        "id": str(uuid.uuid4()), "session_id": session_id, "user_id": u["id"],
        "role": "user", "content": body.message, "created_at": now_iso(),
    })

    # If user has a known room, inject hint
    augmented = body.message
    if u.get("room_no") and "oda" not in body.message.lower():
        augmented = f"{body.message}\n(Sistem notu: misafirin kayıtlı odası {u['room_no']})"

    result = await orchestrate(session_id, augmented, history)
    reply = result.get("reply", "")
    ready = bool(result.get("ready"))
    req_data = result.get("request") or {}

    request_id = None
    parsed_clean = None
    if ready and req_data and req_data.get("departman") in DEPARTMENTS:
        # Normalize
        oda = str(req_data.get("oda_no") or u.get("room_no") or "").strip()
        if not oda:
            ready = False
            reply = "Lütfen oda numaranızı paylaşır mısınız?"
        else:
            req = {
                "id": str(uuid.uuid4()),
                "guest_id": u["id"],
                "guest_name": u["name"],
                "room_no": oda,
                "departman": req_data["departman"],
                "hizmet_turu": req_data.get("hizmet_turu") or DEPARTMENTS[req_data["departman"]],
                "zaman": req_data.get("zaman") or "—",
                "detay": req_data.get("detay") or body.message,
                "oncelik": (req_data.get("oncelik") or "ORTA").upper(),
                "status": "ALINDI",
                "assigned_staff_id": None,
                "assigned_staff_name": None,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
            if req["oncelik"] not in ("DUSUK", "ORTA", "YUKSEK"):
                req["oncelik"] = "ORTA"
            await db.requests.insert_one(req.copy())
            request_id = req["id"]
            parsed_clean = {k: req[k] for k in ("departman", "oda_no" if False else "room_no", "hizmet_turu", "zaman", "detay", "oncelik")}
            parsed_clean = {
                "departman": req["departman"], "oda_no": req["room_no"],
                "hizmet_turu": req["hizmet_turu"], "zaman": req["zaman"],
                "detay": req["detay"], "oncelik": req["oncelik"],
            }

    await db.chat_messages.insert_one({
        "id": str(uuid.uuid4()), "session_id": session_id, "user_id": u["id"],
        "role": "assistant", "content": reply, "created_at": now_iso(),
    })

    return ChatOut(session_id=session_id, reply=reply, ready=ready,
                   request_id=request_id, parsed=parsed_clean)

@api.get("/chat/history")
async def chat_history(session_id: str, u: dict = Depends(get_current_user)):
    docs = await db.chat_messages.find(
        {"session_id": session_id, "user_id": u["id"]}, {"_id": 0, "user_id": 0}
    ).sort("created_at", 1).to_list(200)
    return docs

# --------------------------------------------------------------------------
# Voice transcription
# --------------------------------------------------------------------------
@api.post("/voice/transcribe")
async def voice_transcribe(file: UploadFile = File(...), u: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "LLM key yapılandırılmamış")
    suffix = Path(file.filename or "audio.m4a").suffix or ".m4a"
    if suffix.lower().lstrip(".") not in ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"]:
        suffix = ".m4a"
    data = await file.read()
    try:
        from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        try:
            resp = await stt.transcribe(file=tmp_path, model="whisper-1",
                                        response_format="json", language="tr")
            text = resp.get("text") if isinstance(resp, dict) else getattr(resp, "text", str(resp))
            return {"text": text}
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
    except Exception as e:
        logger.error(f"Whisper failed: {e}")
        raise HTTPException(500, f"Ses çevrimi başarısız: {e}")

# --------------------------------------------------------------------------
# Requests (CRUD + lifecycle)
# --------------------------------------------------------------------------
@api.get("/requests/me", response_model=List[RequestOut])
async def my_requests(u: dict = Depends(get_current_user)):
    if u["role"] != "guest":
        raise HTTPException(403, "Sadece misafirler")
    docs = await db.requests.find({"guest_id": u["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [public_request(d) for d in docs]

@api.get("/requests/department", response_model=List[RequestOut])
async def department_queue(u: dict = Depends(get_current_user)):
    if u["role"] != "staff":
        raise HTTPException(403, "Sadece personel")
    docs = await db.requests.find(
        {"departman": u["department"], "status": "ALINDI"}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return [public_request(d) for d in docs]

@api.get("/requests/active", response_model=List[RequestOut])
async def active_jobs(u: dict = Depends(get_current_user)):
    if u["role"] != "staff":
        raise HTTPException(403, "Sadece personel")
    docs = await db.requests.find(
        {"departman": u["department"], "assigned_staff_id": u["id"], "status": "PERSONEL_GIDIYOR"},
        {"_id": 0},
    ).sort("updated_at", -1).to_list(200)
    return [public_request(d) for d in docs]

async def _update_status(req_id: str, new_status: str, staff: Optional[dict]):
    update = {"status": new_status, "updated_at": now_iso()}
    if new_status == "PERSONEL_GIDIYOR" and staff:
        update["assigned_staff_id"] = staff["id"]
        update["assigned_staff_name"] = staff["name"]
    r = await db.requests.find_one_and_update(
        {"id": req_id}, {"$set": update}, return_document=True
    )
    if not r:
        raise HTTPException(404, "Talep bulunamadı")
    r = await db.requests.find_one({"id": req_id}, {"_id": 0})
    return r

@api.post("/requests/{req_id}/accept", response_model=RequestOut)
async def accept_request(req_id: str, u: dict = Depends(get_current_user)):
    if u["role"] != "staff":
        raise HTTPException(403, "Sadece personel")
    r = await db.requests.find_one({"id": req_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Talep bulunamadı")
    if r["departman"] != u["department"]:
        raise HTTPException(403, "Departman uyuşmuyor")
    if r["status"] != "ALINDI":
        raise HTTPException(400, "Bu talep zaten işlenmiş")
    r = await _update_status(req_id, "PERSONEL_GIDIYOR", u)
    return public_request(r)

@api.post("/requests/{req_id}/reject", response_model=RequestOut)
async def reject_request(req_id: str, u: dict = Depends(get_current_user)):
    if u["role"] != "staff":
        raise HTTPException(403, "Sadece personel")
    r = await db.requests.find_one({"id": req_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Talep bulunamadı")
    if r["departman"] != u["department"]:
        raise HTTPException(403, "Departman uyuşmuyor")
    r = await _update_status(req_id, "REDDEDILDI", u)
    return public_request(r)

@api.post("/requests/{req_id}/complete", response_model=RequestOut)
async def complete_request(req_id: str, body: CompleteIn, u: dict = Depends(get_current_user)):
    if u["role"] != "staff":
        raise HTTPException(403, "Sadece personel")
    r = await db.requests.find_one({"id": req_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Talep bulunamadı")
    if r["assigned_staff_id"] != u["id"]:
        raise HTTPException(403, "Bu görev sizin değil")
    if r["status"] != "PERSONEL_GIDIYOR":
        raise HTTPException(400, "Görev aktif değil")
    proof = (body.proof_photo or "").strip()
    if not proof:
        raise HTTPException(400, "Kanıt fotoğrafı zorunludur")
    # Normalize to data URI if raw base64
    if not proof.startswith("data:"):
        proof = f"data:image/jpeg;base64,{proof}"
    if len(proof) > 8 * 1024 * 1024:
        raise HTTPException(400, "Fotoğraf çok büyük (maks 8MB)")
    update = {
        "status": "TAMAMLANDI",
        "updated_at": now_iso(),
        "completed_at": now_iso(),
        "proof_photo": proof,
    }
    await db.requests.update_one({"id": req_id}, {"$set": update})
    r = await db.requests.find_one({"id": req_id}, {"_id": 0})
    return public_request(r)

# --------------------------------------------------------------------------
# Admin
# --------------------------------------------------------------------------
@api.get("/admin/requests", response_model=List[RequestOut])
async def admin_all(u: dict = Depends(get_current_user)):
    if u["role"] != "admin":
        raise HTTPException(403, "Sadece yönetici")
    docs = await db.requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [public_request(d) for d in docs]

@api.get("/admin/stats")
async def admin_stats(u: dict = Depends(get_current_user)):
    if u["role"] != "admin":
        raise HTTPException(403, "Sadece yönetici")
    total = await db.requests.count_documents({})
    active = await db.requests.count_documents({"status": {"$in": ["ALINDI", "PERSONEL_GIDIYOR"]}})
    completed = await db.requests.count_documents({"status": "TAMAMLANDI"})
    urgent = await db.requests.count_documents({"oncelik": "YUKSEK", "status": {"$ne": "TAMAMLANDI"}})
    by_dept = {}
    for code, name in DEPARTMENTS.items():
        c = await db.requests.count_documents({"departman": code, "status": {"$in": ["ALINDI", "PERSONEL_GIDIYOR"]}})
        by_dept[code] = {"name": name, "active": c}
    return {"total": total, "active": active, "completed": completed, "urgent": urgent, "by_department": by_dept}

@api.get("/meta/departments")
async def meta_departments():
    return [{"code": k, "name": v} for k, v in DEPARTMENTS.items()]

# --------------------------------------------------------------------------
# Seed demo data
# --------------------------------------------------------------------------
async def seed_demo():
    if await db.users.count_documents({}) > 0:
        return
    logger.info("Seeding demo data...")
    users = [
        {"email": "misafir@hotel.com", "password": "misafir123", "name": "Ahmet Yılmaz", "role": "guest", "room_no": "204"},
        {"email": "misafir2@hotel.com", "password": "misafir123", "name": "Ayşe Demir", "role": "guest", "room_no": "315"},
        {"email": "kurutemizleme@hotel.com", "password": "personel123", "name": "Mehmet (Kuru Temizleme)", "role": "staff", "department": "kuru_temizleme"},
        {"email": "odaservisi@hotel.com", "password": "personel123", "name": "Selin (Oda Servisi)", "role": "staff", "department": "oda_servisi"},
        {"email": "teknik@hotel.com", "password": "personel123", "name": "Burak (Teknik)", "role": "staff", "department": "teknik_destek"},
        {"email": "housekeeping@hotel.com", "password": "personel123", "name": "Elif (Housekeeping)", "role": "staff", "department": "housekeeping"},
        {"email": "vale@hotel.com", "password": "personel123", "name": "Can (Vale)", "role": "staff", "department": "vale"},
        {"email": "admin@hotel.com", "password": "admin123", "name": "Operasyon Yöneticisi", "role": "admin"},
    ]
    for u in users:
        doc = {
            "id": str(uuid.uuid4()),
            "email": u["email"],
            "password_hash": hash_password(u["password"]),
            "name": u["name"],
            "role": u["role"],
            "department": u.get("department"),
            "room_no": u.get("room_no"),
            "created_at": now_iso(),
        }
        await db.users.insert_one(doc)

    guest1 = await db.users.find_one({"email": "misafir@hotel.com"}, {"_id": 0})
    guest2 = await db.users.find_one({"email": "misafir2@hotel.com"}, {"_id": 0})
    demo_reqs = [
        {"guest": guest1, "departman": "kuru_temizleme", "hizmet_turu": "Kuru Temizleme",
         "zaman": "14:00", "detay": "Lacivert takım elbise, yarın akşam için.", "oncelik": "ORTA", "status": "ALINDI"},
        {"guest": guest2, "departman": "oda_servisi", "hizmet_turu": "Kahvaltı",
         "zaman": "08:30", "detay": "Türk kahvaltısı, 2 kişilik.", "oncelik": "ORTA", "status": "ALINDI"},
        {"guest": guest1, "departman": "teknik_destek", "hizmet_turu": "Klima Arızası",
         "zaman": "şimdi", "detay": "Klima çalışmıyor, oda çok sıcak.", "oncelik": "YUKSEK", "status": "ALINDI"},
        {"guest": guest2, "departman": "housekeeping", "hizmet_turu": "Havlu",
         "zaman": "10:00", "detay": "2 adet ek havlu lütfen.", "oncelik": "DUSUK", "status": "TAMAMLANDI"},
    ]
    for r in demo_reqs:
        g = r["guest"]
        doc = {
            "id": str(uuid.uuid4()),
            "guest_id": g["id"], "guest_name": g["name"], "room_no": g["room_no"],
            "departman": r["departman"], "hizmet_turu": r["hizmet_turu"],
            "zaman": r["zaman"], "detay": r["detay"], "oncelik": r["oncelik"],
            "status": r["status"], "assigned_staff_id": None, "assigned_staff_name": None,
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.requests.insert_one(doc)
    logger.info("Seed complete.")

@app.on_event("startup")
async def on_start():
    await seed_demo()

@app.on_event("shutdown")
async def on_stop():
    client.close()

# --------------------------------------------------------------------------
# Mount + CORS
# --------------------------------------------------------------------------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)
