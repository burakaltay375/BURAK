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

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "hotel_ops")
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
    "concierge": "Concierge",
}

SERVICE_OPTIONS = {
    "spa": "SPA",
    "luggage": "Bagaj Hizmeti",
    "valet": "Vale Hizmeti",
    "room_service": "Oda Servisi",
    "restaurant": "Restoran",
    "bar": "Bar",
    "pool": "Havuz",
    "fitness": "Fitness",
    "turkish_bath": "Türk Hamamı",
    "sauna": "Sauna",
    "airport_transfer": "Havalimanı Transferi",
    "vip": "VIP Hizmeti",
    "kids_club": "Çocuk Kulübü",
    "meeting_room": "Toplantı Salonu",
    "laundry": "Çamaşırhane",
    "concierge": "Concierge Hizmeti",
}

DEPARTMENT_SERVICE_MAP = {
    "kuru_temizleme": "laundry",
    "oda_servisi": "room_service",
    "vale": "valet",
    "concierge": "concierge",
}

SERVICE_REQUEST_DEPARTMENT = {
    "luggage": "concierge",
    "airport_transfer": "concierge",
    "vip": "concierge",
    "restaurant": "concierge",
    "bar": "concierge",
    "spa": "concierge",
    "pool": "concierge",
    "fitness": "concierge",
    "turkish_bath": "concierge",
    "sauna": "concierge",
    "kids_club": "concierge",
    "meeting_room": "concierge",
    "concierge": "concierge",
    "room_service": "oda_servisi",
    "laundry": "kuru_temizleme",
    "valet": "vale",
}

DEFAULT_SERVICE_HOURS = {
    "spa": ("09:00", "21:00"),
    "luggage": ("00:00", "23:59"),
    "valet": ("00:00", "23:59"),
    "room_service": ("00:00", "23:59"),
    "restaurant": ("07:00", "23:00"),
    "bar": ("12:00", "02:00"),
    "pool": ("08:00", "20:00"),
    "fitness": ("06:00", "23:00"),
    "turkish_bath": ("09:00", "21:00"),
    "sauna": ("09:00", "21:00"),
    "airport_transfer": ("00:00", "23:59"),
    "vip": ("00:00", "23:59"),
    "kids_club": ("10:00", "18:00"),
    "meeting_room": ("08:00", "22:00"),
    "laundry": ("08:00", "20:00"),
    "concierge": ("00:00", "23:59"),
}

SERVICE_KEYWORDS = {
    "spa": ["spa"],
    "luggage": ["bagaj", "valiz", "luggage", "baggage"],
    "valet": ["vale", "valet", "araba", "araç", "park"],
    "room_service": ["oda servisi", "room service", "yemek", "kahvaltı", "espresso", "tost"],
    "restaurant": ["restoran", "restaurant", "dinner", "lunch"],
    "bar": ["bar", "içki", "kokteyl", "cocktail"],
    "pool": ["havuz", "pool"],
    "fitness": ["fitness", "spor salonu", "gym"],
    "turkish_bath": ["türk hamamı", "hamam", "turkish bath"],
    "sauna": ["sauna"],
    "airport_transfer": ["havalimanı", "havaalanı", "airport", "airport transfer", "transfer"],
    "vip": ["vip"],
    "kids_club": ["çocuk kulübü", "cocuk kulubu", "kids club", "children club"],
    "meeting_room": ["toplantı salonu", "meeting", "meeting room"],
    "laundry": ["çamaşırhane", "camasirhane", "laundry", "dry cleaning", "kuru temizleme", "ütü"],
    "concierge": ["concierge", "konsiyerj"],
}

STATUS_FLOW = ["ALINDI", "PERSONEL_GIDIYOR", "TAMAMLANDI"]
SYSTEM_ADMIN_EMAIL = os.environ.get("SYSTEM_ADMIN_EMAIL", "burakaltay3004@gmail.com").lower().strip()
LEGACY_SYSTEM_ADMIN_EMAIL = "burakaltay3004"
SYSTEM_ADMIN_PASSWORD_FROM_ENV = "SYSTEM_ADMIN_PASSWORD" in os.environ
SYSTEM_ADMIN_PASSWORD = os.environ.get("SYSTEM_ADMIN_PASSWORD", "")
DEFAULT_HOTEL_ID = "default-hotel"
Role = Literal["system_admin", "hotel_manager", "staff", "guest"]
GuestType = Literal["standard", "vip", "casino"]
PaymentStatus = Literal["pending", "paid", "casino_guest", "vip_guest", "company_paid"]
RoomStatus = Literal["available", "occupied", "cleaning", "maintenance", "out_of_service"]

# --------------------------------------------------------------------------
# Models
# --------------------------------------------------------------------------
class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    role: Role
    department: Optional[str] = None
    room_no: Optional[str] = None
    gender: Optional[str] = None
    birth_date: Optional[str] = None
    age: Optional[int] = None
    nationality: Optional[str] = None
    country: Optional[str] = None
    region_city: Optional[str] = None
    hotel_id: Optional[str] = None
    hotelId: Optional[str] = None
    guest_type: Optional[GuestType] = None
    active: bool = True

class RegisterIn(BaseModel):
    email: str
    password: str
    name: str
    role: Role = "guest"
    department: Optional[str] = None
    room_no: Optional[str] = None

class LoginIn(BaseModel):
    email: str
    password: str
    selected_hotel_id: Optional[str] = None

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
    service_key: Optional[str] = None
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
    payment_status: PaymentStatus = "pending"
    guest_type: GuestType = "standard"

class AdminReservationIn(BaseModel):
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    check_in_date: str
    check_out_date: str
    room_number: Optional[str] = None
    status: ReservationStatus = "pending"
    payment_status: PaymentStatus = "pending"
    guest_type: GuestType = "standard"

class AdminReservationUpdateIn(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    check_in_date: Optional[str] = None
    check_out_date: Optional[str] = None
    room_number: Optional[str] = None
    status: Optional[ReservationStatus] = None
    payment_status: Optional[PaymentStatus] = None
    guest_type: Optional[GuestType] = None

class CheckinIn(BaseModel):
    email: str
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
    hotel_id: Optional[str] = None
    payment_status: PaymentStatus = "pending"
    guest_type: GuestType = "standard"
    created_at: str
    updated_at: str

class HotelCreateIn(BaseModel):
    hotel_name: str
    city: str
    address: Optional[str] = None
    active: bool = True

class HotelOut(BaseModel):
    id: str
    hotel_name: str
    city: str
    address: Optional[str] = None
    active: bool = True
    manager_id: Optional[str] = None
    services: Dict[str, bool] = Field(default_factory=dict)
    created_at: str

class HotelUpdateIn(BaseModel):
    hotel_name: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    active: Optional[bool] = None
    services: Optional[Dict[str, bool]] = None

class ManagerCreateIn(BaseModel):
    hotel_id: str
    email: str
    password: str
    name: str

class ManagerUpdateIn(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    hotel_id: Optional[str] = None
    active: Optional[bool] = None

class PasswordResetIn(BaseModel):
    new_password: str

class AccountDisableIn(BaseModel):
    active: bool

class StaffCreateIn(BaseModel):
    email: str
    password: str
    name: str
    department: str
    gender: str
    birth_date: str
    nationality: str
    country: str
    region_city: str

class StaffUpdateIn(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    gender: Optional[str] = None
    birth_date: Optional[str] = None
    nationality: Optional[str] = None
    country: Optional[str] = None
    region_city: Optional[str] = None
    active: Optional[bool] = None

class GuestCreateIn(BaseModel):
    email: str
    password: str
    name: str
    room_no: Optional[str] = None
    guest_type: GuestType = "standard"

class GuestUpdateIn(BaseModel):
    name: Optional[str] = None
    room_no: Optional[str] = None
    guest_type: Optional[GuestType] = None
    active: Optional[bool] = None

class UserAdminOut(BaseModel):
    id: str
    email: str
    name: str
    role: Role
    department: Optional[str] = None
    room_no: Optional[str] = None
    gender: Optional[str] = None
    birth_date: Optional[str] = None
    age: Optional[int] = None
    nationality: Optional[str] = None
    country: Optional[str] = None
    region_city: Optional[str] = None
    hotel_id: Optional[str] = None
    hotelId: Optional[str] = None
    guest_type: Optional[GuestType] = None
    active: bool = True

class RoomIn(BaseModel):
    room_number: str
    type: Optional[str] = "Standard"

class RoomOut(BaseModel):
    id: str
    room_number: str
    type: str
    status: RoomStatus
    created_at: str

class RoomStatusIn(BaseModel):
    status: RoomStatus

class AssignTaskIn(BaseModel):
    staff_id: str

class AnnouncementIn(BaseModel):
    title: str
    message: str
    active: bool = True

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
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail="Hesap devre dışı")
    return user

def role_of(u: dict) -> str:
    return "hotel_manager" if u.get("role") == "admin" else u.get("role")

def require_roles(u: dict, *roles: str) -> None:
    if role_of(u) not in roles:
        raise HTTPException(403, "Bu işlem için yetkiniz yok")

def is_system_admin(u: dict) -> bool:
    return role_of(u) == "system_admin"

def user_hotel_id(u: dict) -> str:
    return u.get("hotelId") or u.get("hotel_id") or DEFAULT_HOTEL_ID

def hotel_scope(u: dict) -> dict:
    if is_system_admin(u):
        return {}
    hid = user_hotel_id(u)
    scope = [{"hotel_id": hid}, {"hotelId": hid}]
    if hid == DEFAULT_HOTEL_ID:
        scope.extend([
            {"$and": [{"hotel_id": {"$exists": False}}, {"hotelId": {"$exists": False}}]},
            {"$and": [{"hotel_id": None}, {"hotelId": {"$in": [None, DEFAULT_HOTEL_ID]}}]},
        ])
    return {"$or": scope}

def room_number_scope(room_number: str, hotel_id: Optional[str]) -> dict:
    q = {"room_number": room_number}
    if hotel_id:
        q["$or"] = [{"hotel_id": hotel_id}, {"hotelId": hotel_id}]
    return q

def with_hotel_scope(u: dict, extra: Optional[dict] = None) -> dict:
    q = dict(extra or {})
    scope = hotel_scope(u)
    if scope:
        if "$or" in q and "$or" in scope:
            return {"$and": [q, scope]}
        q.update(scope)
    return q

def calculate_age(birth_date: Optional[str]) -> Optional[int]:
    if not birth_date:
        return None
    try:
        born = datetime.strptime(birth_date, "%Y-%m-%d").date()
    except ValueError:
        return None
    today = datetime.now(timezone.utc).date()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))

def validate_birth_date(value: str) -> str:
    if not value or not _DATE_RE.match(value.strip()):
        raise HTTPException(400, "Doğum tarihi formatı YYYY-MM-DD olmalı")
    birth_date = datetime.strptime(value.strip(), "%Y-%m-%d").date()
    if birth_date >= datetime.now(timezone.utc).date():
        raise HTTPException(400, "Doğum tarihi geçmişte olmalı")
    return birth_date.strftime("%Y-%m-%d")

def public_user(u: dict) -> UserPublic:
    hid = u.get("hotelId") or u.get("hotel_id")
    return UserPublic(
        id=u["id"], email=u["email"], name=u["name"], role=role_of(u),
        department=u.get("department"), room_no=u.get("room_no"),
        gender=u.get("gender"), birth_date=u.get("birth_date"), age=calculate_age(u.get("birth_date")),
        nationality=u.get("nationality"), country=u.get("country"), region_city=u.get("region_city"),
        hotel_id=hid, hotelId=hid, guest_type=u.get("guest_type"),
        active=u.get("active", True),
    )

def public_admin_user(u: dict) -> UserAdminOut:
    hid = u.get("hotelId") or u.get("hotel_id")
    return UserAdminOut(
        id=u["id"], email=u["email"], name=u["name"], role=role_of(u),
        department=u.get("department"), room_no=u.get("room_no"),
        gender=u.get("gender"), birth_date=u.get("birth_date"), age=calculate_age(u.get("birth_date")),
        nationality=u.get("nationality"), country=u.get("country"), region_city=u.get("region_city"),
        hotel_id=hid, hotelId=hid, guest_type=u.get("guest_type"),
        active=u.get("active", True),
    )

def public_request(r: dict) -> RequestOut:
    return RequestOut(
        id=r["id"], guest_id=r["guest_id"], guest_name=r["guest_name"],
        room_no=r["room_no"], departman=r["departman"], hizmet_turu=r["hizmet_turu"],
        service_key=r.get("service_key"), zaman=r["zaman"], detay=r["detay"], oncelik=r["oncelik"], status=r["status"],
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
        hotel_id=r.get("hotelId") or r.get("hotel_id"),
        payment_status=r.get("payment_status") or "pending",
        guest_type=r.get("guest_type") or "standard",
        created_at=r["created_at"], updated_at=r["updated_at"],
    )

def public_hotel(h: dict) -> "HotelOut":
    return HotelOut(
        id=h["id"], hotel_name=h["hotel_name"], city=h["city"],
        address=h.get("address"), active=h.get("active", True),
        manager_id=h.get("manager_id"), services=normalize_services(h.get("services")),
        created_at=h["created_at"],
    )

async def ensure_active_hotel_or_none(hotel_id: Optional[str]) -> Optional[dict]:
    hid = (hotel_id or "").strip()
    if not hid:
        return None
    h = await db.hotels.find_one({"id": hid, "active": True}, {"_id": 0})
    if not h:
        raise HTTPException(403, "Seçilen otel aktif değil veya bulunamadı")
    return h

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

async def unique_access_code(length: int = 6, attempts: int = 8) -> str:
    for _ in range(attempts):
        code = gen_access_code(length)
        if not await db.reservations.find_one({"access_code": code}):
            return code
    raise HTTPException(500, "Benzersiz rezervasyon kodu oluşturulamadı")

def validate_password(pw: str) -> None:
    if len(pw) < 4:
        raise HTTPException(400, "Şifre en az 4 karakter olmalı")

def default_services() -> Dict[str, bool]:
    return {key: True for key in SERVICE_OPTIONS}

def normalize_services(raw: Optional[dict]) -> Dict[str, bool]:
    current = default_services()
    if isinstance(raw, dict):
        for key in SERVICE_OPTIONS:
            if key in raw:
                current[key] = bool(raw[key])
    return current

def validate_services(raw: Dict[str, bool]) -> Dict[str, bool]:
    invalid = [key for key in raw if key not in SERVICE_OPTIONS]
    if invalid:
        raise HTTPException(400, f"Geçersiz servis: {', '.join(invalid)}")
    current = default_services()
    current.update({key: bool(value) for key, value in raw.items()})
    return current

def normalize_service_meta(raw: Optional[dict]) -> Dict[str, dict]:
    meta: Dict[str, dict] = {}
    raw = raw if isinstance(raw, dict) else {}
    for key in SERVICE_OPTIONS:
        default_open, default_close = DEFAULT_SERVICE_HOURS[key]
        current = raw.get(key) if isinstance(raw.get(key), dict) else {}
        meta[key] = {
            "status": current.get("status") or "active",
            "open": current.get("open") or default_open,
            "close": current.get("close") or default_close,
            "knowledge": current.get("knowledge") or "",
        }
    return meta

async def hotel_services_for_user(u: dict) -> Dict[str, bool]:
    hotel = await db.hotels.find_one({"id": user_hotel_id(u)}, {"_id": 0})
    return normalize_services(hotel.get("services") if hotel else None)

async def hotel_service_context_for_user(u: dict) -> Dict[str, Any]:
    hotel = await db.hotels.find_one({"id": user_hotel_id(u)}, {"_id": 0})
    return {
        "hotel": hotel or {},
        "services": normalize_services(hotel.get("services") if hotel else None),
        "service_meta": normalize_service_meta(hotel.get("service_meta") if hotel else None),
        "knowledge_base": (hotel or {}).get("knowledge_base") or "",
    }

def is_department_service_enabled(services: Dict[str, bool], department: str) -> bool:
    service_key = DEPARTMENT_SERVICE_MAP.get(department)
    return True if service_key is None else bool(services.get(service_key))

def is_request_service_enabled(services: Dict[str, bool], request: dict) -> bool:
    service_key = request.get("service_key")
    if service_key:
        return bool(services.get(service_key))
    return is_department_service_enabled(services, request.get("departman"))

def _minutes(value: str) -> int:
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)

def service_open_state(service_key: str, service_meta: Dict[str, dict]) -> Dict[str, Any]:
    meta = service_meta.get(service_key) or normalize_service_meta({}).get(service_key) or {}
    if meta.get("status") != "active":
        return {"open": False, "reason": "inactive", "opens_at": meta.get("open")}
    open_at = meta.get("open") or DEFAULT_SERVICE_HOURS[service_key][0]
    close_at = meta.get("close") or DEFAULT_SERVICE_HOURS[service_key][1]
    now = datetime.now().hour * 60 + datetime.now().minute
    start = _minutes(open_at)
    end = _minutes(close_at)
    is_open = start <= now <= end if start <= end else now >= start or now <= end
    return {"open": is_open, "reason": None if is_open else "closed", "opens_at": open_at, "closes_at": close_at}

def staff_department(u: dict) -> str:
    dept = u.get("department")
    if not dept:
        raise HTTPException(403, "Personel departmanı tanımlı değil")
    return dept


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
        resp = await asyncio.to_thread(
            requests.post,
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
    "oda_servisi": [
        "oda servisi", "yemek", "kahvaltı", "kahvalti", "akşam yemeği", "öğle yemeği",
        "içecek", "icecek", "kahve", "espresso", "latte", "çay", "cay", "su",
        "tost", "burger", "sandviç", "sandvic", "sandvi", "meyve", "pasta", "tatlı",
    ],
    "housekeeping": [
        # Temizlik / textile
        "havlu", "çarşaf", "carsaf", "temizlik", "yatak", "tuvalet kağıdı", "sabun",
        "şampuan", "sampuan", "oda temizliği", "diş fırçası", "terlik",
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
- oda_servisi: Yiyecek / içecek, kahvaltı, kahve, espresso, çay, su, tost, sandviç, burger, meyve, pasta, tatlı, oda servisi
- housekeeping (Kat Hizmetleri): Tekstil / temizlik malzemesi: havlu, çarşaf, sabun, şampuan, terlik, oda temizliği
- teknik_destek (Teknik Servis / Maintenance):
    • Tamirat / arıza işleri: klima, TV, televizyon, cam, pencere, musluk, lavabo, duş, lamba, ampul, elektrik, wifi, internet, kapı, kilit, sıcak su, "çalışmıyor", "bozuk"
- kuru_temizleme: Yıkama, ütü, leke çıkarma, kıyafet bakımı
- vale: Araç park etme / getirme, otopark, anahtar

ÖNEMLİ DAVRANIŞLAR:
1. GENEL SORULAR (otel hakkında bilgi, çalışma saatleri, restoran tavsiyesi, hava durumu, "merhaba" gibi sohbet) → ASLA talep oluşturma. ready=false, request=null. reply'da nazikçe ve faydalı şekilde kendin cevap ver.
2. EYLEMLİ TALEPLER (yukarıdaki kategorilere giren somut bir hizmet isteği) → İlgili departmana yönlendir.
3. Eksik bilgi varsa (oda no, saat, spesifik detay) nezaketle sor; ready=false, request=null.
4. Tüm bilgiler tamamsa: ready=true ve request dolu olsun; reply'da "talebiniz alındı ve ... departmanına iletildi" tarzı bir onay ver.
5. Departman SADECE bu 5'ten biri olabilir: oda_servisi, housekeeping, teknik_destek, kuru_temizleme, vale.

YANIT FORMATI (HER ZAMAN sadece geçerli JSON, başka metin yok):
{
  "reply": "<misafire göstereceğin nazik kısa Türkçe cevap>",
  "ready": true/false,
  "request": {
    "departman": "oda_servisi|housekeeping|teknik_destek|kuru_temizleme|vale",
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


def is_confirmation(text: str) -> bool:
    normalized = text.lower().strip()
    return normalized in {"evet", "onay", "onaylıyorum", "olur", "tamam", "yes", "confirm", "ok"} or "onaylıyorum" in normalized

def is_rejection(text: str) -> bool:
    normalized = text.lower().strip()
    return normalized in {"hayır", "hayir", "vazgeç", "vazgec", "istemiyorum", "no", "cancel"}

def service_from_text(message: str) -> Optional[str]:
    text = message.lower()
    for key, keywords in SERVICE_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            return key
    return None

def is_service_question(text: str) -> bool:
    lowered = text.lower()
    return any(word in lowered for word in ["var mı", "var mi", "hizmet", "servis", "mevcut", "sağlıyor", "sagliyor", "açık mı", "acik mi"])

def service_answer(message: str, service_context: Dict[str, Any], user: Optional[dict] = None) -> Optional[Dict[str, Any]]:
    service_key = service_from_text(message)
    if not service_key:
        return None
    services = service_context["services"]
    meta = service_context["service_meta"]
    label = SERVICE_OPTIONS[service_key]
    knowledge = meta.get(service_key, {}).get("knowledge") or service_context.get("knowledge_base") or ""
    if not services.get(service_key):
        enabled = [SERVICE_OPTIONS[k] for k, v in services.items() if v]
        return {
            "reply": f"Bu otel {label} hizmeti sunmuyor. İsterseniz mevcut servislerle yardımcı olabilirim: {', '.join(enabled[:6])}.",
            "ready": False,
            "request": None,
        }
    open_state = service_open_state(service_key, meta)
    if not open_state["open"]:
        opens_at = open_state.get("opens_at") or DEFAULT_SERVICE_HOURS[service_key][0]
        return {
            "reply": f"{label} şu anda kapalı. Açılış saati {opens_at}. Açılış saatine uygun bir talep oluşturmamı ister misiniz?",
            "ready": False,
            "request": None,
            "pending_request": {
                "departman": SERVICE_REQUEST_DEPARTMENT[service_key],
                "service_key": service_key,
                "hizmet_turu": label,
                "oda_no": user.get("room_no") if user else None,
                "zaman": opens_at,
                "detay": message,
                "oncelik": "ORTA",
            },
        }
    if is_service_question(message):
        suffix = f" {knowledge}" if knowledge else ""
        return {"reply": f"Evet, {label} hizmetimiz aktif ve şu anda açık.{suffix}", "ready": False, "request": None}
    reply = f"{label} hizmeti şu anda mevcut. Talep oluşturmamı ister misiniz? Onaylıyorsanız 'evet' yazın."
    if service_key == "airport_transfer":
        reply = "Havalimanı transferi mevcut. Lütfen uçuş saati, havalimanı ve kişi sayısını paylaşın; ardından onayınızla talep oluşturabilirim."
    return {
        "reply": reply,
        "ready": False,
        "request": None,
        "pending_request": {
            "departman": SERVICE_REQUEST_DEPARTMENT[service_key],
            "service_key": service_key,
            "hizmet_turu": label,
            "oda_no": user.get("room_no") if user else None,
            "zaman": "—",
            "detay": message,
            "oncelik": "ORTA",
        },
    }

def fallback_orchestrate(message: str, history: List[dict], service_context: Optional[Dict[str, Any]] = None, user: Optional[dict] = None) -> Dict[str, Any]:
    """Pure rule-based fallback when LLM unavailable."""
    # Aggregate context from previous user messages
    full = " ".join([h["content"] for h in history if h["role"] == "user"] + [message])
    if service_context:
        answer = service_answer(full, service_context, user)
        if answer:
            return answer
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
    if service_context and not is_request_service_enabled(service_context["services"], parsed):
        return {"reply": f"Otelimizde şu anda {DEPARTMENTS[parsed['departman']]} hizmeti aktif değil.", "ready": False, "request": None}
    return {
        "reply": f"{DEPARTMENTS[parsed['departman']]} talebinizi hazırladım. Oluşturmamı onaylıyor musunuz? Onaylıyorsanız 'evet' yazın.",
        "ready": True,
        "request": parsed,
    }


async def orchestrate(session_id: str, message: str, history: List[dict], service_context: Optional[Dict[str, Any]] = None, user: Optional[dict] = None) -> Dict[str, Any]:
    if service_context:
        answer = service_answer(message, service_context, user)
        if answer:
            return answer
    if EMERGENT_LLM_KEY:
        try:
            services = (service_context or {}).get("services") or {}
            meta = (service_context or {}).get("service_meta") or {}
            enabled = [f"{SERVICE_OPTIONS[k]} ({meta.get(k, {}).get('open', DEFAULT_SERVICE_HOURS[k][0])}-{meta.get(k, {}).get('close', DEFAULT_SERVICE_HOURS[k][1])})" for k, v in services.items() if v]
            disabled = [SERVICE_OPTIONS[k] for k, v in services.items() if not v]
            prompt_service_context = (
                "\n\nAKTIF OTEL SERVISLERI:\n"
                f"Aktif: {', '.join(enabled) or 'Yok'}\n"
                f"Pasif: {', '.join(disabled) or 'Yok'}\n"
                "Bilgi tabanı: " + str((service_context or {}).get("knowledge_base") or "Yok") + "\n"
                "Misafir servis sorarsa bu listeye göre cevap ver. Pasif servisten talep oluşturma. Talep oluşturmak için mutlaka önce onay iste."
            )
            return await call_llm(session_id, message + prompt_service_context, history)
        except Exception as e:
            logger.warning(f"LLM failed, falling back to rules: {e}")
    return fallback_orchestrate(message, history, service_context, user)

# --------------------------------------------------------------------------
# Auth endpoints
# --------------------------------------------------------------------------
@api.post("/auth/register", response_model=AuthOut)
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(409, "Bu e-posta zaten kayıtlı")
    if body.role != "guest":
        raise HTTPException(403, "Personel ve yönetici hesapları yalnızca yetkili panelden oluşturulur")
    validate_password(body.password)
    user = {
        "id": str(uuid.uuid4()),
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": "guest",
        "department": None,
        "room_no": body.room_no,
        "hotel_id": DEFAULT_HOTEL_ID,
        "hotelId": DEFAULT_HOTEL_ID,
        "guest_type": "standard",
        "active": True,
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
    if u.get("active") is False:
        raise HTTPException(403, "Hesap devre dışı")
    selected_hotel = await ensure_active_hotel_or_none(body.selected_hotel_id)
    role = role_of(u)
    assigned_hotel_id = u.get("hotelId") or u.get("hotel_id")

    if role in ("hotel_manager", "staff", "guest"):
        if not selected_hotel:
            raise HTTPException(403, "Lütfen giriş yapmak istediğiniz oteli seçin")
        if not assigned_hotel_id:
            raise HTTPException(403, "Hesabınıza otel atanmamış")
        if selected_hotel["id"] != assigned_hotel_id:
            raise HTTPException(403, "Seçilen otel için giriş yetkiniz yok")
        assigned_hotel = await db.hotels.find_one({"id": assigned_hotel_id, "active": True}, {"_id": 0})
        if not assigned_hotel:
            raise HTTPException(403, "Atandığınız otel aktif değil")

    if role == "system_admin" and selected_hotel:
        u = {**u, "hotel_id": selected_hotel["id"], "hotelId": selected_hotel["id"]}

    return AuthOut(token=make_token(u["id"]), user=public_user(u))

@api.get("/hotels/active", response_model=List[HotelOut])
async def active_hotels():
    docs = await db.hotels.find({"active": True}, {"_id": 0}).sort("hotel_name", 1).to_list(500)
    return [public_hotel(d) for d in docs]

@api.get("/hotel/services")
async def my_hotel_services(u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager", "staff", "guest")
    return {
        "hotel_id": user_hotel_id(u),
        "services": await hotel_services_for_user(u),
        "labels": SERVICE_OPTIONS,
    }

@api.get("/auth/me", response_model=UserPublic)
async def me(u: dict = Depends(get_current_user)):
    return public_user(u)

# --------------------------------------------------------------------------
# Chat / Orchestrator
# --------------------------------------------------------------------------
async def create_guest_request_from_pending(pending: dict, u: dict, fallback_message: str, services: Dict[str, bool]) -> tuple[str, Dict[str, Any]]:
    departman = pending.get("departman")
    if departman not in DEPARTMENTS:
        raise HTTPException(400, "Talep departmanı geçersiz")
    service_key = pending.get("service_key") or DEPARTMENT_SERVICE_MAP.get(departman)
    if service_key and not services.get(service_key):
        raise HTTPException(403, "Bu servis otelinizde aktif değil")
    if not service_key and not is_department_service_enabled(services, departman):
        raise HTTPException(403, "Bu servis otelinizde aktif değil")
    oda = str(pending.get("oda_no") or u.get("room_no") or "").strip()
    if not oda:
        raise HTTPException(400, "Talep oluşturmak için oda numarası gerekli")
    req = {
        "id": str(uuid.uuid4()),
        "guest_id": u["id"],
        "guest_name": u["name"],
        "room_no": oda,
        "hotel_id": user_hotel_id(u),
        "hotelId": user_hotel_id(u),
        "departman": departman,
        "service_key": service_key,
        "hizmet_turu": pending.get("hizmet_turu") or DEPARTMENTS[departman],
        "zaman": pending.get("zaman") or "—",
        "detay": pending.get("detay") or fallback_message,
        "oncelik": (pending.get("oncelik") or "ORTA").upper(),
        "status": "ALINDI",
        "assigned_staff_id": None,
        "assigned_staff_name": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    if req["oncelik"] not in ("DUSUK", "ORTA", "YUKSEK"):
        req["oncelik"] = "ORTA"
    await db.requests.insert_one(req.copy())
    parsed = {
        "departman": req["departman"], "oda_no": req["room_no"],
        "hizmet_turu": req["hizmet_turu"], "zaman": req["zaman"],
        "detay": req["detay"], "oncelik": req["oncelik"],
    }
    return req["id"], parsed

@api.post("/chat", response_model=ChatOut)
async def chat(body: ChatIn, u: dict = Depends(get_current_user)):
    session_id = body.session_id or str(uuid.uuid4())
    service_context = await hotel_service_context_for_user(u)
    services = service_context["services"]

    # Load only this user's session history; session_id is client supplied.
    history_docs = await db.chat_messages.find(
        {"session_id": session_id, "user_id": u["id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    history = [{"role": h["role"], "content": h["content"]} for h in history_docs]
    last_assistant = next((h for h in reversed(history_docs) if h.get("role") == "assistant"), None)
    pending_request = last_assistant.get("pending_request") if last_assistant else None

    # Persist user message
    await db.chat_messages.insert_one({
        "id": str(uuid.uuid4()), "session_id": session_id, "user_id": u["id"],
        "role": "user", "content": body.message, "created_at": now_iso(),
    })

    if pending_request and role_of(u) == "guest":
        if is_confirmation(body.message):
            request_id, parsed_clean = await create_guest_request_from_pending(pending_request, u, body.message, services)
            reply = "Talebiniz onayınızla oluşturuldu ve ilgili ekibe iletildi."
            await db.chat_messages.insert_one({
                "id": str(uuid.uuid4()), "session_id": session_id, "user_id": u["id"],
                "role": "assistant", "content": reply, "created_at": now_iso(),
            })
            return ChatOut(session_id=session_id, reply=reply, ready=True, request_id=request_id, parsed=parsed_clean)
        if is_rejection(body.message):
            reply = "Tamam, talep oluşturmadım. Başka bir konuda yardımcı olabilirim."
            await db.chat_messages.insert_one({
                "id": str(uuid.uuid4()), "session_id": session_id, "user_id": u["id"],
                "role": "assistant", "content": reply, "created_at": now_iso(),
            })
            return ChatOut(session_id=session_id, reply=reply, ready=False, request_id=None, parsed=None)
        updated_pending = dict(pending_request)
        updated_pending["detay"] = f"{pending_request.get('detay') or ''}\nEk bilgi: {body.message}".strip()
        reply = "Bilgileri talebe ekledim. Talep oluşturmamı onaylıyor musunuz? Onaylıyorsanız 'evet' yazın."
        await db.chat_messages.insert_one({
            "id": str(uuid.uuid4()), "session_id": session_id, "user_id": u["id"],
            "role": "assistant", "content": reply, "pending_request": updated_pending, "created_at": now_iso(),
        })
        return ChatOut(session_id=session_id, reply=reply, ready=False, request_id=None, parsed=None)

    # If user has a known room, inject hint
    augmented = body.message
    if u.get("room_no") and "oda" not in body.message.lower():
        augmented = f"{body.message}\n(Sistem notu: misafirin kayıtlı odası {u['room_no']})"

    result = await orchestrate(session_id, augmented, history, service_context, u)
    reply = result.get("reply", "")
    ready = bool(result.get("ready"))
    req_data = result.get("request") or {}

    request_id = None
    parsed_clean = None
    pending_to_store = result.get("pending_request")
    if ready and req_data and req_data.get("departman") in DEPARTMENTS and role_of(u) == "guest":
        if not is_request_service_enabled(services, req_data):
            ready = False
            reply = f"Otelimizde şu anda {DEPARTMENTS[req_data['departman']]} hizmeti aktif değil."
            req_data = {}
    if ready and req_data and req_data.get("departman") in DEPARTMENTS and role_of(u) == "guest":
        oda = str(req_data.get("oda_no") or u.get("room_no") or "").strip()
        if not oda:
            ready = False
            reply = "Lütfen oda numaranızı paylaşır mısınız?"
        else:
            service_key = req_data.get("service_key") or DEPARTMENT_SERVICE_MAP.get(req_data["departman"])
            pending_to_store = {
                "departman": req_data["departman"],
                "service_key": service_key,
                "hizmet_turu": req_data.get("hizmet_turu") or DEPARTMENTS[req_data["departman"]],
                "oda_no": oda,
                "zaman": req_data.get("zaman") or "—",
                "detay": req_data.get("detay") or body.message,
                "oncelik": (req_data.get("oncelik") or "ORTA").upper(),
            }
            ready = False
            parsed_clean = None
            reply = reply or f"{pending_to_store['hizmet_turu']} talebinizi hazırladım. Oluşturmamı onaylıyor musunuz? Onaylıyorsanız 'evet' yazın."
    elif ready and req_data and role_of(u) != "guest":
        ready = False
        reply = reply or "AI asistan not aldı. Operasyon kaydı oluşturmak için misafir talebi gereklidir."

    assistant_doc = {
        "id": str(uuid.uuid4()), "session_id": session_id, "user_id": u["id"],
        "role": "assistant", "content": reply, "created_at": now_iso(),
    }
    if pending_to_store and role_of(u) == "guest":
        assistant_doc["pending_request"] = pending_to_store
    await db.chat_messages.insert_one(assistant_doc)

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
    if role_of(u) != "guest":
        raise HTTPException(403, "Sadece misafirler")
    docs = await db.requests.find({"guest_id": u["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [public_request(d) for d in docs]

@api.get("/requests/department", response_model=List[RequestOut])
async def department_queue(u: dict = Depends(get_current_user)):
    if role_of(u) != "staff":
        raise HTTPException(403, "Sadece personel")
    dept = staff_department(u)
    services = await hotel_services_for_user(u)
    if dept != "concierge" and not is_department_service_enabled(services, dept):
        raise HTTPException(403, "Bu servis otelinizde aktif değil")
    docs = await db.requests.find(
        with_hotel_scope(u, {"departman": dept, "status": "ALINDI"}), {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    docs = [d for d in docs if is_request_service_enabled(services, d)]
    return [public_request(d) for d in docs]

@api.get("/requests/active", response_model=List[RequestOut])
async def active_jobs(u: dict = Depends(get_current_user)):
    if role_of(u) != "staff":
        raise HTTPException(403, "Sadece personel")
    dept = staff_department(u)
    services = await hotel_services_for_user(u)
    if dept != "concierge" and not is_department_service_enabled(services, dept):
        raise HTTPException(403, "Bu servis otelinizde aktif değil")
    docs = await db.requests.find(
        with_hotel_scope(u, {"departman": dept, "assigned_staff_id": u["id"], "status": "PERSONEL_GIDIYOR"}),
        {"_id": 0},
    ).sort("updated_at", -1).to_list(200)
    docs = [d for d in docs if is_request_service_enabled(services, d)]
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
    if role_of(u) != "staff":
        raise HTTPException(403, "Sadece personel")
    dept = staff_department(u)
    services = await hotel_services_for_user(u)
    if dept != "concierge" and not is_department_service_enabled(services, dept):
        raise HTTPException(403, "Bu servis otelinizde aktif değil")
    r = await db.requests.find_one(with_hotel_scope(u, {"id": req_id}), {"_id": 0})
    if not r:
        raise HTTPException(404, "Talep bulunamadı")
    if not is_request_service_enabled(services, r):
        raise HTTPException(403, "Bu servis otelinizde aktif değil")
    if r["departman"] != dept:
        raise HTTPException(403, "Departman uyuşmuyor")
    if r["status"] != "ALINDI":
        raise HTTPException(400, "Bu talep zaten işlenmiş")
    r = await _update_status(req_id, "PERSONEL_GIDIYOR", u)
    return public_request(r)

@api.post("/requests/{req_id}/reject", response_model=RequestOut)
async def reject_request(req_id: str, u: dict = Depends(get_current_user)):
    if role_of(u) != "staff":
        raise HTTPException(403, "Sadece personel")
    dept = staff_department(u)
    services = await hotel_services_for_user(u)
    if dept != "concierge" and not is_department_service_enabled(services, dept):
        raise HTTPException(403, "Bu servis otelinizde aktif değil")
    r = await db.requests.find_one(with_hotel_scope(u, {"id": req_id}), {"_id": 0})
    if not r:
        raise HTTPException(404, "Talep bulunamadı")
    if not is_request_service_enabled(services, r):
        raise HTTPException(403, "Bu servis otelinizde aktif değil")
    if r["departman"] != dept:
        raise HTTPException(403, "Departman uyuşmuyor")
    if r["status"] != "ALINDI":
        raise HTTPException(400, "Yalnızca bekleyen talepler reddedilebilir")
    r = await _update_status(req_id, "REDDEDILDI", u)
    return public_request(r)

@api.post("/requests/{req_id}/complete", response_model=RequestOut)
async def complete_request(req_id: str, body: CompleteIn, u: dict = Depends(get_current_user)):
    if role_of(u) != "staff":
        raise HTTPException(403, "Sadece personel")
    services = await hotel_services_for_user(u)
    dept = staff_department(u)
    if dept != "concierge" and not is_department_service_enabled(services, dept):
        raise HTTPException(403, "Bu servis otelinizde aktif değil")
    r = await db.requests.find_one(with_hotel_scope(u, {"id": req_id}), {"_id": 0})
    if not r:
        raise HTTPException(404, "Talep bulunamadı")
    if not is_request_service_enabled(services, r):
        raise HTTPException(403, "Bu servis otelinizde aktif değil")
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
    require_roles(u, "system_admin", "hotel_manager")
    docs = await db.requests.find(with_hotel_scope(u), {"_id": 0}).sort("created_at", -1).to_list(500)
    return [public_request(d) for d in docs]

@api.get("/admin/stats")
async def admin_stats(u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin", "hotel_manager")
    total = await db.requests.count_documents(with_hotel_scope(u))
    active = await db.requests.count_documents(with_hotel_scope(u, {"status": {"$in": ["ALINDI", "PERSONEL_GIDIYOR"]}}))
    completed = await db.requests.count_documents(with_hotel_scope(u, {"status": "TAMAMLANDI"}))
    urgent = await db.requests.count_documents(with_hotel_scope(u, {"oncelik": "YUKSEK", "status": {"$ne": "TAMAMLANDI"}}))
    by_dept = {}
    for code, name in DEPARTMENTS.items():
        c = await db.requests.count_documents(with_hotel_scope(u, {"departman": code, "status": {"$in": ["ALINDI", "PERSONEL_GIDIYOR"]}}))
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
    existing_pending = await db.reservations.find_one({"customer_email": email, "status": "pending"}, {"_id": 0})
    if existing_pending:
        raise HTTPException(409, "Bu e-posta için bekleyen bir rezervasyon zaten var. Lütfen mevcut rezervasyon kodunuzu kullanın.")
    code = await unique_access_code()
    doc = {
        "id": str(uuid.uuid4()),
        "customer_name": body.customer_name.strip(),
        "customer_email": email,
        "customer_phone": body.customer_phone.strip(),
        "room_number": (body.room_number or None),
        "check_in_date": ci,
        "check_out_date": co,
        "hotel_id": DEFAULT_HOTEL_ID,
        "hotelId": DEFAULT_HOTEL_ID,
        "payment_status": body.payment_status,
        "guest_type": body.guest_type,
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
    validate_password(body.new_password)
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
            "hotel_id": r.get("hotel_id") or DEFAULT_HOTEL_ID,
            "hotelId": r.get("hotelId") or r.get("hotel_id") or DEFAULT_HOTEL_ID,
            "guest_type": r.get("guest_type") or "standard",
            "active": True,
            "created_at": now_iso(),
        }
        await db.users.insert_one(user.copy())
    await db.reservations.update_one(
        {"id": r["id"]},
        {"$set": {"status": "checked_in", "user_id": user["id"], "updated_at": now_iso()}},
    )
    # Mark room occupied
    if r.get("room_number"):
        await db.rooms.update_one(
            room_number_scope(r["room_number"], r.get("hotelId") or r.get("hotel_id") or DEFAULT_HOTEL_ID),
            {"$set": {"status": "occupied"}},
        )
    return AuthOut(token=make_token(user["id"]), user=public_user(user))

# --------------------------------------------------------------------------
# Admin: Reservations & Rooms
# --------------------------------------------------------------------------
@api.get("/admin/reservations", response_model=List[ReservationOut])
async def admin_list_reservations(u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin", "hotel_manager")
    docs = await db.reservations.find(with_hotel_scope(u), {"_id": 0}).sort("created_at", -1).to_list(500)
    return [public_reservation(d) for d in docs]

@api.post("/admin/reservations", response_model=ReservationOut)
async def admin_create_reservation(body: AdminReservationIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    email = body.customer_email.lower()
    ci, co = validate_stay_dates(body.check_in_date, body.check_out_date)
    if body.status != "pending":
        raise HTTPException(400, "Yeni rezervasyon beklemede durumuyla oluşturulmalı")
    code = await unique_access_code()
    doc = {
        "id": str(uuid.uuid4()),
        "customer_name": body.customer_name.strip(),
        "customer_email": email,
        "customer_phone": body.customer_phone.strip(),
        "room_number": body.room_number or None,
        "check_in_date": ci,
        "check_out_date": co,
        "hotel_id": user_hotel_id(u),
        "hotelId": user_hotel_id(u),
        "payment_status": body.payment_status,
        "guest_type": body.guest_type,
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
    require_roles(u, "hotel_manager")
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    if not r:
        raise HTTPException(404, "Rezervasyon bulunamadı")
    await db.reservations.update_one(
        with_hotel_scope(u, {"id": rid}), {"$set": {"room_number": body.room_number, "updated_at": now_iso()}},
    )
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    return public_reservation(r)

@api.patch("/admin/reservations/{rid}", response_model=ReservationOut)
async def admin_update_reservation(rid: str, body: AdminReservationUpdateIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if body.check_in_date or body.check_out_date:
        current = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
        if not current:
            raise HTTPException(404, "Rezervasyon bulunamadı")
        ci, co = validate_stay_dates(
            body.check_in_date or current.get("check_in_date"),
            body.check_out_date or current.get("check_out_date"),
        )
        update["check_in_date"] = ci
        update["check_out_date"] = co
    if update:
        update["updated_at"] = now_iso()
        await db.reservations.update_one(with_hotel_scope(u, {"id": rid}), {"$set": update})
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    if not r:
        raise HTTPException(404, "Rezervasyon bulunamadı")
    return public_reservation(r)

@api.post("/admin/reservations/{rid}/checkin", response_model=ReservationOut)
async def admin_approve_checkin(rid: str, u: dict = Depends(get_current_user)):
    """Admin manually marks a reservation as checked_in (without requiring guest to enter code).
    Note: the guest still needs to set a password via /api/checkin to actually log in."""
    require_roles(u, "hotel_manager")
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    if not r:
        raise HTTPException(404, "Rezervasyon bulunamadı")
    if r["status"] == "completed":
        raise HTTPException(400, "Tamamlanmış rezervasyon")
    await db.reservations.update_one(
        with_hotel_scope(u, {"id": rid}), {"$set": {"status": "checked_in", "updated_at": now_iso()}},
    )
    if r.get("room_number"):
        await db.rooms.update_one(
            with_hotel_scope(u, {"room_number": r["room_number"]}),
            {"$set": {"status": "occupied"}},
        )
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    return public_reservation(r)

@api.post("/admin/reservations/{rid}/complete", response_model=ReservationOut)
async def admin_complete_reservation(rid: str, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    if not r:
        raise HTTPException(404, "Rezervasyon bulunamadı")
    if r.get("status") != "checked_in":
        raise HTTPException(400, "Yalnızca check-in yapılmış rezervasyon tamamlanabilir")
    await db.reservations.update_one(
        with_hotel_scope(u, {"id": rid}), {"$set": {"status": "completed", "updated_at": now_iso()}},
    )
    if r.get("room_number"):
        await db.rooms.update_one(
            with_hotel_scope(u, {"room_number": r["room_number"]}),
            {"$set": {"status": "available"}},
        )
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    return public_reservation(r)

@api.post("/admin/reservations/{rid}/cancel", response_model=ReservationOut)
async def admin_cancel_reservation(rid: str, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    if not r:
        raise HTTPException(404, "Rezervasyon bulunamadı")
    await db.reservations.update_one(
        with_hotel_scope(u, {"id": rid}), {"$set": {"status": "cancelled", "updated_at": now_iso()}},
    )
    if r.get("room_number"):
        await db.rooms.update_one(
            with_hotel_scope(u, {"room_number": r["room_number"]}),
            {"$set": {"status": "available"}},
        )
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    return public_reservation(r)

@api.get("/admin/rooms", response_model=List[RoomOut])
async def admin_list_rooms(u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    docs = await db.rooms.find(with_hotel_scope(u), {"_id": 0}).sort("room_number", 1).to_list(500)
    return [public_room(d) for d in docs]

@api.post("/admin/rooms", response_model=RoomOut)
async def admin_create_room(body: RoomIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    rn = body.room_number.strip()
    if not rn:
        raise HTTPException(400, "Oda numarası gerekli")
    existing = await db.rooms.find_one(with_hotel_scope(u, {"room_number": rn}))
    if existing:
        raise HTTPException(409, "Bu oda numarası zaten kayıtlı")
    doc = {
        "id": str(uuid.uuid4()),
        "room_number": rn,
        "type": body.type or "Standard",
        "status": "available",
        "hotel_id": user_hotel_id(u),
        "hotelId": user_hotel_id(u),
        "created_at": now_iso(),
    }
    await db.rooms.insert_one(doc.copy())
    return public_room(doc)

@api.delete("/admin/rooms/{rid}")
async def admin_delete_room(rid: str, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    res = await db.rooms.delete_one(with_hotel_scope(u, {"id": rid}))
    if res.deleted_count == 0:
        raise HTTPException(404, "Oda bulunamadı")
    return {"ok": True}

@api.get("/reservations/me", response_model=List[ReservationOut])
async def guest_my_reservations(u: dict = Depends(get_current_user)):
    require_roles(u, "guest")
    docs = await db.reservations.find(
        with_hotel_scope(u, {"$or": [{"user_id": u["id"]}, {"customer_email": u["email"]}]}),
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)
    return [public_reservation(d) for d in docs]

@api.get("/rooms/me", response_model=Optional[RoomOut])
async def guest_my_room(u: dict = Depends(get_current_user)):
    require_roles(u, "guest")
    if not u.get("room_no"):
        return None
    room = await db.rooms.find_one(with_hotel_scope(u, {"room_number": u["room_no"]}), {"_id": 0})
    return public_room(room) if room else None

@api.get("/staff/rooms", response_model=List[RoomOut])
async def staff_rooms(u: dict = Depends(get_current_user)):
    require_roles(u, "staff")
    docs = await db.rooms.find(with_hotel_scope(u), {"_id": 0}).sort("room_number", 1).to_list(500)
    return [public_room(d) for d in docs]

@api.patch("/staff/rooms/{room_id}/status", response_model=RoomOut)
async def staff_update_room_status(room_id: str, body: RoomStatusIn, u: dict = Depends(get_current_user)):
    require_roles(u, "staff")
    await db.rooms.update_one(with_hotel_scope(u, {"id": room_id}), {"$set": {"status": body.status}})
    room = await db.rooms.find_one(with_hotel_scope(u, {"id": room_id}), {"_id": 0})
    if not room:
        raise HTTPException(404, "Oda bulunamadı")
    return public_room(room)

@api.get("/announcements")
async def guest_announcements(u: dict = Depends(get_current_user)):
    require_roles(u, "guest")
    docs = await db.announcements.find(
        with_hotel_scope(u, {"active": True}), {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return docs

# --------------------------------------------------------------------------
# System Administrator
# --------------------------------------------------------------------------
@api.get("/system/hotels", response_model=List[HotelOut])
async def system_list_hotels(u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    docs = await db.hotels.find({}, {"_id": 0}).sort("hotel_name", 1).to_list(500)
    return [public_hotel(d) for d in docs]

@api.post("/system/hotels", response_model=HotelOut)
async def system_create_hotel(body: HotelCreateIn, u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    doc = {
        "id": str(uuid.uuid4()),
        "hotel_name": body.hotel_name.strip(),
        "city": body.city.strip(),
        "address": body.address,
        "active": body.active,
        "manager_id": None,
        "services": default_services(),
        "created_at": now_iso(),
    }
    if not doc["hotel_name"] or not doc["city"]:
        raise HTTPException(400, "Otel adı ve şehir gerekli")
    await db.hotels.insert_one(doc.copy())
    return public_hotel(doc)

@api.patch("/system/hotels/{hotel_id}", response_model=HotelOut)
async def system_update_hotel(hotel_id: str, body: HotelUpdateIn, u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "services" in update:
        update["services"] = validate_services(update["services"])
    if update:
        await db.hotels.update_one({"id": hotel_id}, {"$set": update})
    h = await db.hotels.find_one({"id": hotel_id}, {"_id": 0})
    if not h:
        raise HTTPException(404, "Otel bulunamadı")
    return public_hotel(h)

@api.post("/system/hotels/{hotel_id}/activate", response_model=HotelOut)
async def system_activate_hotel(hotel_id: str, body: AccountDisableIn, u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    await db.hotels.update_one({"id": hotel_id}, {"$set": {"active": body.active}})
    h = await db.hotels.find_one({"id": hotel_id}, {"_id": 0})
    if not h:
        raise HTTPException(404, "Otel bulunamadı")
    return public_hotel(h)

@api.delete("/system/hotels/{hotel_id}")
async def system_delete_hotel(hotel_id: str, u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    res = await db.hotels.delete_one({"id": hotel_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Otel bulunamadı")
    await db.users.update_many({"$or": [{"hotel_id": hotel_id}, {"hotelId": hotel_id}]}, {"$set": {"active": False}})
    return {"ok": True}

@api.post("/system/managers", response_model=UserAdminOut)
async def system_create_manager(body: ManagerCreateIn, u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    validate_password(body.password)
    hotel = await db.hotels.find_one({"id": body.hotel_id}, {"_id": 0})
    if not hotel:
        raise HTTPException(404, "Otel bulunamadı")
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(409, "Bu e-posta zaten kayıtlı")
    manager = {
        "id": str(uuid.uuid4()),
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name.strip(),
        "role": "hotel_manager",
        "department": None,
        "room_no": None,
        "hotel_id": body.hotel_id,
        "hotelId": body.hotel_id,
        "active": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one(manager.copy())
    await db.hotels.update_one({"id": body.hotel_id}, {"$set": {"manager_id": manager["id"]}})
    return public_admin_user(manager)

@api.get("/system/managers", response_model=List[UserAdminOut])
async def system_list_managers(u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    docs = await db.users.find({"role": "hotel_manager"}, {"_id": 0}).sort("name", 1).to_list(500)
    return [public_admin_user(d) for d in docs]

@api.get("/system/users", response_model=List[UserAdminOut])
async def system_list_users(u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    docs = await db.users.find({}, {"_id": 0}).sort([("role", 1), ("name", 1)]).to_list(1000)
    return [public_admin_user(d) for d in docs]

@api.patch("/system/managers/{manager_id}", response_model=UserAdminOut)
async def system_update_manager(manager_id: str, body: ManagerUpdateIn, u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "email" in update:
        update["email"] = update["email"].lower()
        existing = await db.users.find_one({"email": update["email"], "id": {"$ne": manager_id}})
        if existing:
            raise HTTPException(409, "Bu e-posta zaten kayıtlı")
    if "hotel_id" in update:
        hotel = await db.hotels.find_one({"id": update["hotel_id"]}, {"_id": 0})
        if not hotel:
            raise HTTPException(404, "Otel bulunamadı")
        update["hotelId"] = update["hotel_id"]
    if update:
        await db.users.update_one({"id": manager_id, "role": "hotel_manager"}, {"$set": update})
        if "hotel_id" in update:
            await db.hotels.update_many({"manager_id": manager_id}, {"$set": {"manager_id": None}})
            await db.hotels.update_one({"id": update["hotel_id"]}, {"$set": {"manager_id": manager_id}})
    manager = await db.users.find_one({"id": manager_id, "role": "hotel_manager"}, {"_id": 0})
    if not manager:
        raise HTTPException(404, "Manager bulunamadı")
    return public_admin_user(manager)

@api.delete("/system/managers/{manager_id}")
async def system_delete_manager(manager_id: str, u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    res = await db.users.delete_one({"id": manager_id, "role": "hotel_manager"})
    if res.deleted_count == 0:
        raise HTTPException(404, "Manager bulunamadı")
    await db.hotels.update_many({"manager_id": manager_id}, {"$set": {"manager_id": None}})
    return {"ok": True}

@api.post("/system/managers/{manager_id}/reset-password")
async def system_reset_manager_password(manager_id: str, body: PasswordResetIn, u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    if len(body.new_password) < 4:
        raise HTTPException(400, "Şifre en az 4 karakter olmalı")
    res = await db.users.update_one(
        {"id": manager_id, "role": "hotel_manager"},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Manager bulunamadı")
    return {"ok": True}

@api.post("/system/accounts/{user_id}/active", response_model=UserAdminOut)
async def system_set_account_active(user_id: str, body: AccountDisableIn, u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    if user_id == u["id"]:
        raise HTTPException(400, "Kendi hesabınızı devre dışı bırakamazsınız")
    await db.users.update_one({"id": user_id}, {"$set": {"active": body.active}})
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    return public_admin_user(target)

@api.get("/system/stats")
async def system_stats(u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    return {
        "hotels": await db.hotels.count_documents({}),
        "active_hotels": await db.hotels.count_documents({"active": True}),
        "managers": await db.users.count_documents({"role": "hotel_manager"}),
        "staff": await db.users.count_documents({"role": "staff"}),
        "guests": await db.users.count_documents({"role": "guest"}),
        "users": await db.users.count_documents({}),
        "reservations": await db.reservations.count_documents({}),
        "requests": await db.requests.count_documents({}),
        "ai_messages": await db.chat_messages.count_documents({}),
    }

@api.get("/system/ai-usage")
async def system_ai_usage(u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    return {
        "messages": await db.chat_messages.count_documents({}),
        "sessions": len(await db.chat_messages.distinct("session_id")),
        "generated_requests": await db.requests.count_documents({}),
    }

@api.get("/system/logs")
async def system_logs(u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    docs = await db.logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs

@api.get("/system/settings")
async def system_get_settings(u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    doc = await db.settings.find_one({"id": "platform"}, {"_id": 0})
    return doc or {"id": "platform", "languages": ["tr"], "default_language": "tr"}

@api.post("/system/settings")
async def system_update_settings(body: Dict[str, Any], u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    body["id"] = "platform"
    await db.settings.update_one({"id": "platform"}, {"$set": body}, upsert=True)
    return await db.settings.find_one({"id": "platform"}, {"_id": 0})

# --------------------------------------------------------------------------
# Hotel Manager Account Management
# --------------------------------------------------------------------------
@api.get("/manager/hotel", response_model=HotelOut)
async def manager_get_hotel(u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    h = await db.hotels.find_one({"id": user_hotel_id(u)}, {"_id": 0})
    if not h:
        raise HTTPException(404, "Otel bulunamadı")
    return public_hotel(h)

@api.patch("/manager/hotel", response_model=HotelOut)
async def manager_update_hotel(body: HotelUpdateIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    update = {
        k: v for k, v in body.model_dump(exclude_unset=True).items()
        if v is not None and k in {"hotel_name", "city", "address", "services"}
    }
    if "services" in update:
        update["services"] = validate_services(update["services"])
    if update:
        await db.hotels.update_one({"id": user_hotel_id(u)}, {"$set": update})
    h = await db.hotels.find_one({"id": user_hotel_id(u)}, {"_id": 0})
    if not h:
        raise HTTPException(404, "Otel bulunamadı")
    return public_hotel(h)

@api.get("/manager/staff", response_model=List[UserAdminOut])
async def manager_list_staff(u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    docs = await db.users.find(with_hotel_scope(u, {"role": "staff"}), {"_id": 0}).sort("name", 1).to_list(300)
    return [public_admin_user(d) for d in docs]

@api.post("/manager/staff", response_model=UserAdminOut)
async def manager_create_staff(body: StaffCreateIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    validate_password(body.password)
    if body.department not in DEPARTMENTS:
        raise HTTPException(400, "Geçerli bir departman seçin")
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(409, "Bu e-posta zaten kayıtlı")
    staff = {
        "id": str(uuid.uuid4()),
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name.strip(),
        "role": "staff",
        "department": body.department,
        "room_no": None,
        "gender": body.gender.strip(),
        "birth_date": validate_birth_date(body.birth_date),
        "nationality": body.nationality.strip(),
        "country": body.country.strip(),
        "region_city": body.region_city.strip(),
        "hotel_id": user_hotel_id(u),
        "hotelId": user_hotel_id(u),
        "active": True,
        "created_at": now_iso(),
    }
    if not all([staff["name"], staff["gender"], staff["nationality"], staff["country"], staff["region_city"]]):
        raise HTTPException(400, "Çalışan profil alanları zorunludur")
    await db.users.insert_one(staff.copy())
    return public_admin_user(staff)

@api.patch("/manager/staff/{staff_id}", response_model=UserAdminOut)
async def manager_update_staff(staff_id: str, body: StaffUpdateIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if update.get("department") and update["department"] not in DEPARTMENTS:
        raise HTTPException(400, "Geçerli bir departman seçin")
    if "birth_date" in update:
        update["birth_date"] = validate_birth_date(update["birth_date"])
    for key in ("name", "gender", "nationality", "country", "region_city"):
        if key in update:
            update[key] = update[key].strip()
            if not update[key]:
                raise HTTPException(400, "Çalışan profil alanları boş olamaz")
    if update:
        await db.users.update_one(with_hotel_scope(u, {"id": staff_id, "role": "staff"}), {"$set": update})
    staff = await db.users.find_one(with_hotel_scope(u, {"id": staff_id, "role": "staff"}), {"_id": 0})
    if not staff:
        raise HTTPException(404, "Personel bulunamadı")
    return public_admin_user(staff)

@api.delete("/manager/staff/{staff_id}")
async def manager_delete_staff(staff_id: str, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    res = await db.users.delete_one(with_hotel_scope(u, {"id": staff_id, "role": "staff"}))
    if res.deleted_count == 0:
        raise HTTPException(404, "Personel bulunamadı")
    return {"ok": True}

@api.post("/manager/requests/{req_id}/assign", response_model=RequestOut)
async def manager_assign_task(req_id: str, body: AssignTaskIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    req = await db.requests.find_one(with_hotel_scope(u, {"id": req_id}), {"_id": 0})
    if not req:
        raise HTTPException(404, "Talep bulunamadı")
    services = await hotel_services_for_user(u)
    if not is_request_service_enabled(services, req):
        raise HTTPException(403, "Bu servis otelinizde aktif değil")
    if req["status"] != "ALINDI":
        raise HTTPException(400, "Yalnızca bekleyen talepler atanabilir")
    staff = await db.users.find_one(with_hotel_scope(u, {"id": body.staff_id, "role": "staff", "active": {"$ne": False}}), {"_id": 0})
    if not staff:
        raise HTTPException(404, "Personel bulunamadı")
    if staff.get("department") != req.get("departman"):
        raise HTTPException(400, "Personel departmanı talep departmanıyla uyuşmuyor")
    await db.requests.update_one(
        with_hotel_scope(u, {"id": req_id}),
        {"$set": {
            "assigned_staff_id": staff["id"],
            "assigned_staff_name": staff["name"],
            "status": "PERSONEL_GIDIYOR",
            "updated_at": now_iso(),
        }},
    )
    req = await db.requests.find_one(with_hotel_scope(u, {"id": req_id}), {"_id": 0})
    return public_request(req)

@api.get("/manager/guests", response_model=List[UserAdminOut])
async def manager_list_guests(u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    docs = await db.users.find(with_hotel_scope(u, {"role": "guest"}), {"_id": 0}).sort("name", 1).to_list(500)
    return [public_admin_user(d) for d in docs]

@api.post("/manager/guests", response_model=UserAdminOut)
async def manager_create_guest(body: GuestCreateIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    validate_password(body.password)
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(409, "Bu e-posta zaten kayıtlı")
    guest = {
        "id": str(uuid.uuid4()),
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name.strip(),
        "role": "guest",
        "department": None,
        "room_no": body.room_no,
        "hotel_id": user_hotel_id(u),
        "hotelId": user_hotel_id(u),
        "guest_type": body.guest_type,
        "active": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one(guest.copy())
    return public_admin_user(guest)

@api.patch("/manager/guests/{guest_id}", response_model=UserAdminOut)
async def manager_update_guest(guest_id: str, body: GuestUpdateIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if update:
        await db.users.update_one(with_hotel_scope(u, {"id": guest_id, "role": "guest"}), {"$set": update})
    guest = await db.users.find_one(with_hotel_scope(u, {"id": guest_id, "role": "guest"}), {"_id": 0})
    if not guest:
        raise HTTPException(404, "Misafir bulunamadı")
    return public_admin_user(guest)

@api.get("/manager/reports")
async def manager_reports(u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    return {
        "reservations": await db.reservations.count_documents(with_hotel_scope(u)),
        "open_requests": await db.requests.count_documents(with_hotel_scope(u, {"status": {"$in": ["ALINDI", "PERSONEL_GIDIYOR"]}})),
        "staff": await db.users.count_documents(with_hotel_scope(u, {"role": "staff", "active": {"$ne": False}})),
        "rooms": await db.rooms.count_documents(with_hotel_scope(u)),
    }

@api.get("/manager/announcements")
async def manager_list_announcements(u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    docs = await db.announcements.find(with_hotel_scope(u), {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs

@api.post("/manager/announcements")
async def manager_create_announcement(body: AnnouncementIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    doc = {
        "id": str(uuid.uuid4()),
        "hotel_id": user_hotel_id(u),
        "hotelId": user_hotel_id(u),
        "title": body.title.strip(),
        "message": body.message.strip(),
        "active": body.active,
        "created_at": now_iso(),
    }
    if not doc["title"] or not doc["message"]:
        raise HTTPException(400, "Başlık ve mesaj gerekli")
    await db.announcements.insert_one(doc.copy())
    return doc

# --------------------------------------------------------------------------
# Seed demo data
# --------------------------------------------------------------------------
async def ensure_system_admin() -> None:
    """Ensure the initial system_admin exists. Idempotent; never stores plain passwords."""
    email = SYSTEM_ADMIN_EMAIL
    if not email:
        return

    set_fields: Dict[str, Any] = {
        "role": "system_admin",
        "active": True,
        "hotel_id": None,
        "hotelId": None,
    }
    if SYSTEM_ADMIN_PASSWORD_FROM_ENV:
        set_fields["password_hash"] = hash_password(SYSTEM_ADMIN_PASSWORD)

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        await db.users.update_one({"email": email}, {"$set": set_fields})
        return

    legacy = await db.users.find_one({"email": LEGACY_SYSTEM_ADMIN_EMAIL}, {"_id": 0})
    if legacy:
        set_fields["email"] = email
        await db.users.update_one({"email": LEGACY_SYSTEM_ADMIN_EMAIL}, {"$set": set_fields})
        return

    other_admin = await db.users.find_one({"role": "system_admin"}, {"_id": 0})
    if other_admin:
        logger.info(
            "System admin already exists with email %s; skipping creation of %s",
            other_admin.get("email"),
            email,
        )
        return

    if not SYSTEM_ADMIN_PASSWORD_FROM_ENV:
        logger.warning(
            "SYSTEM_ADMIN_PASSWORD is not set; cannot create initial system admin for %s",
            email,
        )
        return

    await db.users.insert_one({
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(SYSTEM_ADMIN_PASSWORD),
        "name": "Burak Altay",
        "role": "system_admin",
        "department": None,
        "room_no": None,
        "hotel_id": None,
        "hotelId": None,
        "active": True,
        "created_at": now_iso(),
    })

async def seed_demo():
    if await db.users.count_documents({}) > 0:
        await db.users.update_many({"role": "admin"}, {"$set": {"role": "hotel_manager"}})
        await db.users.update_many({"hotel_id": {"$exists": True}, "hotelId": {"$exists": False}}, [{"$set": {"hotelId": "$hotel_id"}}])
        await db.requests.update_many({"hotel_id": {"$exists": True}, "hotelId": {"$exists": False}}, [{"$set": {"hotelId": "$hotel_id"}}])
        await db.rooms.update_many({"hotel_id": {"$exists": True}, "hotelId": {"$exists": False}}, [{"$set": {"hotelId": "$hotel_id"}}])
        await db.reservations.update_many({"hotel_id": {"$exists": True}, "hotelId": {"$exists": False}}, [{"$set": {"hotelId": "$hotel_id"}}])
        await db.hotels.update_many({"services": {"$exists": False}}, {"$set": {"services": default_services()}})
        if not await db.hotels.find_one({"id": DEFAULT_HOTEL_ID}):
            await db.hotels.insert_one({
                "id": DEFAULT_HOTEL_ID,
                "hotel_name": "Astoria",
                "city": "Istanbul",
                "address": "Demo Hotel",
                "active": True,
                "manager_id": None,
                "services": default_services(),
                "created_at": now_iso(),
            })
        await ensure_system_admin()
        if not await db.users.find_one({"email": "manager@hotel.com"}):
            manager = {
                "id": str(uuid.uuid4()),
                "email": "manager@hotel.com",
                "password_hash": hash_password("manager123"),
                "name": "Hotel Manager",
                "role": "hotel_manager",
                "department": None,
                "room_no": None,
                "hotel_id": DEFAULT_HOTEL_ID,
                "hotelId": DEFAULT_HOTEL_ID,
                "active": True,
                "created_at": now_iso(),
            }
            await db.users.insert_one(manager.copy())
            await db.hotels.update_one({"id": DEFAULT_HOTEL_ID}, {"$set": {"manager_id": manager["id"]}})
        return
    logger.info("Seeding demo data...")
    await db.hotels.insert_one({
        "id": DEFAULT_HOTEL_ID,
        "hotel_name": "Astoria",
        "city": "Istanbul",
        "address": "Demo Hotel",
        "active": True,
        "manager_id": None,
        "services": default_services(),
        "created_at": now_iso(),
    })
    await ensure_system_admin()
    users = [
        {"email": "manager@hotel.com", "password": "manager123", "name": "Hotel Manager", "role": "hotel_manager"},
        {"email": "misafir@hotel.com", "password": "misafir123", "name": "Ahmet Yılmaz", "role": "guest", "room_no": "204"},
        {"email": "misafir2@hotel.com", "password": "misafir123", "name": "Ayşe Demir", "role": "guest", "room_no": "315"},
        {"email": "kurutemizleme@hotel.com", "password": "personel123", "name": "Mehmet (Kuru Temizleme)", "role": "staff", "department": "kuru_temizleme"},
        {"email": "odaservisi@hotel.com", "password": "personel123", "name": "Selin (Oda Servisi)", "role": "staff", "department": "oda_servisi"},
        {"email": "teknik@hotel.com", "password": "personel123", "name": "Burak (Teknik)", "role": "staff", "department": "teknik_destek"},
        {"email": "housekeeping@hotel.com", "password": "personel123", "name": "Elif (Housekeeping)", "role": "staff", "department": "housekeeping"},
        {"email": "vale@hotel.com", "password": "personel123", "name": "Can (Vale)", "role": "staff", "department": "vale"},
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
            "hotel_id": DEFAULT_HOTEL_ID if u["role"] != "system_admin" else None,
            "hotelId": DEFAULT_HOTEL_ID if u["role"] != "system_admin" else None,
            "guest_type": "standard" if u["role"] == "guest" else None,
            "active": True,
            "created_at": now_iso(),
        }
        await db.users.insert_one(doc)
        if u["role"] == "hotel_manager":
            await db.hotels.update_one({"id": DEFAULT_HOTEL_ID}, {"$set": {"manager_id": doc["id"]}})

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
            "hotel_id": DEFAULT_HOTEL_ID,
            "hotelId": DEFAULT_HOTEL_ID,
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
            "hotel_id": DEFAULT_HOTEL_ID,
            "hotelId": DEFAULT_HOTEL_ID,
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
            "hotel_id": DEFAULT_HOTEL_ID,
            "hotelId": DEFAULT_HOTEL_ID,
            "payment_status": "pending",
            "guest_type": "standard",
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
    allow_credentials=False, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)
