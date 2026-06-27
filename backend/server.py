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
import string
import secrets
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
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "onboarding@resend.dev")
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

# --- Reservations & Rooms ---
ReservationStatus = Literal["pending", "checked_in", "completed", "cancelled"]

class ReservationCreateIn(BaseModel):
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    check_in_date: str   # YYYY-MM-DD (required)
    check_out_date: str  # YYYY-MM-DD (required)
    room_number: Optional[str] = None  # may be assigned by admin later

class AdminReservationIn(BaseModel):
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    check_in_date: str
    check_out_date: str
    room_number: Optional[str] = None
    status: ReservationStatus = "pending"

class CheckinIn(BaseModel):
    email: EmailStr
    access_code: str
    new_password: str

class ReservationOut(BaseModel):
    id: str
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    room_number: Optional[str] = None
    check_in_date: Optional[str] = None
    check_out_date: Optional[str] = None
    status: ReservationStatus
    access_code: str
    user_id: Optional[str] = None
    email_sent: Optional[bool] = False
    created_at: str
    updated_at: str

class RoomIn(BaseModel):
    room_number: str
    type: Optional[str] = "Standard"

class RoomOut(BaseModel):
    id: str
    room_number: str
    type: str
    status: Literal["available", "occupied"]
    created_at: str

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

def public_reservation(r: dict) -> "ReservationOut":
    return ReservationOut(
        id=r["id"], customer_name=r["customer_name"],
        customer_email=r["customer_email"], customer_phone=r["customer_phone"],
        room_number=r.get("room_number"),
        check_in_date=r.get("check_in_date"),
        check_out_date=r.get("check_out_date"),
        status=r["status"],
        access_code=r["access_code"], user_id=r.get("user_id"),
        email_sent=bool(r.get("email_sent")),
        created_at=r["created_at"], updated_at=r["updated_at"],
    )

def public_room(r: dict) -> "RoomOut":
    return RoomOut(
        id=r["id"], room_number=r["room_number"], type=r.get("type") or "Standard",
        status=r.get("status") or "available", created_at=r["created_at"],
    )

def gen_access_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    # remove confusing chars
    alphabet = alphabet.replace("O", "").replace("0", "").replace("I", "").replace("1", "")
    return "".join(secrets.choice(alphabet) for _ in range(length))


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

def parse_iso_date(s: str) -> datetime:
    if not s or not _DATE_RE.match(s.strip()):
        raise HTTPException(400, "Tarih formatı YYYY-MM-DD olmalı")
    try:
        return datetime.strptime(s.strip(), "%Y-%m-%d")
    except ValueError as e:
        raise HTTPException(400, f"Geçersiz tarih: {e}")

def validate_stay_dates(check_in: str, check_out: str) -> tuple[str, str]:
    ci = parse_iso_date(check_in)
    co = parse_iso_date(check_out)
    if co <= ci:
        raise HTTPException(400, "Çıkış tarihi giriş tarihinden sonra olmalı")
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    if ci < today - timedelta(days=1):
        raise HTTPException(400, "Giriş tarihi geçmişte olamaz")
    return ci.strftime("%Y-%m-%d"), co.strftime("%Y-%m-%d")


def _format_tr_date(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        return datetime.strptime(iso, "%Y-%m-%d").strftime("%d.%m.%Y")
    except Exception:
        return iso


async def send_reservation_email(reservation: dict) -> bool:
    """Send reservation confirmation via Resend. Returns True if dispatched.
    If RESEND_API_KEY is empty, logs the email content (sandbox/dev mode)."""
    to = reservation["customer_email"]
    code = reservation["access_code"]
    name = reservation["customer_name"]
    ci = _format_tr_date(reservation.get("check_in_date"))
    co = _format_tr_date(reservation.get("check_out_date"))
    room = reservation.get("room_number") or "Otele girişte atanacak"
    subject = f"Rezervasyon Onayı · Kod: {code}"
    html = f"""<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#0F0F11;color:#F5F5F5;margin:0;padding:24px;">
<div style="max-width:520px;margin:0 auto;background:#1A1A1D;border:1px solid #26262A;border-radius:16px;padding:32px;">
  <h1 style="color:#D4AF37;font-family:Georgia,serif;margin:0 0 8px 0;">Hoş Geldiniz, {name}</h1>
  <p style="color:#D1D1D1;line-height:1.55;margin:0 0 24px 0;">Rezervasyonunuz başarıyla oluşturuldu. Aşağıdaki kodu otele giriş yaparken kullanacaksınız.</p>
  <div style="background:#3A3320;border:1px solid #D4AF37;border-radius:12px;padding:20px;text-align:center;margin:24px 0;">
    <div style="color:#F2E3B6;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Rezervasyon Kodu</div>
    <div style="color:#D4AF37;font-size:36px;font-weight:800;letter-spacing:6px;margin-top:8px;font-family:Georgia,serif;">{code}</div>
  </div>
  <table style="width:100%;color:#D1D1D1;font-size:14px;border-collapse:collapse;">
    <tr><td style="padding:8px 0;color:#A3A3A3;">Giriş</td><td style="padding:8px 0;text-align:right;">{ci}</td></tr>
    <tr><td style="padding:8px 0;color:#A3A3A3;">Çıkış</td><td style="padding:8px 0;text-align:right;">{co}</td></tr>
    <tr><td style="padding:8px 0;color:#A3A3A3;">Oda</td><td style="padding:8px 0;text-align:right;">{room}</td></tr>
  </table>
  <p style="color:#A3A3A3;font-size:12px;margin-top:24px;line-height:1.55;">Otele girişte uygulamamızdan "Otele Giriş" ekranını açıp e-postanızı, yukarıdaki kodu ve seçeceğiniz şifreyi girerek hesabınızı aktive edebilirsiniz. İyi konaklamalar dileriz.</p>
</div></body></html>"""

    if not RESEND_API_KEY:
        logger.info(f"[EMAIL SANDBOX] To: {to} | Subject: {subject} | Code: {code} (RESEND_API_KEY boş; log-only)")
        return False
    try:
        import requests
        resp = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"from": EMAIL_FROM, "to": [to], "subject": subject, "html": html},
            timeout=10,
        )
        if resp.status_code >= 400:
            logger.error(f"Resend hatası ({resp.status_code}): {resp.text}")
            return False
        logger.info(f"E-posta gönderildi → {to} (id: {resp.json().get('id')})")
        return True
    except Exception as e:
        logger.error(f"Resend gönderim hatası: {e}")
        return False

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
    if not u:
        # Check if there's a pending reservation under this email
        rsv = await db.reservations.find_one({"customer_email": body.email.lower(), "status": "pending"}, {"_id": 0})
        if rsv:
            raise HTTPException(401, "Rezervasyonunuz var ama henüz check-in yapmadınız. Lütfen 'Otele Giriş' (Check-in) ekranını kullanın.")
        raise HTTPException(401, "E-posta veya şifre hatalı")
    if not verify_password(body.password, u["password_hash"]):
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
# Reservations (public) + Check-in
# --------------------------------------------------------------------------
@api.post("/reservations", response_model=ReservationOut)
async def public_create_reservation(body: ReservationCreateIn):
    """Public endpoint — guest can reserve without password. Returns access_code."""
    email = body.customer_email.lower()
    ci, co = validate_stay_dates(body.check_in_date, body.check_out_date)
    # If user already exists (already checked in), block to avoid duplicates
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        raise HTTPException(409, "Bu e-posta zaten otele kayıtlı. Lütfen giriş yapın.")
    # Ensure unique access_code
    for _ in range(8):
        code = gen_access_code(6)
        if not await db.reservations.find_one({"access_code": code}):
            break
    doc = {
        "id": str(uuid.uuid4()),
        "customer_name": body.customer_name.strip(),
        "customer_email": email,
        "customer_phone": body.customer_phone.strip(),
        "room_number": (body.room_number or None),
        "check_in_date": ci,
        "check_out_date": co,
        "access_code": code,
        "status": "pending",
        "user_id": None,
        "email_sent": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.reservations.insert_one(doc.copy())
    sent = await send_reservation_email(doc)
    if sent:
        await db.reservations.update_one({"id": doc["id"]}, {"$set": {"email_sent": True}})
        doc["email_sent"] = True
    return public_reservation(doc)

@api.post("/checkin", response_model=AuthOut)
async def public_checkin(body: CheckinIn):
    """Guest activates account at hotel by providing access code + new password."""
    email = body.email.lower()
    code = body.access_code.strip().upper()
    if len(body.new_password) < 4:
        raise HTTPException(400, "Şifre en az 4 karakter olmalı")
    r = await db.reservations.find_one({"customer_email": email, "access_code": code}, {"_id": 0})
    if not r:
        raise HTTPException(401, "E-posta veya rezervasyon kodu hatalı")
    if r["status"] not in ("pending", "checked_in"):
        raise HTTPException(400, "Rezervasyon aktif değil")
    # If a user was already created for this reservation, update password; else create
    user = None
    if r.get("user_id"):
        user = await db.users.find_one({"id": r["user_id"]}, {"_id": 0})
    if not user:
        user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"password_hash": hash_password(body.new_password),
                      "room_no": r.get("room_number") or user.get("room_no"),
                      "name": r["customer_name"]}},
        )
        user = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    else:
        user = {
            "id": str(uuid.uuid4()),
            "email": email,
            "password_hash": hash_password(body.new_password),
            "name": r["customer_name"],
            "role": "guest",
            "department": None,
            "room_no": r.get("room_number"),
            "created_at": now_iso(),
        }
        await db.users.insert_one(user.copy())
    await db.reservations.update_one(
        {"id": r["id"]},
        {"$set": {"status": "checked_in", "user_id": user["id"], "updated_at": now_iso()}},
    )
    # Mark room occupied
    if r.get("room_number"):
        await db.rooms.update_one({"room_number": r["room_number"]}, {"$set": {"status": "occupied"}})
    return AuthOut(token=make_token(user["id"]), user=public_user(user))

# --------------------------------------------------------------------------
# Admin: Reservations & Rooms
# --------------------------------------------------------------------------
@api.get("/admin/reservations", response_model=List[ReservationOut])
async def admin_list_reservations(u: dict = Depends(get_current_user)):
    if u["role"] != "admin":
        raise HTTPException(403, "Sadece yönetici")
    docs = await db.reservations.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [public_reservation(d) for d in docs]

@api.post("/admin/reservations", response_model=ReservationOut)
async def admin_create_reservation(body: AdminReservationIn, u: dict = Depends(get_current_user)):
    if u["role"] != "admin":
        raise HTTPException(403, "Sadece yönetici")
    email = body.customer_email.lower()
    ci, co = validate_stay_dates(body.check_in_date, body.check_out_date)
    for _ in range(8):
        code = gen_access_code(6)
        if not await db.reservations.find_one({"access_code": code}):
            break
    doc = {
        "id": str(uuid.uuid4()),
        "customer_name": body.customer_name.strip(),
        "customer_email": email,
        "customer_phone": body.customer_phone.strip(),
        "room_number": body.room_number or None,
        "check_in_date": ci,
        "check_out_date": co,
        "access_code": code,
        "status": body.status,
        "user_id": None,
        "email_sent": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.reservations.insert_one(doc.copy())
    sent = await send_reservation_email(doc)
    if sent:
        await db.reservations.update_one({"id": doc["id"]}, {"$set": {"email_sent": True}})
        doc["email_sent"] = True
    return public_reservation(doc)

class AssignRoomIn(BaseModel):
    room_number: str

@api.post("/admin/reservations/{rid}/assign-room", response_model=ReservationOut)
async def admin_assign_room(rid: str, body: AssignRoomIn, u: dict = Depends(get_current_user)):
    if u["role"] != "admin":
        raise HTTPException(403, "Sadece yönetici")
    r = await db.reservations.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Rezervasyon bulunamadı")
    await db.reservations.update_one(
        {"id": rid}, {"$set": {"room_number": body.room_number, "updated_at": now_iso()}},
    )
    r = await db.reservations.find_one({"id": rid}, {"_id": 0})
    return public_reservation(r)

@api.post("/admin/reservations/{rid}/checkin", response_model=ReservationOut)
async def admin_approve_checkin(rid: str, u: dict = Depends(get_current_user)):
    """Admin manually marks a reservation as checked_in (without requiring guest to enter code).
    Note: the guest still needs to set a password via /api/checkin to actually log in."""
    if u["role"] != "admin":
        raise HTTPException(403, "Sadece yönetici")
    r = await db.reservations.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Rezervasyon bulunamadı")
    if r["status"] == "completed":
        raise HTTPException(400, "Tamamlanmış rezervasyon")
    await db.reservations.update_one(
        {"id": rid}, {"$set": {"status": "checked_in", "updated_at": now_iso()}},
    )
    if r.get("room_number"):
        await db.rooms.update_one({"room_number": r["room_number"]}, {"$set": {"status": "occupied"}})
    r = await db.reservations.find_one({"id": rid}, {"_id": 0})
    return public_reservation(r)

@api.post("/admin/reservations/{rid}/complete", response_model=ReservationOut)
async def admin_complete_reservation(rid: str, u: dict = Depends(get_current_user)):
    if u["role"] != "admin":
        raise HTTPException(403, "Sadece yönetici")
    r = await db.reservations.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Rezervasyon bulunamadı")
    await db.reservations.update_one(
        {"id": rid}, {"$set": {"status": "completed", "updated_at": now_iso()}},
    )
    if r.get("room_number"):
        await db.rooms.update_one({"room_number": r["room_number"]}, {"$set": {"status": "available"}})
    r = await db.reservations.find_one({"id": rid}, {"_id": 0})
    return public_reservation(r)

@api.post("/admin/reservations/{rid}/cancel", response_model=ReservationOut)
async def admin_cancel_reservation(rid: str, u: dict = Depends(get_current_user)):
    if u["role"] != "admin":
        raise HTTPException(403, "Sadece yönetici")
    r = await db.reservations.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Rezervasyon bulunamadı")
    await db.reservations.update_one(
        {"id": rid}, {"$set": {"status": "cancelled", "updated_at": now_iso()}},
    )
    if r.get("room_number"):
        await db.rooms.update_one({"room_number": r["room_number"]}, {"$set": {"status": "available"}})
    r = await db.reservations.find_one({"id": rid}, {"_id": 0})
    return public_reservation(r)

@api.get("/admin/rooms", response_model=List[RoomOut])
async def admin_list_rooms(u: dict = Depends(get_current_user)):
    if u["role"] != "admin":
        raise HTTPException(403, "Sadece yönetici")
    docs = await db.rooms.find({}, {"_id": 0}).sort("room_number", 1).to_list(500)
    return [public_room(d) for d in docs]

@api.post("/admin/rooms", response_model=RoomOut)
async def admin_create_room(body: RoomIn, u: dict = Depends(get_current_user)):
    if u["role"] != "admin":
        raise HTTPException(403, "Sadece yönetici")
    rn = body.room_number.strip()
    if not rn:
        raise HTTPException(400, "Oda numarası gerekli")
    existing = await db.rooms.find_one({"room_number": rn})
    if existing:
        raise HTTPException(409, "Bu oda numarası zaten kayıtlı")
    doc = {
        "id": str(uuid.uuid4()),
        "room_number": rn,
        "type": body.type or "Standard",
        "status": "available",
        "created_at": now_iso(),
    }
    await db.rooms.insert_one(doc.copy())
    return public_room(doc)

@api.delete("/admin/rooms/{rid}")
async def admin_delete_room(rid: str, u: dict = Depends(get_current_user)):
    if u["role"] != "admin":
        raise HTTPException(403, "Sadece yönetici")
    res = await db.rooms.delete_one({"id": rid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Oda bulunamadı")
    return {"ok": True}

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

    # Seed rooms
    rooms_seed = [
        ("101", "Standard"), ("102", "Standard"), ("103", "Standard"),
        ("204", "Deluxe"), ("205", "Deluxe"),
        ("315", "Deluxe"), ("316", "Deluxe"),
        ("401", "Suite"), ("402", "Suite"),
    ]
    for rn, tp in rooms_seed:
        # Mark occupied for rooms already assigned to seeded guests
        status_r = "occupied" if rn in ("204", "315") else "available"
        await db.rooms.insert_one({
            "id": str(uuid.uuid4()),
            "room_number": rn, "type": tp, "status": status_r,
            "created_at": now_iso(),
        })

    # Seed sample pending reservations
    sample_reservations = [
        {"customer_name": "Murat Kaya", "customer_email": "murat.kaya@example.com",
         "customer_phone": "+90 555 123 45 67", "room_number": "401"},
        {"customer_name": "Zeynep Aksoy", "customer_email": "zeynep@example.com",
         "customer_phone": "+90 532 987 65 43", "room_number": None},
    ]
    for s in sample_reservations:
        await db.reservations.insert_one({
            "id": str(uuid.uuid4()),
            "customer_name": s["customer_name"],
            "customer_email": s["customer_email"],
            "customer_phone": s["customer_phone"],
            "room_number": s["room_number"],
            "access_code": gen_access_code(6),
            "status": "pending",
            "user_id": None,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })

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
