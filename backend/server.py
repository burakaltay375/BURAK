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
import base64
import hashlib
import io
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any, Literal

import bcrypt
import jwt as pyjwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from dotenv import load_dotenv

try:
    from PIL import Image, ImageStat
except Exception:
    Image = None
    ImageStat = None

try:
    import cv2
    import numpy as np
except Exception:
    cv2 = None
    np = None

try:
    import pytesseract
except Exception:
    pytesseract = None

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
IDENTITY_ENCRYPTION_KEY = os.environ.get("IDENTITY_ENCRYPTION_KEY", "")

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
RoomStatus = Literal["available", "reserved", "occupied", "cleaning", "maintenance"]
RoomOperationalStatus = Literal["normal", "cleaning", "maintenance"]
RoomType = Literal["Standard", "Deluxe", "Suite", "Family", "VIP"]
ReservationIdentityStatus = Literal[
    "not_required",
    "waiting_for_verification",
    "partially_verified",
    "fully_verified",
    "verification_failed",
    "pending_review",
    "verified_by_hotel",
    "failed",
]
IdentitySubjectType = Literal["guest", "employee"]
IdentityDocumentType = Literal["id_front", "id_back", "passport", "selfie", "other"]
GuestVerificationStatus = Literal["unverified", "pending", "verified", "rejected", "expired"]
EmployeeVerificationStatus = Literal["application_received", "identity_required", "in_review", "approved", "rejected", "active_employee"]
VerificationStatus = Literal[
    "unverified", "pending", "verified", "rejected", "expired",
    "application_received", "identity_required", "in_review", "approved", "active_employee",
    "not_started", "pending_review", "verified_by_hotel", "needs_review", "needs_new_documents", "suspicious",
]
FraudRisk = Literal["low", "medium", "high", "unknown"]
AnalysisStatus = Literal["pending", "completed", "unavailable", "failed"]
PanterRequestType = Literal["quotation", "recruitment", "inspection"]
PanterInspectionStatus = Literal[
    "Pending Inspection",
    "Scheduled",
    "Inspector Assigned",
    "Inspection In Progress",
    "Inspection Completed",
    "Report Uploaded",
    "Cancelled",
]
PanterOperationEventType = Literal[
    "Security Inspection",
    "Customer Meeting",
    "Site Survey",
    "Employee Training",
    "Internal Meeting",
    "Equipment Maintenance",
    "Reminder",
    "Other",
]
PanterOperationEventStatus = Literal["Pending", "Scheduled", "Confirmed", "In Progress", "Completed", "Cancelled"]
PanterOperationPriority = Literal["Low", "Medium", "High", "Urgent"]

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
    capacity: Optional[int] = 1
    room_id: Optional[str] = None
    room_number: Optional[str] = None  # may be assigned by admin later
    payment_status: PaymentStatus = "pending"
    guest_type: GuestType = "standard"
    identity_verification_requested: bool = False
    identity_members: List[Dict[str, Any]] = Field(default_factory=list)
    identity_session_id: Optional[str] = None

class AdminReservationIn(BaseModel):
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    check_in_date: str
    check_out_date: str
    capacity: Optional[int] = 1
    room_id: Optional[str] = None
    room_number: Optional[str] = None
    status: ReservationStatus = "pending"
    payment_status: PaymentStatus = "pending"
    guest_type: GuestType = "standard"
    identity_verification_requested: bool = False
    identity_members: List[Dict[str, Any]] = Field(default_factory=list)
    identity_session_id: Optional[str] = None

class ReservationIdentityStartIn(BaseModel):
    customer_name: str
    customer_email: EmailStr
    capacity: int = Field(1, ge=1, le=4)
    identity_members: List[Dict[str, Any]] = Field(default_factory=list)

class ReservationIdentityStartOut(BaseModel):
    session_id: str
    status: ReservationIdentityStatus = "waiting_for_verification"
    identity_members: List[Dict[str, Any]]

class AdminReservationUpdateIn(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    check_in_date: Optional[str] = None
    check_out_date: Optional[str] = None
    capacity: Optional[int] = None
    room_id: Optional[str] = None
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
    capacity: Optional[int] = 1
    room_id: Optional[str] = None
    room_number: Optional[str] = None
    room_name: Optional[str] = None
    price_per_night: Optional[float] = None
    total_nights: Optional[int] = None
    total_price: Optional[float] = None
    check_in_date: Optional[str] = None
    check_out_date: Optional[str] = None
    status: ReservationStatus
    access_code: str
    user_id: Optional[str] = None
    email_sent: Optional[bool] = False
    hotel_id: Optional[str] = None
    payment_status: PaymentStatus = "pending"
    guest_type: GuestType = "standard"
    identity_verification_requested: bool = False
    identity_status: ReservationIdentityStatus = "not_required"
    identity_members: List[Dict[str, Any]] = Field(default_factory=list)
    identity_failure_reason: Optional[str] = None
    entry_code_expires_at: Optional[str] = None
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

class HotelInfoKnowledge(BaseModel):
    hotel_name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    star_rating: Optional[str] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None

class HotelServicesKnowledge(BaseModel):
    wifi: Optional[str] = None
    parking: Optional[str] = None
    swimming_pool: Optional[str] = None
    spa: Optional[str] = None
    sauna: Optional[str] = None
    gym: Optional[str] = None
    laundry: Optional[str] = None
    airport_transfer: Optional[str] = None
    room_service: Optional[str] = None
    pet_policy: Optional[str] = None

class RestaurantKnowledge(BaseModel):
    breakfast_hours: Optional[str] = None
    lunch_hours: Optional[str] = None
    dinner_hours: Optional[str] = None
    restaurant_menu: Optional[str] = None
    room_service_hours: Optional[str] = None

class RoomKnowledge(BaseModel):
    room_types: Optional[str] = None
    room_features: Optional[str] = None
    balcony: Optional[str] = None
    sea_view: Optional[str] = None
    air_conditioning: Optional[str] = None
    mini_bar: Optional[str] = None
    safe: Optional[str] = None
    tv: Optional[str] = None
    coffee_machine: Optional[str] = None

class PolicyKnowledge(BaseModel):
    smoking_policy: Optional[str] = None
    cancellation_policy: Optional[str] = None
    child_policy: Optional[str] = None
    early_check_in: Optional[str] = None
    late_check_out: Optional[str] = None
    pet_rules: Optional[str] = None

class NearbyPlace(BaseModel):
    id: Optional[str] = None
    name: str = ""
    category: str = ""
    description: str = ""
    distance: str = ""

class HotelEvent(BaseModel):
    id: Optional[str] = None
    name: str = ""
    time: str = ""
    description: str = ""

class PaidHotelService(BaseModel):
    id: Optional[str] = None
    name: str = ""
    is_paid: bool = False
    price: str = ""
    description: str = ""

class GeneralHotelKnowledge(BaseModel):
    all_information: Optional[str] = None

class FaqItem(BaseModel):
    id: Optional[str] = None
    question: str = ""
    answer: str = ""

class CustomKnowledgeEntry(BaseModel):
    id: Optional[str] = None
    title: str = ""
    content: str = ""

class HotelAiKnowledgeUpdateIn(BaseModel):
    hotel_info: HotelInfoKnowledge = Field(default_factory=HotelInfoKnowledge)
    services: HotelServicesKnowledge = Field(default_factory=HotelServicesKnowledge)
    restaurant: RestaurantKnowledge = Field(default_factory=RestaurantKnowledge)
    rooms: RoomKnowledge = Field(default_factory=RoomKnowledge)
    policies: PolicyKnowledge = Field(default_factory=PolicyKnowledge)
    general_info: GeneralHotelKnowledge = Field(default_factory=GeneralHotelKnowledge)
    events: List[HotelEvent] = Field(default_factory=list)
    paid_services: List[PaidHotelService] = Field(default_factory=list)
    nearby_places: List[NearbyPlace] = Field(default_factory=list)
    faq: List[FaqItem] = Field(default_factory=list)
    custom_entries: List[CustomKnowledgeEntry] = Field(default_factory=list)

class HotelAiKnowledgeOut(HotelAiKnowledgeUpdateIn):
    hotel_id: str
    hotelId: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None

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
    start_identity_verification: bool = False

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
    identity_status: Optional[str] = None
    active: bool = True


class PanterAdminRequestIn(BaseModel):
    type: PanterRequestType
    payload: Dict[str, Any] = Field(default_factory=dict)
    source: str = "panter-ai"


class PanterAdminRequestOut(BaseModel):
    id: str
    type: PanterRequestType
    payload: Dict[str, Any]
    source: str
    status: str
    created_at: str
    updated_at: str


class PanterInspectionStatusIn(BaseModel):
    status: PanterInspectionStatus
    notes: Optional[str] = None


class PanterAdminRequestUpdateIn(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


class PanterAppointmentIn(BaseModel):
    title: str
    description: Optional[str] = None
    date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    event_type: PanterOperationEventType = "Other"
    priority: PanterOperationPriority = "Medium"
    status: PanterOperationEventStatus = "Scheduled"
    assigned_employee_id: Optional[str] = None
    assigned_employee_name: Optional[str] = None
    customer: Optional[str] = None
    project: Optional[str] = None
    address: Optional[str] = None
    attachments: List[Dict[str, Any]] = Field(default_factory=list)
    view_type: Optional[str] = None
    request_id: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None


class PanterCvIn(BaseModel):
    candidate_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    file_name: str
    mime_type: str = "application/pdf"
    data_uri: str
    notes: Optional[str] = None


class PanterCvUpdateIn(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    interview_at: Optional[str] = None
    ai_score: Optional[int] = None


class PanterInspectorAssignIn(BaseModel):
    inspector_id: str


class PanterReportUploadIn(BaseModel):
    file_name: str
    mime_type: str = "application/pdf"
    data_uri: str
    notes: Optional[str] = None


class PanterAiDocumentIn(BaseModel):
    title: str
    content: Optional[str] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    data_uri: Optional[str] = None


class PanterAiFeedbackIn(BaseModel):
    conversation_id: Optional[str] = None
    rating: Optional[int] = None
    comment: Optional[str] = None


class PanterShiftEmployeeIn(BaseModel):
    id: Optional[str] = None
    name: str
    position: Optional[str] = None
    certificates: List[str] = Field(default_factory=list)
    armed: bool = False
    salary: float = 0
    overtime_cost: float = 0
    availability: List[str] = Field(default_factory=list)
    leave_days: List[str] = Field(default_factory=list)
    weekly_working_hours: float = 0
    maximum_working_hours: float = 45
    preferred_shift: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    assigned_projects: List[str] = Field(default_factory=list)


class PanterShiftPlanIn(BaseModel):
    project: str
    date_range: Dict[str, str]
    working_hours: Optional[str] = None
    shift_times: List[Dict[str, Any]]
    required_number_of_employees: int
    required_roles: List[str] = Field(default_factory=list)
    required_certificates: List[str] = Field(default_factory=list)
    required_armed_guards: int = 0
    required_unarmed_guards: int = 0
    labor_rules: Dict[str, Any] = Field(default_factory=dict)
    employees: List[PanterShiftEmployeeIn]


class PanterShiftPlanUpdateIn(BaseModel):
    status: Optional[str] = None
    schedule: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


PanterProjectStatus = Literal["Active", "Passive"]
PanterProjectShiftDuration = Literal["8 Hour", "12 Hour", "Custom Shift"]
PanterPostArmedRequirement = Literal["Armed", "Unarmed", "Both"]


class PanterSecurityPostIn(BaseModel):
    id: Optional[str] = None
    post_name: str
    required_personnel: int = 0
    armed_required: bool = False
    armed_requirement: PanterPostArmedRequirement = "Unarmed"
    fixed_position: bool = True
    patrol_duty: bool = False


class PanterProjectEmployeeIn(BaseModel):
    id: Optional[str] = None
    name: str
    position: str = "Güvenlik Görevlisi"
    armed: bool = False
    duty: Optional[str] = None
    certificates: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    weekly_working_hours: float = 0
    maximum_working_hours: float = 45
    preferred_shift: Optional[str] = None


class PanterProjectPersonnelRequirementsIn(BaseModel):
    total_required_personnel: int = 0
    required_armed_security_guards: int = 0
    required_unarmed_security_guards: int = 0
    required_shift_supervisors: int = 0
    required_reception_personnel: int = 0
    required_mobile_patrol_personnel: int = 0


class PanterProjectShiftConfigurationIn(BaseModel):
    number_of_shifts: int = 1
    morning_shift_start: Optional[str] = None
    morning_shift_end: Optional[str] = None
    evening_shift_start: Optional[str] = None
    evening_shift_end: Optional[str] = None
    night_shift_start: Optional[str] = None
    night_shift_end: Optional[str] = None
    shift_duration: PanterProjectShiftDuration = "8 Hour"
    custom_shift_hours: Optional[float] = None


class PanterProjectIn(BaseModel):
    project_name: str
    customer_company_name: str
    project_code: Optional[str] = None
    project_start_date: str
    project_end_date: Optional[str] = None
    project_status: PanterProjectStatus = "Active"
    personnel_requirements: PanterProjectPersonnelRequirementsIn
    shift_configuration: PanterProjectShiftConfigurationIn
    security_posts: List[PanterSecurityPostIn] = Field(default_factory=list)
    employees: List[PanterProjectEmployeeIn] = Field(default_factory=list)
    labor_rules: Dict[str, Any] = Field(default_factory=dict)
    company_policies: Dict[str, Any] = Field(default_factory=dict)


class PanterProjectUpdateIn(BaseModel):
    project_name: Optional[str] = None
    customer_company_name: Optional[str] = None
    project_code: Optional[str] = None
    project_start_date: Optional[str] = None
    project_end_date: Optional[str] = None
    project_status: Optional[PanterProjectStatus] = None
    personnel_requirements: Optional[PanterProjectPersonnelRequirementsIn] = None
    shift_configuration: Optional[PanterProjectShiftConfigurationIn] = None
    security_posts: Optional[List[PanterSecurityPostIn]] = None
    employees: Optional[List[PanterProjectEmployeeIn]] = None
    labor_rules: Optional[Dict[str, Any]] = None
    company_policies: Optional[Dict[str, Any]] = None


PanterSupportPriority = Literal["Low", "Medium", "High", "Urgent"]
PanterSupportArmedRequirement = Literal["Armed", "Unarmed", "Any"]
PanterSupportStatus = Literal["Draft", "Pending", "Approved", "Rejected", "Completed", "Cancelled"]


class PanterSupportRequestIn(BaseModel):
    destination_project_id: str
    required_personnel: int = 1
    armed_requirement: PanterSupportArmedRequirement = "Any"
    required_position: Optional[str] = None
    date: str
    start_time: str
    end_time: str
    reason: str
    priority: PanterSupportPriority = "Medium"


class PanterSupportRequestUpdateIn(BaseModel):
    destination_project_id: Optional[str] = None
    required_personnel: Optional[int] = None
    armed_requirement: Optional[PanterSupportArmedRequirement] = None
    required_position: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    reason: Optional[str] = None
    priority: Optional[PanterSupportPriority] = None
    status: Optional[PanterSupportStatus] = None


class PanterSupportApprovalIn(BaseModel):
    employee_ids: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class PanterSupportRejectIn(BaseModel):
    notes: Optional[str] = None

class RoomIn(BaseModel):
    room_number: str
    room_name: Optional[str] = None
    room_type: RoomType = "Standard"
    type: Optional[str] = None
    floor: Optional[str] = None
    capacity: int = 2
    price_per_night: float = 0
    operational_status: RoomOperationalStatus = "normal"
    is_active: bool = True
    description: Optional[str] = None

class RoomUpdateIn(BaseModel):
    room_number: Optional[str] = None
    room_name: Optional[str] = None
    room_type: Optional[RoomType] = None
    type: Optional[str] = None
    floor: Optional[str] = None
    capacity: Optional[int] = None
    price_per_night: Optional[float] = None
    operational_status: Optional[RoomOperationalStatus] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None

class RoomOut(BaseModel):
    id: str
    room_number: str
    room_name: Optional[str] = None
    room_type: RoomType
    type: str
    floor: Optional[str] = None
    capacity: int
    price_per_night: float
    status: RoomStatus
    operational_status: RoomOperationalStatus = "normal"
    is_active: bool = True
    description: Optional[str] = None
    current_guest_name: Optional[str] = None
    active_reservation_id: Optional[str] = None
    created_at: str
    updated_at: str

class RoomStatusIn(BaseModel):
    status: RoomOperationalStatus

class RoomPriceOut(BaseModel):
    room_id: str
    room_number: str
    room_name: Optional[str] = None
    room_type: RoomType
    price_per_night: float
    total_nights: int
    total_price: float

class AssignTaskIn(BaseModel):
    staff_id: str

class AnnouncementIn(BaseModel):
    title: str
    message: str
    active: bool = True

class IdentityStartIn(BaseModel):
    user_id: Optional[str] = None
    subject_type: Optional[IdentitySubjectType] = None

class IdentityProfileIn(BaseModel):
    first_name: str
    last_name: str
    birth_date: str
    nationality: str
    document_type: str
    document_number: str
    document_expiry_date: Optional[str] = None
    employee_role: Optional[str] = None
    employment_start_date: Optional[str] = None
    manager_approved: Optional[bool] = None
    internal_notes: Optional[str] = None

class IdentityDocumentUploadIn(BaseModel):
    document_type: IdentityDocumentType
    file_name: str
    mime_type: str = "image/jpeg"
    data_uri: str

class SelfieUploadIn(BaseModel):
    data_uri: str
    file_name: str = "selfie.jpg"
    mime_type: str = "image/jpeg"
    completed_actions: List[str] = Field(default_factory=list)
    challenge_id: Optional[str] = None

class LivenessChallengeOut(BaseModel):
    id: str
    actions: List[str]
    expires_at: str

class IdentityDecisionIn(BaseModel):
    note: Optional[str] = None

class IdentityDocumentOut(BaseModel):
    id: str
    verification_id: str
    document_type: IdentityDocumentType
    file_name: str
    mime_type: str
    size: int
    checksum: str
    perceptual_hash: Optional[str] = None
    quality: Dict[str, Any] = Field(default_factory=dict)
    uploaded_by: str
    created_at: str

class OcrResultOut(BaseModel):
    id: str
    verification_id: str
    status: AnalysisStatus
    extracted: Dict[str, Any] = Field(default_factory=dict)
    mismatches: List[str] = Field(default_factory=list)
    confidence: float = 0
    provider: str = "internal"
    created_at: str

class FaceResultOut(BaseModel):
    id: str
    verification_id: str
    status: AnalysisStatus
    face_present: bool = False
    document_face_present: bool = False
    similarity_score: float = 0
    liveness_score: float = 0
    completed_actions: List[str] = Field(default_factory=list)
    provider: str = "internal"
    created_at: str

class FraudAnalysisOut(BaseModel):
    id: str
    verification_id: str
    status: AnalysisStatus
    fraud_risk: FraudRisk = "unknown"
    confidence_score: int = 0
    signals: List[str] = Field(default_factory=list)
    duplicate_hits: List[str] = Field(default_factory=list)
    recommended_status: VerificationStatus = "needs_review"
    provider: str = "internal"
    created_at: str

class VerificationHistoryOut(BaseModel):
    id: str
    verification_id: str
    from_status: Optional[str] = None
    to_status: str
    note: Optional[str] = None
    actor_id: str
    actor_role: str
    created_at: str

class IdentityVerificationOut(BaseModel):
    id: str
    user_id: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    hotel_id: str
    hotelId: str
    role: Role
    subject_type: IdentitySubjectType
    status: VerificationStatus
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    birth_date: Optional[str] = None
    nationality: Optional[str] = None
    document_type: Optional[str] = None
    masked_document_number: Optional[str] = None
    document_expiry_date: Optional[str] = None
    employee_role: Optional[str] = None
    employment_start_date: Optional[str] = None
    manager_approved: Optional[bool] = None
    internal_notes: Optional[str] = None
    documents: List[IdentityDocumentOut] = Field(default_factory=list)
    latest_ocr: Optional[OcrResultOut] = None
    latest_face: Optional[FaceResultOut] = None
    latest_fraud: Optional[FraudAnalysisOut] = None
    confidence_score: Optional[int] = None
    fraud_risk: Optional[FraudRisk] = None
    created_by: str
    updated_by: Optional[str] = None
    created_at: str
    updated_at: str

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
        hotel_id=hid, hotelId=hid, guest_type=u.get("guest_type"), identity_status=u.get("identity_status"),
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
        identity_status=u.get("identity_status"),
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

def normalize_reservation_identity_members(raw_members: Optional[List[Dict[str, Any]]], primary_name: str, capacity: int) -> list[dict]:
    relation_labels = ["Adult 1", "Adult 2", "Child 1", "Child 2"]
    members: list[dict] = []
    seen = 0
    for idx, item in enumerate(raw_members or []):
        name = str((item or {}).get("name") or "").strip()
        relation = str((item or {}).get("relation") or relation_labels[min(idx, len(relation_labels) - 1)]).strip()
        if not name:
            continue
        members.append({
            "id": str((item or {}).get("id") or uuid.uuid4()),
            "name": name,
            "relation": relation or "Misafir",
            "status": str((item or {}).get("status") or "waiting_for_verification"),
            "verification_id": (item or {}).get("verification_id"),
        })
        seen += 1
        if seen >= max(1, min(4, capacity)):
            break
    if not members:
        members.append({"id": str(uuid.uuid4()), "name": primary_name.strip(), "relation": "Adult 1", "status": "waiting_for_verification", "verification_id": None})
    return members

async def create_identity_alert(hotel_id: str, reservation_id: str, title: str, detail: str, severity: str = "warning") -> None:
    await db.identity_alerts.insert_one({
        "id": str(uuid.uuid4()),
        "hotel_id": hotel_id,
        "hotelId": hotel_id,
        "reservation_id": reservation_id,
        "title": title,
        "detail": detail,
        "severity": severity,
        "read": False,
        "created_at": now_iso(),
    })

def public_reservation_identity_status(raw_status: Optional[str], requested: bool) -> ReservationIdentityStatus:
    if not requested:
        return "not_required"
    mapping = {
        "pending_review": "waiting_for_verification",
        "verified_by_hotel": "fully_verified",
        "failed": "verification_failed",
    }
    return mapping.get(raw_status or "waiting_for_verification", raw_status or "waiting_for_verification")

def verification_status_for_reservation(status_value: Optional[str]) -> str:
    if status_value in {"verified_by_hotel", "verified", "approved", "active_employee"}:
        return "verified"
    if status_value in {"rejected", "suspicious"}:
        return "failed"
    if status_value == "needs_new_documents":
        return "needs_new_documents"
    return "pending_review"

async def generate_entry_code_for_reservation(reservation: dict) -> dict:
    code = await unique_access_code()
    expires_base = reservation.get("check_out_date") or datetime.now(timezone.utc).date().isoformat()
    try:
        expires_at = (datetime.strptime(expires_base, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)).isoformat()
    except Exception:
        expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    return {
        "access_code": code,
        "encrypted_entry_code": encrypt_sensitive(code),
        "entry_code_hash": identity_fingerprint(code),
        "entry_code_expires_at": expires_at,
    }

async def create_reservation_identity_records(reservation: dict, actor_id: str = "system") -> list[dict]:
    now = now_iso()
    members = reservation.get("identity_members") or []
    updated_members: list[dict] = []
    for member in members:
        verification_id = member.get("verification_id") or str(uuid.uuid4())
        synthetic_user_id = f"reservation:{reservation['id']}:{member['id']}"
        profile_name = (member.get("name") or "").strip()
        first_name, _, last_name = profile_name.partition(" ")
        verification = {
            "id": verification_id,
            "user_id": synthetic_user_id,
            "reservation_id": reservation["id"],
            "reservation_member_id": member["id"],
            "hotel_id": reservation.get("hotel_id") or reservation.get("hotelId") or DEFAULT_HOTEL_ID,
            "hotelId": reservation.get("hotelId") or reservation.get("hotel_id") or DEFAULT_HOTEL_ID,
            "role": "guest",
            "subject_type": "guest",
            "status": "pending_review",
            "profile": {
                "first_name": first_name,
                "last_name": last_name,
                "birth_date": None,
                "nationality": None,
                "document_type": None,
                "relation": member.get("relation"),
            },
            "encrypted_profile": {},
            "masked_document_number": None,
            "created_by": actor_id,
            "updated_by": actor_id,
            "created_at": now,
            "updated_at": now,
        }
        await db.identity_verifications.update_one({"id": verification_id}, {"$setOnInsert": verification}, upsert=True)
        await append_verification_history({**verification, "status": None}, {"id": actor_id, "role": "system"}, "pending_review", "Rezervasyon kişi doğrulaması başlatıldı")
        updated_members.append({**member, "verification_id": verification_id, "status": "pending_review"})
    await db.reservations.update_one({"id": reservation["id"]}, {"$set": {"identity_members": updated_members}})
    return updated_members

async def create_reservation_identity_session(body: ReservationIdentityStartIn, hotel_id: str = DEFAULT_HOTEL_ID, actor_id: str = "public") -> dict:
    name = body.customer_name.strip()
    if not name:
        raise HTTPException(400, "Customer name is required before starting identity verification")
    email = body.customer_email.lower().strip()
    members = normalize_reservation_identity_members(body.identity_members, name, body.capacity)
    if len(members) < body.capacity:
        raise HTTPException(400, "Every guest must be listed before starting identity verification")
    session_id = str(uuid.uuid4())
    now = now_iso()
    updated_members: list[dict] = []
    for member in members:
        verification_id = str(uuid.uuid4())
        synthetic_user_id = f"reservation-session:{session_id}:{member['id']}"
        profile_name = (member.get("name") or "").strip()
        first_name, _, last_name = profile_name.partition(" ")
        verification = {
            "id": verification_id,
            "user_id": synthetic_user_id,
            "identity_session_id": session_id,
            "reservation_id": None,
            "reservation_member_id": member["id"],
            "hotel_id": hotel_id,
            "hotelId": hotel_id,
            "role": "guest",
            "subject_type": "guest",
            "status": "pending_review",
            "profile": {
                "first_name": first_name,
                "last_name": last_name,
                "birth_date": None,
                "nationality": None,
                "document_type": None,
                "relation": member.get("relation"),
                "reservation_email": email,
            },
            "encrypted_profile": {},
            "masked_document_number": None,
            "created_by": actor_id,
            "updated_by": actor_id,
            "created_at": now,
            "updated_at": now,
        }
        await db.identity_verifications.insert_one(verification.copy())
        await append_verification_history({**verification, "status": None}, {"id": actor_id, "role": "system"}, "pending_review", "Reservation identity workflow started")
        updated_members.append({**member, "verification_id": verification_id, "status": "pending_review"})
    logger.info("Reservation identity workflow started: session=%s email=%s members=%s", session_id, email, len(updated_members))
    return {"session_id": session_id, "status": "waiting_for_verification", "identity_members": updated_members}

async def attach_identity_session_to_reservation(session_id: str, reservation: dict) -> list[dict]:
    verifications = await db.identity_verifications.find({"identity_session_id": session_id}, {"_id": 0}).to_list(100)
    if not verifications:
        raise HTTPException(400, "Identity verification session was not found")
    members = []
    by_member = {v.get("reservation_member_id"): v for v in verifications}
    for member in reservation.get("identity_members") or []:
        verification = by_member.get(member.get("id"))
        if verification:
            members.append({**member, "verification_id": verification["id"], "status": verification_status_for_reservation(verification.get("status"))})
    if not members:
        members = [
            {
                "id": v.get("reservation_member_id") or str(uuid.uuid4()),
                "name": " ".join([v.get("profile", {}).get("first_name") or "", v.get("profile", {}).get("last_name") or ""]).strip() or "Guest",
                "relation": v.get("profile", {}).get("relation") or "Guest",
                "verification_id": v["id"],
                "status": verification_status_for_reservation(v.get("status")),
            }
            for v in verifications
        ]
    await db.identity_verifications.update_many(
        {"identity_session_id": session_id},
        {"$set": {"reservation_id": reservation["id"], "hotel_id": reservation.get("hotel_id"), "hotelId": reservation.get("hotelId"), "updated_at": now_iso()}},
    )
    await db.reservations.update_one({"id": reservation["id"]}, {"$set": {"identity_members": members}})
    return members

async def sync_reservation_identity_status(reservation_id: str) -> Optional[dict]:
    reservation = await db.reservations.find_one({"id": reservation_id}, {"_id": 0})
    if not reservation or not reservation.get("identity_verification_requested"):
        return reservation
    verifications = await db.identity_verifications.find({"reservation_id": reservation_id}, {"_id": 0}).to_list(100)
    members = reservation.get("identity_members") or []
    by_member = {v.get("reservation_member_id"): v for v in verifications}
    verified_count = 0
    failed = False
    synced_members = []
    for member in members:
        verification = by_member.get(member.get("id"))
        member_status = verification_status_for_reservation((verification or {}).get("status"))
        if member_status == "verified":
            verified_count += 1
        if member_status == "failed":
            failed = True
        synced_members.append({**member, "status": member_status, "verification_id": (verification or {}).get("id") or member.get("verification_id")})
    if failed:
        next_status = "verification_failed"
    elif synced_members and verified_count == len(synced_members):
        next_status = "fully_verified"
    elif verified_count > 0:
        next_status = "partially_verified"
    else:
        next_status = "waiting_for_verification"
    update: dict = {"identity_status": next_status, "identity_members": synced_members, "updated_at": now_iso()}
    if next_status == "fully_verified" and not reservation.get("entry_code_hash"):
        update.update(await generate_entry_code_for_reservation(reservation))
    if next_status == "verification_failed":
        update["access_code"] = ""
    await db.reservations.update_one({"id": reservation_id}, {"$set": update})
    return await db.reservations.find_one({"id": reservation_id}, {"_id": 0})

def public_reservation(r: dict) -> "ReservationOut":
    identity_requested = bool(r.get("identity_verification_requested"))
    identity_status = public_reservation_identity_status(r.get("identity_status"), identity_requested)
    code_visible = not identity_requested or identity_status == "fully_verified"
    return ReservationOut(
        id=r["id"], customer_name=r["customer_name"],
        customer_email=r["customer_email"], customer_phone=r["customer_phone"],
        capacity=r.get("capacity") or 1,
        room_id=r.get("room_id"),
        room_number=r.get("room_number"),
        room_name=r.get("room_name"),
        price_per_night=r.get("price_per_night"),
        total_nights=r.get("total_nights"),
        total_price=r.get("total_price"),
        check_in_date=r.get("check_in_date"),
        check_out_date=r.get("check_out_date"),
        status=r["status"],
        access_code=r["access_code"] if code_visible else "KIMLIK-DOGRULAMA-BEKLIYOR", user_id=r.get("user_id"),
        email_sent=bool(r.get("email_sent")),
        hotel_id=r.get("hotelId") or r.get("hotel_id"),
        payment_status=r.get("payment_status") or "pending",
        guest_type=r.get("guest_type") or "standard",
        identity_verification_requested=identity_requested,
        identity_status=identity_status,
        identity_members=r.get("identity_members") or [],
        identity_failure_reason=r.get("identity_failure_reason"),
        entry_code_expires_at=r.get("entry_code_expires_at"),
        created_at=r["created_at"], updated_at=r["updated_at"],
    )

def public_hotel(h: dict) -> "HotelOut":
    return HotelOut(
        id=h["id"], hotel_name=h["hotel_name"], city=h["city"],
        address=h.get("address"), active=h.get("active", True),
        manager_id=h.get("manager_id"), services=normalize_services(h.get("services")),
        created_at=h["created_at"],
    )

def _identity_key() -> bytes:
    key = (IDENTITY_ENCRYPTION_KEY or "").strip()
    if not key:
        logger.warning("IDENTITY_ENCRYPTION_KEY yok; dev fallback kullanılıyor. Production için güçlü ayrı anahtar ayarlayın.")
        key = JWT_SECRET + ":identity"
    return hashlib.sha256(key.encode()).digest()

def _identity_keystream(key: bytes, nonce: bytes, length: int) -> bytes:
    chunks: list[bytes] = []
    counter = 0
    while sum(len(c) for c in chunks) < length:
        chunks.append(hashlib.sha256(key + nonce + counter.to_bytes(4, "big")).digest())
        counter += 1
    return b"".join(chunks)[:length]

def identity_encrypt_bytes(data: bytes) -> str:
    key = _identity_key()
    nonce = secrets.token_bytes(16)
    stream = _identity_keystream(key, nonce, len(data))
    cipher = bytes(a ^ b for a, b in zip(data, stream))
    mac = hashlib.sha256(key + nonce + cipher).digest()
    return base64.urlsafe_b64encode(nonce + mac + cipher).decode()

def identity_decrypt_bytes(token: str) -> bytes:
    try:
        raw = base64.urlsafe_b64decode(token.encode())
    except Exception as exc:
        raise ValueError("invalid encrypted payload") from exc
    if len(raw) < 48:
        raise ValueError("invalid encrypted payload")
    nonce, mac, cipher = raw[:16], raw[16:48], raw[48:]
    key = _identity_key()
    expected = hashlib.sha256(key + nonce + cipher).digest()
    if not secrets.compare_digest(mac, expected):
        raise ValueError("encrypted payload integrity check failed")
    stream = _identity_keystream(key, nonce, len(cipher))
    return bytes(a ^ b for a, b in zip(cipher, stream))

def encrypt_sensitive(value: Optional[str]) -> Optional[str]:
    text = (value or "").strip()
    if not text:
        return None
    return identity_encrypt_bytes(text.encode())

def decrypt_sensitive(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return identity_decrypt_bytes(value).decode()
    except ValueError:
        return None

def mask_identity_number(value: Optional[str]) -> Optional[str]:
    text = (value or "").strip()
    if not text:
        return None
    if len(text) <= 4:
        return "*" * len(text)
    return f"{'*' * max(0, len(text) - 4)}{text[-4:]}"

def identity_initial_status(subject_type: IdentitySubjectType) -> VerificationStatus:
    return "not_started"

def identity_submitted_status(subject_type: IdentitySubjectType) -> VerificationStatus:
    return "pending_review"

def normalize_identity_status(status_value: Optional[str]) -> VerificationStatus:
    mapping = {
        "unverified": "not_started",
        "pending": "pending_review",
        "verified": "verified_by_hotel",
        "approved": "verified_by_hotel",
        "in_review": "pending_review",
        "identity_required": "needs_new_documents",
        "application_received": "not_started",
    }
    value = status_value or "not_started"
    return mapping.get(value, value)

def user_subject_type(user: dict) -> IdentitySubjectType:
    return "employee" if role_of(user) == "staff" else "guest"

async def audit_identity(actor: dict, action: str, verification_id: Optional[str], target_user_id: Optional[str], hotel_id: Optional[str], detail: Optional[dict] = None) -> None:
    safe_detail = {k: v for k, v in (detail or {}).items() if k not in {"document_number", "data_uri", "encrypted_data", "encrypted_profile"}}
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": action,
        "verification_id": verification_id,
        "target_user_id": target_user_id,
        "hotel_id": hotel_id,
        "hotelId": hotel_id,
        "actor_id": actor.get("id"),
        "actor_role": role_of(actor),
        "detail": safe_detail,
        "created_at": now_iso(),
    })

async def append_verification_history(verification: dict, actor: dict, to_status: str, note: Optional[str] = None) -> None:
    await db.verification_history.insert_one({
        "id": str(uuid.uuid4()),
        "verification_id": verification["id"],
        "from_status": verification.get("status"),
        "to_status": to_status,
        "note": (note or "").strip() or None,
        "actor_id": actor["id"],
        "actor_role": role_of(actor),
        "created_at": now_iso(),
    })

async def get_identity_target_user(actor: dict, body: IdentityStartIn) -> dict:
    role = role_of(actor)
    target_id = body.user_id or actor["id"]
    if role in ("guest", "staff"):
        if target_id != actor["id"]:
            raise HTTPException(403, "Yalnızca kendi kimlik doğrulamanızı yönetebilirsiniz")
        return actor
    target = await db.users.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    if role == "hotel_manager" and (target.get("hotelId") or target.get("hotel_id")) != user_hotel_id(actor):
        raise HTTPException(403, "Bu kullanıcı otelinize ait değil")
    if role == "hotel_manager" and role_of(target) not in ("guest", "staff"):
        raise HTTPException(403, "Yalnızca misafir veya çalışan doğrulaması başlatabilirsiniz")
    require_roles(actor, "hotel_manager", "system_admin")
    return target

async def load_verification(verification_id: str) -> dict:
    doc = await db.identity_verifications.find_one({"id": verification_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Kimlik doğrulama kaydı bulunamadı")
    return doc

def can_access_verification(actor: dict, verification: dict, write: bool = False) -> bool:
    role = role_of(actor)
    if role == "system_admin":
        return True
    if verification.get("user_id") == actor.get("id") and role in ("guest", "staff") and not write:
        return True
    if verification.get("user_id") == actor.get("id") and role in ("guest", "staff") and write:
        return verification.get("status") not in ("verified", "approved", "verified_by_hotel", "active_employee")
    if role == "hotel_manager":
        return verification.get("hotel_id") == user_hotel_id(actor) or verification.get("hotelId") == user_hotel_id(actor)
    return False

async def documents_for_verification(verification_id: str) -> List[IdentityDocumentOut]:
    docs = await db.identity_documents.find({"verification_id": verification_id}, {"_id": 0, "encrypted_data": 0}).sort("created_at", -1).to_list(50)
    return [IdentityDocumentOut(**d) for d in docs]

async def latest_analysis(collection: str, verification_id: str) -> Optional[dict]:
    return await db[collection].find_one({"verification_id": verification_id}, {"_id": 0}, sort=[("created_at", -1)])

def identity_fingerprint(value: Optional[str]) -> Optional[str]:
    text = re.sub(r"\s+", "", (value or "").upper())
    if not text:
        return None
    return hashlib.sha256(_identity_key() + text.encode()).hexdigest()

def average_hash(data: bytes) -> Optional[str]:
    if Image is None:
        return None
    try:
        image = Image.open(io.BytesIO(data)).convert("L").resize((8, 8))
        pixels = list(image.getdata())
        avg = sum(pixels) / len(pixels)
        bits = "".join("1" if p > avg else "0" for p in pixels)
        return f"{int(bits, 2):016x}"
    except Exception:
        return None

def hamming_hex(a: Optional[str], b: Optional[str]) -> int:
    if not a or not b:
        return 999
    return bin(int(a, 16) ^ int(b, 16)).count("1")

def analyze_image_quality(data: bytes, mime_type: str) -> Dict[str, Any]:
    result = {
        "status": "unavailable",
        "width": None,
        "height": None,
        "blur_score": None,
        "is_blurry": False,
        "is_low_resolution": False,
        "crop_risk": False,
        "format_supported": mime_type in {"image/jpeg", "image/jpg", "image/png", "application/pdf"},
        "notes": [],
    }
    if mime_type == "application/pdf":
        result.update({"status": "completed", "notes": ["PDF metadata only; image quality analysis unavailable"]})
        return result
    if Image is None:
        result["notes"].append("Pillow unavailable")
        return result
    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
        width, height = image.size
        result["width"], result["height"] = width, height
        result["is_low_resolution"] = width < 600 or height < 400
        if result["is_low_resolution"]:
            result["notes"].append("low_resolution")
        if cv2 is not None and np is not None:
            gray = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)
            blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            result["blur_score"] = blur_score
            result["is_blurry"] = blur_score < 80
            if result["is_blurry"]:
                result["notes"].append("blurry")
            edges = cv2.Canny(gray, 80, 160)
            border = max(3, min(width, height) // 80)
            border_edges = int(edges[:border, :].sum() + edges[-border:, :].sum() + edges[:, :border].sum() + edges[:, -border:].sum())
            result["crop_risk"] = border_edges > 50000
            if result["crop_risk"]:
                result["notes"].append("crop_risk")
        result["status"] = "completed"
    except Exception as exc:
        result["status"] = "failed"
        result["notes"].append(str(exc))
    return result

def detect_face_present(data: bytes, mime_type: str) -> bool:
    if cv2 is None or np is None or not mime_type.startswith("image/"):
        return False
    try:
        arr = np.frombuffer(data, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        if image is None:
            return False
        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        faces = cascade.detectMultiScale(image, 1.1, 4)
        return len(faces) > 0
    except Exception:
        return False

def normalize_text_for_match(value: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())

def compare_ocr_to_profile(extracted: dict, profile: dict, masked_document_number: Optional[str]) -> tuple[list[str], float]:
    checks = {
        "first_name": profile.get("first_name"),
        "last_name": profile.get("last_name"),
        "birth_date": profile.get("birth_date"),
        "document_number": masked_document_number,
    }
    mismatches: list[str] = []
    compared = 0
    matched = 0
    for key, expected in checks.items():
        got = extracted.get(key)
        if not got or not expected:
            continue
        compared += 1
        if key == "document_number":
            ok = str(got).endswith(str(expected)[-4:])
        else:
            ok = normalize_text_for_match(got) == normalize_text_for_match(expected)
        if ok:
            matched += 1
        else:
            mismatches.append(key)
    if compared == 0:
        return mismatches, 0
    return mismatches, round((matched / compared) * 100, 2)

async def duplicate_signals(verification: dict, document_number_fingerprint: Optional[str] = None, checksum: Optional[str] = None, perceptual_hash: Optional[str] = None) -> list[str]:
    signals: list[str] = []
    user_id = verification.get("user_id")
    if document_number_fingerprint:
        existing = await db.identity_verifications.find_one({"document_fingerprint": document_number_fingerprint, "user_id": {"$ne": user_id}}, {"_id": 0})
        if existing:
            signals.append("duplicate_identity_number")
    if checksum:
        existing_doc = await db.identity_documents.find_one({"checksum": checksum, "verification_id": {"$ne": verification.get("id")}}, {"_id": 0})
        if existing_doc:
            signals.append("duplicate_document_checksum")
    if perceptual_hash:
        docs = await db.identity_documents.find({"perceptual_hash": {"$ne": None}, "verification_id": {"$ne": verification.get("id")}}, {"_id": 0}).to_list(200)
        if any(hamming_hex(perceptual_hash, d.get("perceptual_hash")) <= 4 for d in docs):
            signals.append("similar_document_image")
    return signals

class VerificationProvider:
    name = "base"

    async def analyze_document(self, data: bytes, mime_type: str) -> dict:
        raise NotImplementedError

    async def run_ocr(self, data: bytes, mime_type: str, profile: dict, masked_document_number: Optional[str]) -> dict:
        raise NotImplementedError

    async def run_face_comparison(self, selfie: dict, document: Optional[dict], completed_actions: list[str]) -> dict:
        raise NotImplementedError

class InternalHeuristicProvider(VerificationProvider):
    name = "internal"

    async def analyze_document(self, data: bytes, mime_type: str) -> dict:
        return analyze_image_quality(data, mime_type)

    async def run_ocr(self, data: bytes, mime_type: str, profile: dict, masked_document_number: Optional[str]) -> dict:
        if pytesseract is None or Image is None or not mime_type.startswith("image/"):
            return {"status": "unavailable", "extracted": {}, "mismatches": ["ocr_unavailable"], "confidence": 0}
        try:
            image = Image.open(io.BytesIO(data))
            text = pytesseract.image_to_string(image, lang="tur+eng")
            extracted = {
                "raw_text": text[:2000],
                "first_name": profile.get("first_name") if profile.get("first_name", "").lower() in text.lower() else None,
                "last_name": profile.get("last_name") if profile.get("last_name", "").lower() in text.lower() else None,
                "birth_date": profile.get("birth_date") if profile.get("birth_date") in text else None,
                "document_number": masked_document_number if masked_document_number and masked_document_number[-4:] in text else None,
            }
            mismatches, confidence = compare_ocr_to_profile(extracted, profile, masked_document_number)
            return {"status": "completed", "extracted": extracted, "mismatches": mismatches, "confidence": confidence}
        except Exception as exc:
            return {"status": "failed", "extracted": {}, "mismatches": [str(exc)], "confidence": 0}

    async def run_face_comparison(self, selfie: dict, document: Optional[dict], completed_actions: list[str]) -> dict:
        selfie_data = identity_decrypt_bytes(selfie["encrypted_data"])
        selfie_face = detect_face_present(selfie_data, selfie.get("mime_type") or "image/jpeg")
        doc_face = False
        if document:
            doc_data = identity_decrypt_bytes(document["encrypted_data"])
            doc_face = detect_face_present(doc_data, document.get("mime_type") or "image/jpeg")
        action_score = min(100, int((len(set(completed_actions)) / 3) * 100))
        similarity = 70 if selfie_face and doc_face else 35 if selfie_face else 0
        return {
            "status": "completed",
            "face_present": selfie_face,
            "document_face_present": doc_face,
            "similarity_score": similarity,
            "liveness_score": action_score,
            "completed_actions": completed_actions,
        }

class ProviderRegistry:
    _providers: Dict[str, VerificationProvider] = {"internal": InternalHeuristicProvider()}

    @classmethod
    def get(cls, name: str = "internal") -> VerificationProvider:
        return cls._providers.get(name) or cls._providers["internal"]

identity_provider = ProviderRegistry.get("internal")

async def public_identity_verification(v: dict) -> IdentityVerificationOut:
    user = await db.users.find_one({"id": v["user_id"]}, {"_id": 0})
    profile = v.get("profile") or {}
    latest_ocr = await latest_analysis("identity_ocr_results", v["id"])
    latest_face = await latest_analysis("identity_face_results", v["id"])
    latest_fraud = await latest_analysis("identity_fraud_analysis", v["id"])
    return IdentityVerificationOut(
        id=v["id"],
        user_id=v["user_id"],
        user_name=(user or {}).get("name"),
        user_email=(user or {}).get("email"),
        hotel_id=v.get("hotel_id") or v.get("hotelId") or DEFAULT_HOTEL_ID,
        hotelId=v.get("hotelId") or v.get("hotel_id") or DEFAULT_HOTEL_ID,
        role=v.get("role") or "guest",
        subject_type=v.get("subject_type") or "guest",
        status=normalize_identity_status(v.get("status")),
        first_name=profile.get("first_name"),
        last_name=profile.get("last_name"),
        birth_date=profile.get("birth_date"),
        nationality=profile.get("nationality"),
        document_type=profile.get("document_type"),
        masked_document_number=v.get("masked_document_number"),
        document_expiry_date=profile.get("document_expiry_date"),
        employee_role=profile.get("employee_role"),
        employment_start_date=profile.get("employment_start_date"),
        manager_approved=profile.get("manager_approved"),
        internal_notes=profile.get("internal_notes"),
        documents=await documents_for_verification(v["id"]),
        latest_ocr=OcrResultOut(**latest_ocr) if latest_ocr else None,
        latest_face=FaceResultOut(**latest_face) if latest_face else None,
        latest_fraud=FraudAnalysisOut(**latest_fraud) if latest_fraud else None,
        confidence_score=latest_fraud.get("confidence_score") if latest_fraud else None,
        fraud_risk=latest_fraud.get("fraud_risk") if latest_fraud else None,
        created_by=v.get("created_by") or v["user_id"],
        updated_by=v.get("updated_by"),
        created_at=v.get("created_at") or now_iso(),
        updated_at=v.get("updated_at") or v.get("created_at") or now_iso(),
    )

def parse_data_uri(data_uri: str) -> tuple[str, bytes]:
    raw = (data_uri or "").strip()
    if not raw:
        raise HTTPException(400, "Belge içeriği gerekli")
    if raw.startswith("data:"):
        header, _, payload = raw.partition(",")
        mime = header.split(";")[0].replace("data:", "") or "application/octet-stream"
    else:
        mime, payload = "application/octet-stream", raw
    try:
        data = base64.b64decode(payload, validate=True)
    except Exception:
        raise HTTPException(400, "Belge base64 formatı geçersiz")
    if not data:
        raise HTTPException(400, "Belge boş olamaz")
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(400, "Belge çok büyük (maks 8MB)")
    return mime, data

async def ensure_active_hotel_or_none(hotel_id: Optional[str]) -> Optional[dict]:
    hid = (hotel_id or "").strip()
    if not hid:
        return None
    h = await db.hotels.find_one({"id": hid, "active": True}, {"_id": 0})
    if not h:
        raise HTTPException(403, "Seçilen otel aktif değil veya bulunamadı")
    return h

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

def _clean_string(value: Any) -> str:
    return str(value or "").strip()

def _clean_dict(raw: Optional[dict], model: type[BaseModel]) -> dict:
    allowed = set(model.model_fields.keys())
    raw = raw if isinstance(raw, dict) else {}
    return {key: _clean_string(raw.get(key)) for key in allowed}

def _with_entry_ids(entries: list[dict]) -> list[dict]:
    clean: list[dict] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        doc = {k: (bool(v) if k == "is_paid" else _clean_string(v)) for k, v in entry.items() if k != "id"}
        if not any(doc.values()):
            continue
        clean.append({"id": _clean_string(entry.get("id")) or str(uuid.uuid4()), **doc})
    return clean

def _distance_sort_key(place: dict) -> float:
    raw = _clean_string(place.get("distance")).lower().replace(",", ".")
    match = re.search(r"(\d+(?:\.\d+)?)", raw)
    if not match:
        return 999999.0
    value = float(match.group(1))
    if "km" in raw:
        return value * 1000
    return value

def default_ai_knowledge(hotel_id: str) -> dict:
    return {
        "hotel_id": hotel_id,
        "hotelId": hotel_id,
        "hotel_info": HotelInfoKnowledge().model_dump(),
        "services": HotelServicesKnowledge().model_dump(),
        "restaurant": RestaurantKnowledge().model_dump(),
        "rooms": RoomKnowledge().model_dump(),
        "policies": PolicyKnowledge().model_dump(),
        "general_info": GeneralHotelKnowledge().model_dump(),
        "events": [],
        "paid_services": [],
        "nearby_places": [],
        "faq": [],
        "custom_entries": [],
        "updated_at": None,
        "updated_by": None,
    }

def normalize_ai_knowledge_payload(raw: dict, hotel_id: str, updated_by: Optional[str] = None) -> dict:
    doc = default_ai_knowledge(hotel_id)
    doc["hotel_info"] = _clean_dict(raw.get("hotel_info"), HotelInfoKnowledge)
    doc["services"] = _clean_dict(raw.get("services"), HotelServicesKnowledge)
    doc["restaurant"] = _clean_dict(raw.get("restaurant"), RestaurantKnowledge)
    doc["rooms"] = _clean_dict(raw.get("rooms"), RoomKnowledge)
    doc["policies"] = _clean_dict(raw.get("policies"), PolicyKnowledge)
    doc["general_info"] = _clean_dict(raw.get("general_info"), GeneralHotelKnowledge)
    doc["events"] = _with_entry_ids(raw.get("events") if isinstance(raw.get("events"), list) else [])
    doc["paid_services"] = _with_entry_ids(raw.get("paid_services") if isinstance(raw.get("paid_services"), list) else [])
    nearby_places = _with_entry_ids(raw.get("nearby_places") if isinstance(raw.get("nearby_places"), list) else [])
    doc["nearby_places"] = sorted(nearby_places, key=_distance_sort_key)
    doc["faq"] = _with_entry_ids(raw.get("faq") if isinstance(raw.get("faq"), list) else [])
    doc["custom_entries"] = _with_entry_ids(raw.get("custom_entries") if isinstance(raw.get("custom_entries"), list) else [])
    doc["updated_at"] = raw.get("updated_at") or now_iso()
    doc["updated_by"] = updated_by or raw.get("updated_by")
    return doc

async def get_ai_knowledge_doc(hotel_id: str) -> dict:
    doc = await db.hotel_ai_knowledge.find_one({"hotel_id": hotel_id}, {"_id": 0})
    if not doc:
        doc = await db.hotel_ai_knowledge.find_one({"hotelId": hotel_id}, {"_id": 0})
    return normalize_ai_knowledge_payload(doc or {}, hotel_id)

def public_ai_knowledge(doc: dict) -> HotelAiKnowledgeOut:
    hotel_id = doc.get("hotelId") or doc.get("hotel_id") or DEFAULT_HOTEL_ID
    normalized = normalize_ai_knowledge_payload(doc, hotel_id)
    return HotelAiKnowledgeOut(**normalized)

def _append_section_lines(lines: list[str], title: str, data: dict, labels: Optional[dict[str, str]] = None) -> None:
    values = []
    for key, value in (data or {}).items():
        text = _clean_string(value)
        if text:
            values.append(f"- {(labels or {}).get(key, key.replace('_', ' ').title())}: {text}")
    if values:
        lines.append(f"\n{title}:")
        lines.extend(values)

def ai_knowledge_to_text(doc: dict) -> str:
    lines: list[str] = []
    _append_section_lines(lines, "ALL HOTEL INFORMATION", doc.get("general_info") or {"all_information": ""}, {"all_information": "All Information"})
    events = doc.get("events") or []
    if events:
        lines.append("\nHOTEL EVENTS AND HOURS:")
        for event in events:
            bits = [event.get("name"), event.get("time"), event.get("description")]
            text = " - ".join([_clean_string(b) for b in bits if _clean_string(b)])
            if text:
                lines.append(f"- {text}")
    paid_services = doc.get("paid_services") or []
    if paid_services:
        lines.append("\nHOTEL SERVICES, FEES AND PRICES:")
        for service in paid_services:
            paid_label = "Paid" if service.get("is_paid") else "Free"
            bits = [service.get("name"), paid_label, service.get("price"), service.get("description")]
            text = " - ".join([_clean_string(b) for b in bits if _clean_string(b)])
            if text:
                lines.append(f"- {text}")
    nearby = doc.get("nearby_places") or []
    if nearby:
        lines.append("\nNEARBY PLACES SORTED FROM NEAREST TO FARTHEST:")
        for place in nearby:
            bits = [place.get("name"), place.get("category"), place.get("distance"), place.get("description")]
            text = " - ".join([_clean_string(b) for b in bits if _clean_string(b)])
            if text:
                lines.append(f"- {text}")
    # Keep legacy fields readable for existing saved documents, but new UI writes the sections above.
    _append_section_lines(lines, "LEGACY HOTEL INFORMATION", doc.get("hotel_info") or {})
    _append_section_lines(lines, "LEGACY HOTEL SERVICES", doc.get("services") or {})
    _append_section_lines(lines, "LEGACY RESTAURANT INFORMATION", doc.get("restaurant") or {})
    _append_section_lines(lines, "LEGACY ROOM INFORMATION", doc.get("rooms") or {})
    _append_section_lines(lines, "LEGACY HOTEL POLICIES", doc.get("policies") or {})
    faq = doc.get("faq") or []
    if faq:
        lines.append("\nFAQ:")
        for item in faq:
            q = _clean_string(item.get("question"))
            a = _clean_string(item.get("answer"))
            if q and a:
                lines.append(f"- Q: {q}\n  A: {a}")
    custom = doc.get("custom_entries") or []
    if custom:
        lines.append("\nCUSTOM INFORMATION:")
        for item in custom:
            title = _clean_string(item.get("title"))
            content = _clean_string(item.get("content"))
            if title or content:
                lines.append(f"- {title}: {content}" if title else f"- {content}")
    return "\n".join(lines).strip()

def ai_knowledge_has_content(doc: dict) -> bool:
    return bool(ai_knowledge_to_text(doc))

def missing_knowledge_reply() -> str:
    return "Bu bilgiyi otelin AI bilgi tabanında bulamadım. Lütfen yardım için resepsiyonla iletişime geçin."

def is_hotel_info_question(text: str) -> bool:
    lowered = text.lower()
    keywords = [
        "etkinlik", "aktivite", "event", "saat", "program",
        "ücret", "ucret", "fiyat", "kaç para", "kac para", "paid", "free", "ücretsiz", "ucretsiz",
        "kahvalt", "breakfast", "öğle", "ogle", "lunch", "akşam yeme", "dinner", "menü", "menu",
        "havuz", "pool", "spa", "sauna", "gym", "fitness", "otopark", "parking", "wifi", "wi-fi",
        "evcil", "pet", "sigara", "smoking", "iptal", "cancellation", "çocuk", "child",
        "check-in", "check in", "giriş", "giris", "check-out", "check out", "çıkış", "cikis",
        "adres", "address", "telefon", "phone", "email", "website", "yakın", "nearby",
        "eczane", "pharmacy", "plaj", "beach", "airport", "havaliman", "hospital", "hastane",
        "oda tipi", "room type", "balkon", "sea view", "deniz", "mini bar", "kasa", "tv",
    ]
    return any(keyword in lowered for keyword in keywords)

def knowledge_answer(message: str, knowledge_doc: Optional[dict]) -> Optional[str]:
    if not knowledge_doc or not ai_knowledge_has_content(knowledge_doc):
        return missing_knowledge_reply() if is_hotel_info_question(message) else None
    lowered = message.lower()
    if any(k in lowered for k in ["etkinlik", "aktivite", "event", "program"]):
        rendered = []
        for event in knowledge_doc.get("events") or []:
            text = " - ".join([_clean_string(event.get(k)) for k in ("name", "time", "description") if _clean_string(event.get(k))])
            if text:
                rendered.append(text)
        if rendered:
            return "Otel içi etkinlikler ve saatleri: " + "; ".join(rendered)
    if any(k in lowered for k in ["ücret", "ucret", "fiyat", "kaç para", "kac para", "ücretsiz", "ucretsiz", "paid", "free", "hizmet"]):
        rendered = []
        for service in knowledge_doc.get("paid_services") or []:
            name = _clean_string(service.get("name"))
            if not name:
                continue
            paid = "ücretli" if service.get("is_paid") else "ücretsiz"
            price = _clean_string(service.get("price"))
            desc = _clean_string(service.get("description"))
            rendered.append(" - ".join([bit for bit in [name, paid, price, desc] if bit]))
        if rendered:
            return "Otel içi hizmet ücretleri: " + "; ".join(rendered)
    if any(k in lowered for k in ["yakın", "yakin", "nearby", "en yakın", "en yakin", "nerede", "çevre", "cevre"]):
        rendered = []
        for place in knowledge_doc.get("nearby_places") or []:
            text = " - ".join([_clean_string(place.get(k)) for k in ("name", "category", "distance", "description") if _clean_string(place.get(k))])
            if text:
                rendered.append(text)
        if rendered:
            return "Otele yakın yerler en yakından uzağa: " + "; ".join(rendered)
    general = _clean_string((knowledge_doc.get("general_info") or {}).get("all_information"))
    if general and any(k in lowered for k in ["otel", "bilgi", "hakkında", "hakkinda", "genel", "tüm", "tum", "hepsi"]):
        return general
    faq_hits = []
    for item in knowledge_doc.get("faq") or []:
        q = _clean_string(item.get("question"))
        a = _clean_string(item.get("answer"))
        if q and a and (q.lower() in lowered or any(word for word in q.lower().split() if len(word) > 4 and word in lowered)):
            faq_hits.append(a)
    if faq_hits:
        return faq_hits[0]
    field_groups = [
        ("breakfast", ["kahvalt", "breakfast"], knowledge_doc.get("restaurant", {}).get("breakfast_hours")),
        ("lunch", ["öğle", "ogle", "lunch"], knowledge_doc.get("restaurant", {}).get("lunch_hours")),
        ("dinner", ["akşam", "aksam", "dinner"], knowledge_doc.get("restaurant", {}).get("dinner_hours")),
        ("menu", ["menü", "menu"], knowledge_doc.get("restaurant", {}).get("restaurant_menu")),
        ("room service", ["oda servisi", "room service"], knowledge_doc.get("restaurant", {}).get("room_service_hours") or knowledge_doc.get("services", {}).get("room_service")),
        ("wifi", ["wifi", "wi-fi", "internet"], knowledge_doc.get("services", {}).get("wifi")),
        ("parking", ["otopark", "parking", "park"], knowledge_doc.get("services", {}).get("parking")),
        ("pool", ["havuz", "pool"], knowledge_doc.get("services", {}).get("swimming_pool")),
        ("spa", ["spa"], knowledge_doc.get("services", {}).get("spa")),
        ("sauna", ["sauna"], knowledge_doc.get("services", {}).get("sauna")),
        ("gym", ["gym", "fitness", "spor"], knowledge_doc.get("services", {}).get("gym")),
        ("laundry", ["laundry", "çamaşır", "camasir", "kuru temizleme"], knowledge_doc.get("services", {}).get("laundry")),
        ("airport transfer", ["airport", "havaliman", "transfer"], knowledge_doc.get("services", {}).get("airport_transfer")),
        ("pet", ["pet", "evcil", "hayvan"], knowledge_doc.get("services", {}).get("pet_policy") or knowledge_doc.get("policies", {}).get("pet_rules")),
        ("smoking", ["sigara", "smoking"], knowledge_doc.get("policies", {}).get("smoking_policy")),
        ("cancellation", ["iptal", "cancellation"], knowledge_doc.get("policies", {}).get("cancellation_policy")),
        ("children", ["çocuk", "cocuk", "child"], knowledge_doc.get("policies", {}).get("child_policy")),
        ("early checkin", ["erken giriş", "erken giris", "early check"], knowledge_doc.get("policies", {}).get("early_check_in")),
        ("late checkout", ["geç çıkış", "gec cikis", "late check"], knowledge_doc.get("policies", {}).get("late_check_out")),
        ("checkin", ["check-in", "check in", "giriş", "giris"], knowledge_doc.get("hotel_info", {}).get("check_in_time")),
        ("checkout", ["check-out", "check out", "çıkış", "cikis"], knowledge_doc.get("hotel_info", {}).get("check_out_time")),
        ("address", ["adres", "address", "nerede"], knowledge_doc.get("hotel_info", {}).get("address")),
        ("phone", ["telefon", "phone", "ara"], knowledge_doc.get("hotel_info", {}).get("phone")),
        ("email", ["email", "e-posta", "mail"], knowledge_doc.get("hotel_info", {}).get("email")),
        ("website", ["website", "web sitesi"], knowledge_doc.get("hotel_info", {}).get("website")),
        ("rooms", ["oda tipi", "room type", "room types"], knowledge_doc.get("rooms", {}).get("room_types")),
        ("features", ["oda özellik", "room feature", "balkon", "deniz", "sea view", "mini bar", "kasa", "tv", "kahve"], knowledge_doc.get("rooms", {}).get("room_features")),
    ]
    for _, keywords, value in field_groups:
        if any(keyword in lowered for keyword in keywords) and _clean_string(value):
            return _clean_string(value)
    nearby_matches = knowledge_doc.get("nearby_places") or []
    if any(k in lowered for k in ["yakın", "nearby", "eczane", "pharmacy", "plaj", "beach", "airport", "havaliman", "hospital", "hastane", "avm", "shopping"]):
        rendered = []
        for place in nearby_matches[:6]:
            text = " - ".join([_clean_string(place.get(k)) for k in ("name", "category", "distance", "description") if _clean_string(place.get(k))])
            if text:
                rendered.append(text)
        if rendered:
            return "Yakındaki yerler: " + "; ".join(rendered)
    for item in knowledge_doc.get("custom_entries") or []:
        title = _clean_string(item.get("title"))
        content = _clean_string(item.get("content"))
        if content and title and any(word in lowered for word in title.lower().split() if len(word) > 3):
            return content
    return missing_knowledge_reply() if is_hotel_info_question(message) else None

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
    hotel_id = user_hotel_id(u)
    hotel = await db.hotels.find_one({"id": hotel_id}, {"_id": 0})
    ai_knowledge = await get_ai_knowledge_doc(hotel_id)
    return {
        "hotel": hotel or {},
        "services": normalize_services(hotel.get("services") if hotel else None),
        "service_meta": normalize_service_meta(hotel.get("service_meta") if hotel else None),
        "knowledge_base": (hotel or {}).get("knowledge_base") or "",
        "ai_knowledge": ai_knowledge,
        "ai_knowledge_text": ai_knowledge_to_text(ai_knowledge),
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

def nights_between(check_in: str, check_out: str) -> int:
    ci = parse_iso_date(check_in)
    co = parse_iso_date(check_out)
    return max(0, (co - ci).days)

def room_type_value(room: dict) -> RoomType:
    raw = room.get("room_type") or room.get("type") or "Standard"
    return raw if raw in ("Standard", "Deluxe", "Suite", "Family", "VIP") else "Standard"

def room_operational_status(room: dict) -> RoomOperationalStatus:
    raw = room.get("operational_status")
    if raw in ("cleaning", "maintenance"):
        return raw
    legacy = room.get("status")
    if legacy in ("cleaning", "maintenance", "out_of_service"):
        return "maintenance" if legacy == "out_of_service" else legacy
    return "normal"

def room_base_filter(hotel_id: str, extra: Optional[dict] = None) -> dict:
    q = dict(extra or {})
    q["$or"] = [{"hotel_id": hotel_id}, {"hotelId": hotel_id}]
    return q

def reservation_overlap_filter(check_in: str, check_out: str) -> dict:
    return {
        "status": {"$in": ["pending", "checked_in"]},
        "check_in_date": {"$lt": check_out},
        "check_out_date": {"$gt": check_in},
    }

def reservation_room_filter(room: dict) -> dict:
    clauses = []
    if room.get("id"):
        clauses.append({"room_id": room["id"]})
    if room.get("room_number"):
        clauses.append({"room_number": room["room_number"]})
    return {"$or": clauses} if clauses else {"room_id": "__none__"}

async def active_room_reservation(room: dict, check_in: str, check_out: str, exclude_reservation_id: Optional[str] = None) -> Optional[dict]:
    hotel_id = room.get("hotelId") or room.get("hotel_id") or DEFAULT_HOTEL_ID
    q = {
        "$and": [
            room_base_filter(hotel_id),
            reservation_room_filter(room),
            reservation_overlap_filter(check_in, check_out),
        ]
    }
    if exclude_reservation_id:
        q["$and"].append({"id": {"$ne": exclude_reservation_id}})
    return await db.reservations.find_one(q, {"_id": 0})

async def active_room_cleaning_request(room: dict) -> Optional[dict]:
    hotel_id = room.get("hotelId") or room.get("hotel_id") or DEFAULT_HOTEL_ID
    room_number = (room.get("room_number") or "").strip()
    if not room_number:
        return None
    return await db.requests.find_one(
        {
            "$and": [
                room_base_filter(hotel_id),
                {
                    "departman": "housekeeping",
                    "room_no": room_number,
                    "status": {"$in": ["ALINDI", "PERSONEL_GIDIYOR"]},
                },
            ]
        },
        {"_id": 0},
    )

async def get_room_effective_status(room: dict) -> tuple[RoomStatus, Optional[dict]]:
    if not room.get("is_active", True):
        return "maintenance", None
    op = room_operational_status(room)
    if op == "maintenance":
        return "maintenance", None
    if op == "cleaning":
        return "cleaning", None
    if await active_room_cleaning_request(room):
        return "cleaning", None
    today = datetime.utcnow().strftime("%Y-%m-%d")
    active = await active_room_reservation(room, today, (parse_iso_date(today) + timedelta(days=1)).strftime("%Y-%m-%d"))
    if active:
        return ("occupied" if active.get("status") == "checked_in" else "reserved"), active
    return "available", None

def normalize_room_payload(body: RoomIn | RoomUpdateIn, existing: Optional[dict] = None) -> dict:
    raw = body.model_dump(exclude_unset=existing is not None)
    update: Dict[str, Any] = {}
    if "room_number" in raw and raw.get("room_number") is not None:
        rn = str(raw["room_number"]).strip()
        if not rn:
            raise HTTPException(400, "Oda numarası gerekli")
        update["room_number"] = rn
    if "room_name" in raw:
        update["room_name"] = (raw.get("room_name") or "").strip() or None
    room_type = raw.get("room_type") or raw.get("type")
    if room_type is not None:
        if room_type not in ("Standard", "Deluxe", "Suite", "Family", "VIP"):
            raise HTTPException(400, "Geçersiz oda tipi")
        update["room_type"] = room_type
        update["type"] = room_type
    if "floor" in raw:
        update["floor"] = (str(raw.get("floor")).strip() if raw.get("floor") is not None else None)
    if "capacity" in raw and raw.get("capacity") is not None:
        cap = int(raw["capacity"])
        if cap < 1 or cap > 4:
            raise HTTPException(400, "Kapasite 1-4 kişi arasında olmalı")
        update["capacity"] = cap
    if "price_per_night" in raw and raw.get("price_per_night") is not None:
        price = float(raw["price_per_night"])
        if price < 0:
            raise HTTPException(400, "Oda fiyatı negatif olamaz")
        update["price_per_night"] = price
    if "operational_status" in raw and raw.get("operational_status") is not None:
        update["operational_status"] = raw["operational_status"]
    if "is_active" in raw and raw.get("is_active") is not None:
        update["is_active"] = bool(raw["is_active"])
    if "description" in raw:
        update["description"] = (raw.get("description") or "").strip() or None
    return update

async def public_room(r: dict) -> "RoomOut":
    status_value, active = await get_room_effective_status(r)
    room_type = room_type_value(r)
    return RoomOut(
        id=r["id"],
        room_number=r["room_number"],
        room_name=r.get("room_name"),
        room_type=room_type,
        type=room_type,
        floor=r.get("floor"),
        capacity=int(r.get("capacity") or 2),
        price_per_night=float(r.get("price_per_night") or 0),
        status=status_value,
        operational_status=room_operational_status(r),
        is_active=r.get("is_active", True),
        description=r.get("description"),
        current_guest_name=active.get("customer_name") if active else None,
        active_reservation_id=active.get("id") if active else None,
        created_at=r.get("created_at") or now_iso(),
        updated_at=r.get("updated_at") or r.get("created_at") or now_iso(),
    )

async def find_available_rooms(check_in: str, check_out: str, capacity: int, hotel_id: str, exclude_reservation_id: Optional[str] = None) -> list[dict]:
    docs = await db.rooms.find(
        room_base_filter(hotel_id, {"is_active": {"$ne": False}, "capacity": {"$gte": capacity}}),
        {"_id": 0},
    ).sort([("floor", 1), ("room_number", 1)]).to_list(1000)
    available: list[dict] = []
    for room in docs:
        if room_operational_status(room) != "normal":
            continue
        if await active_room_cleaning_request(room):
            continue
        if await active_room_reservation(room, check_in, check_out, exclude_reservation_id):
            continue
        available.append(room)
    return available

async def resolve_room_for_reservation(
    hotel_id: str,
    check_in: str,
    check_out: str,
    capacity: int,
    room_id: Optional[str] = None,
    room_number: Optional[str] = None,
    exclude_reservation_id: Optional[str] = None,
) -> Optional[dict]:
    if not room_id and not room_number:
        return None
    extra = {"id": room_id} if room_id else {"room_number": (room_number or "").strip()}
    room = await db.rooms.find_one(room_base_filter(hotel_id, extra), {"_id": 0})
    if not room:
        raise HTTPException(404, "Oda bulunamadı")
    if not room.get("is_active", True) or int(room.get("capacity") or 0) < capacity or room_operational_status(room) != "normal":
        raise HTTPException(409, "Seçilen oda uygun değil")
    if await active_room_cleaning_request(room):
        raise HTTPException(409, "Seçilen oda temizlikte")
    conflict = await active_room_reservation(room, check_in, check_out, exclude_reservation_id)
    if conflict:
        raise HTTPException(409, "Seçilen oda bu tarihlerde uygun değil")
    return room

def room_reservation_snapshot(room: Optional[dict], check_in: str, check_out: str) -> dict:
    if not room:
        return {"room_id": None, "room_number": None, "room_name": None, "price_per_night": None, "total_nights": None, "total_price": None}
    nights = nights_between(check_in, check_out)
    price = float(room.get("price_per_night") or 0)
    return {
        "room_id": room.get("id"),
        "room_number": room.get("room_number"),
        "room_name": room.get("room_name"),
        "price_per_night": price,
        "total_nights": nights,
        "total_price": price * nights,
    }


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
    identity_requested = bool(reservation.get("identity_verification_requested"))
    identity_verified = public_reservation_identity_status(reservation.get("identity_status"), identity_requested) == "fully_verified"
    code = reservation["access_code"] if (not identity_requested or identity_verified) else "Kimlik doğrulaması sonrası paylaşılacak"
    name = reservation["customer_name"]
    ci = _format_tr_date(reservation.get("check_in_date"))
    co = _format_tr_date(reservation.get("check_out_date"))
    room = reservation.get("room_number") or "Otele girişte atanacak"
    subject = f"Rezervasyon Onayı{' · Kimlik doğrulaması bekleniyor' if identity_requested and not identity_verified else f' · Kod: {code}'}"
    html = f"""<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#0F0F11;color:#F5F5F5;margin:0;padding:24px;">
<div style="max-width:520px;margin:0 auto;background:#1A1A1D;border:1px solid #26262A;border-radius:16px;padding:32px;">
  <h1 style="color:#D4AF37;font-family:Georgia,serif;margin:0 0 8px 0;">Hoş Geldiniz, {name}</h1>
  <p style="color:#D1D1D1;line-height:1.55;margin:0 0 24px 0;">Rezervasyonunuz başarıyla oluşturuldu. {('Kimlik doğrulaması onaylandıktan sonra giriş kodunuz paylaşılacaktır.' if identity_requested and not identity_verified else 'Aşağıdaki kodu otele giriş yaparken kullanacaksınız.')}</p>
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
        kb_reply = knowledge_answer(full, service_context.get("ai_knowledge"))
        if kb_reply:
            return {"reply": kb_reply, "ready": False, "request": None}
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
        kb_reply = knowledge_answer(message, service_context.get("ai_knowledge"))
        if kb_reply:
            return {"reply": kb_reply, "ready": False, "request": None}
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
                "\nAI_KNOWLEDGE_BASE:\n"
                + str((service_context or {}).get("ai_knowledge_text") or "Bu otel için AI bilgi tabanı boş.") +
                "\nKurallar: Otel bilgisi sorularında yalnızca AI_KNOWLEDGE_BASE ve aktif servis listesini kullan. Bilgi yoksa uydurma; misafiri resepsiyona yönlendir. Başka otel bilgisi verme. Pasif servisten talep oluşturma. Talep oluşturmak için mutlaka önce onay iste."
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
        if role_of(u) == "staff" and u.get("identity_status") and u.get("identity_status") not in {"verified_by_hotel", "approved", "active_employee"}:
            raise HTTPException(403, "Çalışan kimlik doğrulaması onaylanmadan personel paneline giriş yapılamaz")
        raise HTTPException(403, "Hesap devre dışı")
    selected_hotel = await ensure_active_hotel_or_none(body.selected_hotel_id)
    role = role_of(u)
    if role == "staff" and u.get("identity_status") and u.get("identity_status") not in {"verified_by_hotel", "approved", "active_employee"}:
        raise HTTPException(403, "Çalışan kimlik doğrulaması onaylanmadan personel paneline giriş yapılamaz")
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
# Identity Verification
# --------------------------------------------------------------------------
@api.post("/identity/start", response_model=IdentityVerificationOut)
async def identity_start(body: IdentityStartIn = IdentityStartIn(), u: dict = Depends(get_current_user)):
    target = await get_identity_target_user(u, body)
    target_role = role_of(target)
    if target_role not in ("guest", "staff"):
        raise HTTPException(400, "Kimlik doğrulama yalnızca misafir veya çalışan için başlatılabilir")
    subject_type = body.subject_type or user_subject_type(target)
    hotel_id = target.get("hotelId") or target.get("hotel_id") or user_hotel_id(u)
    existing = await db.identity_verifications.find_one({"user_id": target["id"]}, {"_id": 0})
    if existing:
        await audit_identity(u, "identity.start.existing", existing["id"], target["id"], hotel_id)
        return await public_identity_verification(existing)
    now = now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": target["id"],
        "hotel_id": hotel_id,
        "hotelId": hotel_id,
        "role": target_role,
        "subject_type": subject_type,
        "status": identity_initial_status(subject_type),
        "profile": {},
        "encrypted_profile": {},
        "masked_document_number": None,
        "created_by": u["id"],
        "updated_by": u["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.identity_verifications.insert_one(doc.copy())
    await append_verification_history({**doc, "status": None}, u, doc["status"], "Kimlik doğrulama başlatıldı")
    await audit_identity(u, "identity.start", doc["id"], target["id"], hotel_id)
    return await public_identity_verification(doc)

@api.get("/identity/me", response_model=IdentityVerificationOut)
async def identity_me(u: dict = Depends(get_current_user)):
    require_roles(u, "guest", "staff")
    doc = await db.identity_verifications.find_one({"user_id": u["id"]}, {"_id": 0})
    if not doc:
        return await identity_start(IdentityStartIn(), u)
    return await public_identity_verification(doc)

@api.put("/identity/me", response_model=IdentityVerificationOut)
async def identity_update_me(body: IdentityProfileIn, u: dict = Depends(get_current_user)):
    require_roles(u, "guest", "staff")
    doc = await db.identity_verifications.find_one({"user_id": u["id"]}, {"_id": 0})
    if not doc:
        doc = (await identity_start(IdentityStartIn(), u)).model_dump()
    if not can_access_verification(u, doc, write=True):
        raise HTTPException(403, "Bu kayıt güncellenemez")
    subject_type = doc.get("subject_type") or user_subject_type(u)
    profile = {
        "first_name": body.first_name.strip(),
        "last_name": body.last_name.strip(),
        "birth_date": validate_birth_date(body.birth_date),
        "nationality": body.nationality.strip(),
        "document_type": body.document_type.strip(),
        "document_expiry_date": body.document_expiry_date.strip() if body.document_expiry_date else None,
        "employee_role": body.employee_role.strip() if body.employee_role else (u.get("department") if subject_type == "employee" else None),
        "employment_start_date": body.employment_start_date.strip() if body.employment_start_date else None,
        "manager_approved": bool(body.manager_approved) if body.manager_approved is not None else False,
        "internal_notes": body.internal_notes.strip() if body.internal_notes else None,
    }
    if not profile["first_name"] or not profile["last_name"] or not profile["nationality"] or not profile["document_type"] or not body.document_number.strip():
        raise HTTPException(400, "Zorunlu kimlik alanları eksik")
    next_status = identity_submitted_status(subject_type)
    update = {
        "profile": profile,
        "encrypted_profile": {"document_number": encrypt_sensitive(body.document_number)},
        "masked_document_number": mask_identity_number(body.document_number),
        "document_fingerprint": identity_fingerprint(body.document_number),
        "status": next_status,
        "updated_by": u["id"],
        "updated_at": now_iso(),
    }
    await append_verification_history(doc, u, next_status, "Kimlik bilgileri gönderildi")
    await db.identity_verifications.update_one({"id": doc["id"]}, {"$set": update})
    await audit_identity(u, "identity.profile.update", doc["id"], u["id"], doc.get("hotel_id"))
    fresh = await load_verification(doc["id"])
    return await public_identity_verification(fresh)

@api.get("/manager/identity", response_model=List[IdentityVerificationOut])
async def manager_identity_list(u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    docs = await db.identity_verifications.find(with_hotel_scope(u), {"_id": 0}).sort("updated_at", -1).to_list(500)
    return [await public_identity_verification(d) for d in docs]

@api.get("/system/identity", response_model=List[IdentityVerificationOut])
async def system_identity_list(hotel_id: Optional[str] = None, u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    q: dict = {}
    if hotel_id:
        q = {"$or": [{"hotel_id": hotel_id}, {"hotelId": hotel_id}]}
    docs = await db.identity_verifications.find(q, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    return [await public_identity_verification(d) for d in docs]

async def identity_decision(verification_id: str, u: dict, status_value: str, action: str, note: Optional[str] = None) -> IdentityVerificationOut:
    doc = await load_verification(verification_id)
    if not can_access_verification(u, doc, write=True) or role_of(u) not in ("hotel_manager", "system_admin"):
        raise HTTPException(403, "Bu doğrulama için yetkiniz yok")
    update = {"status": status_value, "updated_by": u["id"], "updated_at": now_iso()}
    if status_value in ("approved", "verified", "verified_by_hotel", "active_employee"):
        update["profile.manager_approved"] = True
    await append_verification_history(doc, u, status_value, note)
    await db.identity_verifications.update_one({"id": verification_id}, {"$set": update})
    user_update = {"identity_status": status_value}
    if doc.get("subject_type") == "employee":
        user_update["active"] = status_value in {"verified_by_hotel", "approved", "active_employee"}
    await db.users.update_one({"id": doc.get("user_id")}, {"$set": user_update})
    if doc.get("reservation_id"):
        synced = await sync_reservation_identity_status(doc["reservation_id"])
        if synced and synced.get("identity_status") == "verification_failed":
            await create_identity_alert(
                doc.get("hotel_id") or DEFAULT_HOTEL_ID,
                doc["reservation_id"],
                "Identity verification failed",
                f"Identity verification failed for reservation #{doc['reservation_id']}. Manual review is required.",
                "danger",
            )
        elif synced and synced.get("identity_status") == "fully_verified":
            await create_identity_alert(
                doc.get("hotel_id") or DEFAULT_HOTEL_ID,
                doc["reservation_id"],
                "Identity verification completed",
                f"All guests verified for reservation #{doc['reservation_id']}. Hotel entry code generated.",
                "success",
            )
    if status_value in {"rejected", "suspicious", "needs_new_documents"}:
        await create_identity_alert(
            doc.get("hotel_id") or DEFAULT_HOTEL_ID,
            doc.get("reservation_id") or doc.get("user_id"),
            "Identity verification needs attention",
            f"{status_value}: manual review required.",
            "danger" if status_value in {"rejected", "suspicious"} else "warning",
        )
    await audit_identity(u, action, verification_id, doc.get("user_id"), doc.get("hotel_id"), {"note": note})
    fresh = await load_verification(verification_id)
    return await public_identity_verification(fresh)

@api.post("/identity/{verification_id}/approve", response_model=IdentityVerificationOut)
async def identity_approve(verification_id: str, body: IdentityDecisionIn, u: dict = Depends(get_current_user)):
    return await identity_decision(verification_id, u, "verified_by_hotel", "identity.approve", body.note)

@api.post("/identity/{verification_id}/reject", response_model=IdentityVerificationOut)
async def identity_reject(verification_id: str, body: IdentityDecisionIn, u: dict = Depends(get_current_user)):
    return await identity_decision(verification_id, u, "rejected", "identity.reject", body.note)

@api.post("/identity/{verification_id}/request-documents", response_model=IdentityVerificationOut)
async def identity_request_documents(verification_id: str, body: IdentityDecisionIn, u: dict = Depends(get_current_user)):
    return await identity_decision(verification_id, u, "needs_new_documents", "identity.request_documents", body.note)

@api.post("/identity/{verification_id}/activate-employee", response_model=IdentityVerificationOut)
async def identity_activate_employee(verification_id: str, body: IdentityDecisionIn, u: dict = Depends(get_current_user)):
    doc = await load_verification(verification_id)
    if doc.get("subject_type") != "employee":
        raise HTTPException(400, "Yalnızca çalışan kaydı aktif çalışan yapılabilir")
    return await identity_decision(verification_id, u, "active_employee", "identity.activate_employee", body.note)

@api.get("/identity/{verification_id}/history", response_model=List[VerificationHistoryOut])
async def identity_history(verification_id: str, u: dict = Depends(get_current_user)):
    doc = await load_verification(verification_id)
    if not can_access_verification(u, doc, write=False):
        raise HTTPException(403, "Bu geçmişe erişim yetkiniz yok")
    rows = await db.verification_history.find({"verification_id": verification_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    await audit_identity(u, "identity.history.view", verification_id, doc.get("user_id"), doc.get("hotel_id"))
    return [VerificationHistoryOut(**r) for r in rows]

@api.post("/identity/{verification_id}/documents", response_model=IdentityDocumentOut)
async def identity_upload_document(verification_id: str, body: IdentityDocumentUploadIn, u: dict = Depends(get_current_user)):
    doc = await load_verification(verification_id)
    if not can_access_verification(u, doc, write=True):
        raise HTTPException(403, "Belge yükleme yetkiniz yok")
    if doc.get("user_id") != u.get("id") and role_of(u) not in ("hotel_manager", "system_admin"):
        raise HTTPException(403, "Bu kayıt için belge yükleyemezsiniz")
    detected_mime, data = parse_data_uri(body.data_uri)
    mime_type = (body.mime_type or detected_mime or "application/octet-stream").strip()
    if mime_type == "image/jpg":
        mime_type = "image/jpeg"
    if mime_type not in {"image/jpeg", "image/png", "application/pdf"}:
        raise HTTPException(400, "Desteklenmeyen belge türü")
    checksum = hashlib.sha256(data).hexdigest()
    quality = await identity_provider.analyze_document(data, mime_type)
    if quality.get("is_low_resolution") or quality.get("is_blurry"):
        raise HTTPException(400, "Belge kalitesi yetersiz; daha net ve yüksek çözünürlüklü belge yükleyin")
    perceptual_hash = average_hash(data) if mime_type.startswith("image/") else None
    duplicates = await duplicate_signals(doc, doc.get("document_fingerprint"), checksum, perceptual_hash)
    encrypted_data = identity_encrypt_bytes(data)
    out = {
        "id": str(uuid.uuid4()),
        "verification_id": verification_id,
        "document_type": body.document_type,
        "file_name": Path(body.file_name or body.document_type).name,
        "mime_type": mime_type,
        "size": len(data),
        "checksum": checksum,
        "perceptual_hash": perceptual_hash,
        "quality": quality,
        "duplicate_signals": duplicates,
        "encrypted_data": encrypted_data,
        "uploaded_by": u["id"],
        "hotel_id": doc.get("hotel_id"),
        "hotelId": doc.get("hotel_id"),
        "created_at": now_iso(),
    }
    await db.identity_documents.insert_one(out.copy())
    next_status = identity_submitted_status(doc.get("subject_type") or "guest")
    if duplicates:
        next_status = "suspicious"
    await append_verification_history(doc, u, next_status, f"{body.document_type} belgesi yüklendi")
    await db.identity_verifications.update_one({"id": verification_id}, {"$set": {"status": next_status, "updated_by": u["id"], "updated_at": now_iso()}})
    await audit_identity(u, "identity.document.upload", verification_id, doc.get("user_id"), doc.get("hotel_id"), {"document_type": body.document_type, "size": len(data)})
    return IdentityDocumentOut(**{k: v for k, v in out.items() if k != "encrypted_data"})

@api.get("/identity/liveness-challenge", response_model=LivenessChallengeOut)
async def identity_liveness_challenge(u: dict = Depends(get_current_user)):
    require_roles(u, "guest", "staff")
    actions = ["turn_left", "turn_right", "look_up", "look_down", "blink", "smile"]
    selected = secrets.SystemRandom().sample(actions, 3)
    now = datetime.now(timezone.utc)
    challenge = {
        "id": str(uuid.uuid4()),
        "user_id": u["id"],
        "actions": selected,
        "expires_at": (now + timedelta(minutes=10)).isoformat(),
        "created_at": now.isoformat(),
    }
    await db.identity_liveness_challenges.insert_one(challenge.copy())
    return LivenessChallengeOut(**challenge)

@api.post("/identity/{verification_id}/selfie", response_model=FaceResultOut)
async def identity_upload_selfie(verification_id: str, body: SelfieUploadIn, u: dict = Depends(get_current_user)):
    verification = await load_verification(verification_id)
    if not can_access_verification(u, verification, write=True):
        raise HTTPException(403, "Selfie yükleme yetkiniz yok")
    if verification.get("user_id") != u.get("id"):
        raise HTTPException(403, "Selfie yalnızca kayıt sahibi tarafından yüklenebilir")
    detected_mime, data = parse_data_uri(body.data_uri)
    mime_type = (body.mime_type or detected_mime or "image/jpeg").strip()
    if mime_type == "image/jpg":
        mime_type = "image/jpeg"
    if mime_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(400, "Selfie JPG veya PNG olmalı")
    if body.challenge_id:
        challenge = await db.identity_liveness_challenges.find_one({"id": body.challenge_id, "user_id": u["id"]}, {"_id": 0})
        if not challenge:
            raise HTTPException(400, "Liveness challenge bulunamadı")
        expected = set(challenge.get("actions") or [])
        if not expected.issubset(set(body.completed_actions)):
            raise HTTPException(400, "Liveness adımları tamamlanmadı")
    checksum = hashlib.sha256(data).hexdigest()
    quality = await identity_provider.analyze_document(data, mime_type)
    selfie_doc = {
        "id": str(uuid.uuid4()),
        "verification_id": verification_id,
        "document_type": "selfie",
        "file_name": Path(body.file_name or "selfie.jpg").name,
        "mime_type": mime_type,
        "size": len(data),
        "checksum": checksum,
        "perceptual_hash": average_hash(data),
        "quality": quality,
        "encrypted_data": identity_encrypt_bytes(data),
        "uploaded_by": u["id"],
        "hotel_id": verification.get("hotel_id"),
        "hotelId": verification.get("hotel_id"),
        "created_at": now_iso(),
    }
    await db.identity_documents.insert_one(selfie_doc.copy())
    document = await db.identity_documents.find_one({"verification_id": verification_id, "document_type": {"$in": ["id_front", "passport"]}}, {"_id": 0}, sort=[("created_at", -1)])
    face = await identity_provider.run_face_comparison(selfie_doc, document, body.completed_actions)
    result = {
        "id": str(uuid.uuid4()),
        "verification_id": verification_id,
        "provider": identity_provider.name,
        "created_at": now_iso(),
        **face,
    }
    await db.identity_face_results.insert_one(result.copy())
    await append_verification_history(verification, u, "pending_review", "Canlı selfie ve liveness adımları gönderildi")
    await db.identity_verifications.update_one({"id": verification_id}, {"$set": {"status": "pending_review", "updated_by": u["id"], "updated_at": now_iso()}})
    await audit_identity(u, "identity.selfie.upload", verification_id, verification.get("user_id"), verification.get("hotel_id"), {"completed_actions": body.completed_actions})
    return FaceResultOut(**result)

@api.post("/identity/{verification_id}/run-ocr", response_model=OcrResultOut)
async def identity_run_ocr(verification_id: str, u: dict = Depends(get_current_user)):
    verification = await load_verification(verification_id)
    if not can_access_verification(u, verification, write=False):
        raise HTTPException(403, "OCR çalıştırma yetkiniz yok")
    document = await db.identity_documents.find_one({"verification_id": verification_id, "document_type": {"$in": ["id_front", "passport"]}}, {"_id": 0}, sort=[("created_at", -1)])
    if not document:
        raise HTTPException(400, "OCR için belge bulunamadı")
    data = identity_decrypt_bytes(document["encrypted_data"])
    ocr = await identity_provider.run_ocr(data, document.get("mime_type") or "image/jpeg", verification.get("profile") or {}, verification.get("masked_document_number"))
    result = {
        "id": str(uuid.uuid4()),
        "verification_id": verification_id,
        "provider": identity_provider.name,
        "created_at": now_iso(),
        **ocr,
    }
    await db.identity_ocr_results.insert_one(result.copy())
    next_status = "needs_review" if ocr.get("status") in ("unavailable", "failed") or ocr.get("mismatches") else "pending_review"
    await db.identity_verifications.update_one({"id": verification_id}, {"$set": {"status": next_status, "updated_by": u["id"], "updated_at": now_iso()}})
    await append_verification_history(verification, u, next_status, "OCR analizi çalıştırıldı")
    await audit_identity(u, "identity.ocr.run", verification_id, verification.get("user_id"), verification.get("hotel_id"), {"status": ocr.get("status"), "mismatches": ocr.get("mismatches")})
    return OcrResultOut(**result)

@api.post("/identity/{verification_id}/run-face-comparison", response_model=FaceResultOut)
async def identity_run_face_comparison(verification_id: str, u: dict = Depends(get_current_user)):
    verification = await load_verification(verification_id)
    if not can_access_verification(u, verification, write=False):
        raise HTTPException(403, "Face comparison çalıştırma yetkiniz yok")
    selfie = await db.identity_documents.find_one({"verification_id": verification_id, "document_type": "selfie"}, {"_id": 0}, sort=[("created_at", -1)])
    if not selfie:
        raise HTTPException(400, "Selfie bulunamadı")
    document = await db.identity_documents.find_one({"verification_id": verification_id, "document_type": {"$in": ["id_front", "passport"]}}, {"_id": 0}, sort=[("created_at", -1)])
    previous = await latest_analysis("identity_face_results", verification_id)
    completed_actions = (previous or {}).get("completed_actions") or []
    face = await identity_provider.run_face_comparison(selfie, document, completed_actions)
    result = {
        "id": str(uuid.uuid4()),
        "verification_id": verification_id,
        "provider": identity_provider.name,
        "created_at": now_iso(),
        **face,
    }
    await db.identity_face_results.insert_one(result.copy())
    await append_verification_history(verification, u, "pending_review", "Yüz karşılaştırma analizi çalıştırıldı")
    await audit_identity(u, "identity.face.run", verification_id, verification.get("user_id"), verification.get("hotel_id"), {"similarity_score": face.get("similarity_score")})
    return FaceResultOut(**result)

@api.post("/identity/{verification_id}/run-fraud-analysis", response_model=FraudAnalysisOut)
async def identity_run_fraud_analysis(verification_id: str, u: dict = Depends(get_current_user)):
    verification = await load_verification(verification_id)
    if not can_access_verification(u, verification, write=False):
        raise HTTPException(403, "Fraud analizi çalıştırma yetkiniz yok")
    docs = await db.identity_documents.find({"verification_id": verification_id}, {"_id": 0}).to_list(100)
    latest_ocr = await latest_analysis("identity_ocr_results", verification_id)
    latest_face = await latest_analysis("identity_face_results", verification_id)
    signals: list[str] = []
    duplicate_hits: list[str] = []
    score = 100
    if not docs:
        signals.append("missing_documents")
        score -= 35
    for item in docs:
        quality = item.get("quality") or {}
        if quality.get("is_blurry"):
            signals.append("blurry_document")
            score -= 20
        if quality.get("is_low_resolution"):
            signals.append("low_resolution_document")
            score -= 20
        if quality.get("crop_risk"):
            signals.append("crop_risk")
            score -= 10
        duplicate_hits.extend(item.get("duplicate_signals") or [])
    duplicate_hits.extend(await duplicate_signals(verification, verification.get("document_fingerprint")))
    duplicate_hits = sorted(set(duplicate_hits))
    if duplicate_hits:
        signals.append("duplicate_detected")
        score -= 35
    if not latest_ocr:
        signals.append("ocr_not_run")
        score -= 10
    elif latest_ocr.get("status") != "completed":
        signals.append("ocr_unavailable")
        score -= 15
    elif latest_ocr.get("mismatches"):
        signals.extend([f"ocr_mismatch:{m}" for m in latest_ocr.get("mismatches", [])])
        score -= 25
    if not latest_face:
        signals.append("face_not_run")
        score -= 10
    else:
        if not latest_face.get("face_present"):
            signals.append("selfie_face_missing")
            score -= 25
        if latest_face.get("similarity_score", 0) < 50:
            signals.append("low_face_similarity")
            score -= 15
        if latest_face.get("liveness_score", 0) < 70:
            signals.append("liveness_incomplete")
            score -= 15
    score = max(0, min(100, int(score)))
    if score >= 75 and not duplicate_hits:
        risk, recommended = "low", "pending_review"
    elif score >= 45:
        risk, recommended = "medium", "needs_review"
    else:
        risk, recommended = "high", "suspicious"
    if any(s in signals for s in ["missing_documents", "blurry_document", "low_resolution_document"]):
        recommended = "needs_new_documents"
    result = {
        "id": str(uuid.uuid4()),
        "verification_id": verification_id,
        "status": "completed",
        "fraud_risk": risk,
        "confidence_score": score,
        "signals": sorted(set(signals)),
        "duplicate_hits": duplicate_hits,
        "recommended_status": recommended,
        "provider": identity_provider.name,
        "created_at": now_iso(),
    }
    await db.identity_fraud_analysis.insert_one(result.copy())
    await db.identity_verifications.update_one({"id": verification_id}, {"$set": {"status": recommended, "updated_by": u["id"], "updated_at": now_iso()}})
    await append_verification_history(verification, u, recommended, "Fraud ve confidence analizi çalıştırıldı")
    await audit_identity(u, "identity.fraud.run", verification_id, verification.get("user_id"), verification.get("hotel_id"), {"risk": risk, "score": score, "signals": result["signals"]})
    return FraudAnalysisOut(**result)

@api.get("/identity/{verification_id}/documents/{document_id}")
async def identity_get_document(verification_id: str, document_id: str, u: dict = Depends(get_current_user)):
    verification = await load_verification(verification_id)
    if not can_access_verification(u, verification, write=False):
        raise HTTPException(403, "Belgeye erişim yetkiniz yok")
    doc = await db.identity_documents.find_one({"id": document_id, "verification_id": verification_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Belge bulunamadı")
    try:
        data = identity_decrypt_bytes(doc["encrypted_data"])
    except ValueError:
        raise HTTPException(500, "Belge şifresi çözülemedi")
    await audit_identity(u, "identity.document.view", verification_id, verification.get("user_id"), verification.get("hotel_id"), {"document_id": document_id})
    headers = {"Content-Disposition": f"inline; filename=\"{doc.get('file_name') or 'document'}\""}
    return Response(content=data, media_type=doc.get("mime_type") or "application/octet-stream", headers=headers)

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

@api.get("/manager/identity-alerts")
async def manager_identity_alerts(u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    docs = await db.identity_alerts.find(with_hotel_scope(u), {"_id": 0}).sort("created_at", -1).to_list(50)
    return docs

@api.get("/meta/departments")
async def meta_departments():
    return [{"code": k, "name": v} for k, v in DEPARTMENTS.items()]

# --------------------------------------------------------------------------
# Reservations (public) + Check-in
# --------------------------------------------------------------------------
@api.post("/reservations/identity/start", response_model=ReservationIdentityStartOut)
async def public_start_reservation_identity(body: ReservationIdentityStartIn):
    return ReservationIdentityStartOut(**await create_reservation_identity_session(body))

@api.post("/reservations", response_model=ReservationOut)
async def public_create_reservation(body: ReservationCreateIn):
    """Public endpoint — guest can reserve without password. Returns access_code."""
    email = body.customer_email.lower()
    ci, co = validate_stay_dates(body.check_in_date, body.check_out_date)
    capacity = int(body.capacity or 1)
    if capacity < 1 or capacity > 4:
        raise HTTPException(400, "Kişi sayısı 1-4 arasında olmalı")
    # If user already exists (already checked in), block to avoid duplicates
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        raise HTTPException(409, "Bu e-posta zaten otele kayıtlı. Lütfen giriş yapın.")
    existing_pending = await db.reservations.find_one({"customer_email": email, "status": "pending"}, {"_id": 0})
    if existing_pending:
        raise HTTPException(409, "Bu e-posta için bekleyen bir rezervasyon zaten var. Lütfen mevcut rezervasyon kodunuzu kullanın.")
    room = await resolve_room_for_reservation(DEFAULT_HOTEL_ID, ci, co, capacity, body.room_id, body.room_number)
    if not room:
        raise HTTPException(400, "Lütfen uygun bir oda seçin")
    room_snapshot = room_reservation_snapshot(room, ci, co)
    identity_requested = bool(body.identity_verification_requested)
    identity_members = normalize_reservation_identity_members(body.identity_members, body.customer_name, capacity) if identity_requested else []
    code = "" if identity_requested else await unique_access_code()
    doc = {
        "id": str(uuid.uuid4()),
        "customer_name": body.customer_name.strip(),
        "customer_email": email,
        "customer_phone": body.customer_phone.strip(),
        "capacity": capacity,
        **room_snapshot,
        "check_in_date": ci,
        "check_out_date": co,
        "hotel_id": DEFAULT_HOTEL_ID,
        "hotelId": DEFAULT_HOTEL_ID,
        "payment_status": body.payment_status,
        "guest_type": body.guest_type,
        "identity_verification_requested": identity_requested,
        "identity_status": "waiting_for_verification" if identity_requested else "not_required",
        "identity_members": identity_members,
        "identity_failure_reason": None,
        "encrypted_entry_code": None,
        "entry_code_hash": None,
        "entry_code_expires_at": None,
        "access_code": code,
        "status": "pending",
        "user_id": None,
        "email_sent": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.reservations.insert_one(doc.copy())
    if identity_requested:
        if body.identity_session_id:
            doc["identity_members"] = await attach_identity_session_to_reservation(body.identity_session_id, doc)
        else:
            doc["identity_members"] = await create_reservation_identity_records(doc)
        await create_identity_alert(
            DEFAULT_HOTEL_ID,
            doc["id"],
            "Rezervasyon kimlik doğrulaması bekliyor",
            f"{doc['customer_name']} için {len(identity_members)} kişi kimlik doğrulaması başlatıldı.",
        )
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
        r = await db.reservations.find_one({"customer_email": email, "entry_code_hash": identity_fingerprint(code)}, {"_id": 0})
    if not r:
        raise HTTPException(401, "E-posta veya rezervasyon kodu hatalı")
    if r["status"] not in ("pending", "checked_in"):
        raise HTTPException(400, "Rezervasyon aktif değil")
    if r.get("identity_verification_requested") and public_reservation_identity_status(r.get("identity_status"), True) != "fully_verified":
        raise HTTPException(403, "Kimlik doğrulaması tamamlanmadan otele giriş kodu kullanılamaz")
    if r.get("entry_code_expires_at"):
        try:
            if datetime.fromisoformat(r["entry_code_expires_at"]) < datetime.now(timezone.utc):
                raise HTTPException(403, "Otel giriş kodunun süresi dolmuş")
        except HTTPException:
            raise
        except Exception:
            pass
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
    capacity = int(body.capacity or 1)
    if capacity < 1 or capacity > 4:
        raise HTTPException(400, "Kişi sayısı 1-4 arasında olmalı")
    if body.status != "pending":
        raise HTTPException(400, "Yeni rezervasyon beklemede durumuyla oluşturulmalı")
    room = await resolve_room_for_reservation(user_hotel_id(u), ci, co, capacity, body.room_id, body.room_number)
    room_snapshot = room_reservation_snapshot(room, ci, co)
    identity_requested = bool(body.identity_verification_requested)
    identity_members = normalize_reservation_identity_members(body.identity_members, body.customer_name, capacity) if identity_requested else []
    code = "" if identity_requested else await unique_access_code()
    doc = {
        "id": str(uuid.uuid4()),
        "customer_name": body.customer_name.strip(),
        "customer_email": email,
        "customer_phone": body.customer_phone.strip(),
        "capacity": capacity,
        **room_snapshot,
        "check_in_date": ci,
        "check_out_date": co,
        "hotel_id": user_hotel_id(u),
        "hotelId": user_hotel_id(u),
        "payment_status": body.payment_status,
        "guest_type": body.guest_type,
        "identity_verification_requested": identity_requested,
        "identity_status": "waiting_for_verification" if identity_requested else "not_required",
        "identity_members": identity_members,
        "identity_failure_reason": None,
        "encrypted_entry_code": None,
        "entry_code_hash": None,
        "entry_code_expires_at": None,
        "access_code": code,
        "status": body.status,
        "user_id": None,
        "email_sent": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.reservations.insert_one(doc.copy())
    if identity_requested:
        if body.identity_session_id:
            doc["identity_members"] = await attach_identity_session_to_reservation(body.identity_session_id, doc)
        else:
            doc["identity_members"] = await create_reservation_identity_records(doc, u["id"])
        await create_identity_alert(
            user_hotel_id(u),
            doc["id"],
            "Rezervasyon kimlik doğrulaması bekliyor",
            f"{doc['customer_name']} için {len(identity_members)} kişi kimlik doğrulaması başlatıldı.",
        )
    sent = await send_reservation_email(doc)
    if sent:
        await db.reservations.update_one({"id": doc["id"]}, {"$set": {"email_sent": True}})
        doc["email_sent"] = True
    return public_reservation(doc)

class AssignRoomIn(BaseModel):
    room_id: Optional[str] = None
    room_number: str

@api.post("/admin/reservations/{rid}/assign-room", response_model=ReservationOut)
async def admin_assign_room(rid: str, body: AssignRoomIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    if not r:
        raise HTTPException(404, "Rezervasyon bulunamadı")
    room = await resolve_room_for_reservation(
        user_hotel_id(u),
        r.get("check_in_date"),
        r.get("check_out_date"),
        int(r.get("capacity") or 1),
        body.room_id,
        body.room_number,
        exclude_reservation_id=rid,
    )
    update = {**room_reservation_snapshot(room, r.get("check_in_date"), r.get("check_out_date")), "updated_at": now_iso()}
    await db.reservations.update_one(
        with_hotel_scope(u, {"id": rid}), {"$set": update},
    )
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    return public_reservation(r)

@api.patch("/admin/reservations/{rid}", response_model=ReservationOut)
async def admin_update_reservation(rid: str, body: AdminReservationUpdateIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    current = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    if not current:
        raise HTTPException(404, "Rezervasyon bulunamadı")
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "capacity" in update:
        cap = int(update["capacity"])
        if cap < 1 or cap > 4:
            raise HTTPException(400, "Kişi sayısı 1-4 arasında olmalı")
        update["capacity"] = cap
    if body.check_in_date or body.check_out_date or body.room_id or body.room_number or body.capacity:
        ci, co = validate_stay_dates(
            body.check_in_date or current.get("check_in_date"),
            body.check_out_date or current.get("check_out_date"),
        )
        update["check_in_date"] = ci
        update["check_out_date"] = co
        capacity = int(update.get("capacity") or current.get("capacity") or 1)
        room = await resolve_room_for_reservation(
            user_hotel_id(u),
            ci,
            co,
            capacity,
            body.room_id or current.get("room_id"),
            body.room_number or current.get("room_number"),
            exclude_reservation_id=rid,
        )
        update.update(room_reservation_snapshot(room, ci, co))
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
    if r.get("identity_verification_requested") and public_reservation_identity_status(r.get("identity_status"), True) != "fully_verified":
        raise HTTPException(403, "Kimlik doğrulaması onaylanmadan check-in yapılamaz")
    await db.reservations.update_one(
        with_hotel_scope(u, {"id": rid}), {"$set": {"status": "checked_in", "updated_at": now_iso()}},
    )
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    return public_reservation(r)

@api.post("/admin/reservations/{rid}/identity/approve", response_model=ReservationOut)
async def admin_approve_reservation_identity(rid: str, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    if not r:
        raise HTTPException(404, "Rezervasyon bulunamadı")
    verifications = await db.identity_verifications.find({"reservation_id": rid}, {"_id": 0}).to_list(100)
    if not verifications:
        await create_reservation_identity_records(r, u["id"])
        verifications = await db.identity_verifications.find({"reservation_id": rid}, {"_id": 0}).to_list(100)
    for verification in verifications:
        await identity_decision(verification["id"], u, "verified_by_hotel", "reservation.identity.approve", "Reservation manual approval")
    r = await sync_reservation_identity_status(rid) or r
    await db.reservations.update_one(with_hotel_scope(u, {"id": rid}), {"$set": {"identity_failure_reason": None}})
    await create_identity_alert(
        user_hotel_id(u),
        rid,
        "Kimlik doğrulama başarılı",
        f"{r.get('customer_name')} rezervasyonu için giriş kodu aktif edildi.",
        "success",
    )
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    sent = await send_reservation_email(r)
    if sent:
        await db.reservations.update_one(with_hotel_scope(u, {"id": rid}), {"$set": {"email_sent": True}})
        r["email_sent"] = True
    return public_reservation(r)

@api.post("/admin/reservations/{rid}/identity/reject", response_model=ReservationOut)
async def admin_reject_reservation_identity(rid: str, body: IdentityDecisionIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    if not r:
        raise HTTPException(404, "Rezervasyon bulunamadı")
    reason = (body.note or "Kimlik doğrulama başarısız").strip()
    verifications = await db.identity_verifications.find({"reservation_id": rid}, {"_id": 0}).to_list(100)
    if not verifications:
        await create_reservation_identity_records(r, u["id"])
        verifications = await db.identity_verifications.find({"reservation_id": rid}, {"_id": 0}).to_list(100)
    for verification in verifications:
        await identity_decision(verification["id"], u, "rejected", "reservation.identity.reject", reason)
    await db.reservations.update_one(with_hotel_scope(u, {"id": rid}), {"$set": {"identity_status": "verification_failed", "identity_failure_reason": reason, "access_code": "", "updated_at": now_iso()}})
    await create_identity_alert(
        user_hotel_id(u),
        rid,
        "Kimlik doğrulama başarısız",
        f"{r.get('customer_name')} rezervasyonu: {reason}",
        "danger",
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
    r = await db.reservations.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    return public_reservation(r)

@api.get("/admin/rooms", response_model=List[RoomOut])
async def admin_list_rooms(u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    docs = await db.rooms.find(with_hotel_scope(u), {"_id": 0}).sort([("floor", 1), ("room_number", 1)]).to_list(1000)
    return [await public_room(d) for d in docs]

@api.post("/admin/rooms", response_model=RoomOut)
async def admin_create_room(body: RoomIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    payload = normalize_room_payload(body)
    rn = payload["room_number"]
    existing = await db.rooms.find_one(with_hotel_scope(u, {"room_number": rn}))
    if existing:
        raise HTTPException(409, "Bu oda numarası zaten kayıtlı")
    doc = {
        "id": str(uuid.uuid4()),
        **payload,
        "status": "available",
        "hotel_id": user_hotel_id(u),
        "hotelId": user_hotel_id(u),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.rooms.insert_one(doc.copy())
    return await public_room(doc)

@api.patch("/admin/rooms/{rid}", response_model=RoomOut)
async def admin_update_room(rid: str, body: RoomUpdateIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    current = await db.rooms.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    if not current:
        raise HTTPException(404, "Oda bulunamadı")
    update = normalize_room_payload(body, current)
    new_number = update.get("room_number")
    if new_number and new_number != current.get("room_number"):
        existing = await db.rooms.find_one(with_hotel_scope(u, {"room_number": new_number, "id": {"$ne": rid}}))
        if existing:
            raise HTTPException(409, "Bu oda numarası zaten kayıtlı")
    if update:
        update["updated_at"] = now_iso()
        await db.rooms.update_one(with_hotel_scope(u, {"id": rid}), {"$set": update})
        if new_number and new_number != current.get("room_number"):
            await db.reservations.update_many(
                with_hotel_scope(u, {"room_id": rid}),
                {"$set": {"room_number": new_number, "updated_at": now_iso()}},
            )
            await db.users.update_many(
                with_hotel_scope(u, {"room_no": current.get("room_number")}),
                {"$set": {"room_no": new_number}},
            )
    room = await db.rooms.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    return await public_room(room)

@api.get("/admin/rooms/available", response_model=List[RoomOut])
async def admin_available_rooms(
    check_in_date: str = Query(...),
    check_out_date: str = Query(...),
    capacity: int = Query(1, ge=1, le=4),
    u: dict = Depends(get_current_user),
):
    require_roles(u, "hotel_manager")
    ci, co = validate_stay_dates(check_in_date, check_out_date)
    rooms = await find_available_rooms(ci, co, capacity, user_hotel_id(u))
    return [await public_room(r) for r in rooms]

@api.get("/admin/rooms/{rid}/status", response_model=RoomOut)
async def admin_room_status(rid: str, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    room = await db.rooms.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    if not room:
        raise HTTPException(404, "Oda bulunamadı")
    return await public_room(room)

@api.delete("/admin/rooms/{rid}")
async def admin_delete_room(rid: str, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    room = await db.rooms.find_one(with_hotel_scope(u, {"id": rid}), {"_id": 0})
    if not room:
        raise HTTPException(404, "Oda bulunamadı")
    active = await active_room_reservation(room, "0001-01-01", "9999-12-31")
    if active:
        raise HTTPException(409, "Aktif rezervasyonu olan oda silinemez")
    res = await db.rooms.delete_one(with_hotel_scope(u, {"id": rid}))
    if res.deleted_count == 0:
        raise HTTPException(404, "Oda bulunamadı")
    return {"ok": True}

@api.get("/rooms/available", response_model=List[RoomOut])
async def public_available_rooms(
    check_in_date: str = Query(...),
    check_out_date: str = Query(...),
    capacity: int = Query(1, ge=1, le=4),
):
    ci, co = validate_stay_dates(check_in_date, check_out_date)
    rooms = await find_available_rooms(ci, co, capacity, DEFAULT_HOTEL_ID)
    return [await public_room(r) for r in rooms]

@api.get("/rooms/{room_id}/price", response_model=RoomPriceOut)
async def public_room_price(room_id: str, check_in_date: str = Query(...), check_out_date: str = Query(...)):
    ci, co = validate_stay_dates(check_in_date, check_out_date)
    room = await db.rooms.find_one(room_base_filter(DEFAULT_HOTEL_ID, {"id": room_id}), {"_id": 0})
    if not room:
        raise HTTPException(404, "Oda bulunamadı")
    nights = nights_between(ci, co)
    price = float(room.get("price_per_night") or 0)
    room_type = room_type_value(room)
    return RoomPriceOut(
        room_id=room["id"],
        room_number=room["room_number"],
        room_name=room.get("room_name"),
        room_type=room_type,
        price_per_night=price,
        total_nights=nights,
        total_price=price * nights,
    )

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
    return await public_room(room) if room else None

@api.get("/staff/rooms", response_model=List[RoomOut])
async def staff_rooms(u: dict = Depends(get_current_user)):
    require_roles(u, "staff")
    docs = await db.rooms.find(with_hotel_scope(u), {"_id": 0}).sort([("floor", 1), ("room_number", 1)]).to_list(1000)
    return [await public_room(d) for d in docs]

@api.patch("/staff/rooms/{room_id}/status", response_model=RoomOut)
async def staff_update_room_status(room_id: str, body: RoomStatusIn, u: dict = Depends(get_current_user)):
    require_roles(u, "staff")
    await db.rooms.update_one(with_hotel_scope(u, {"id": room_id}), {"$set": {"operational_status": body.status, "updated_at": now_iso()}})
    room = await db.rooms.find_one(with_hotel_scope(u, {"id": room_id}), {"_id": 0})
    if not room:
        raise HTTPException(404, "Oda bulunamadı")
    return await public_room(room)

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
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    if body.active and role_of(target) == "staff" and target.get("identity_status") and target.get("identity_status") not in {"verified_by_hotel", "approved", "active_employee"}:
        raise HTTPException(403, "Kimlik doğrulaması onaylanmadan çalışan aktif yapılamaz")
    await db.users.update_one({"id": user_id}, {"$set": {"active": body.active}})
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
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

@api.get("/manager/ai-knowledge", response_model=HotelAiKnowledgeOut)
async def manager_get_ai_knowledge(u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    return public_ai_knowledge(await get_ai_knowledge_doc(user_hotel_id(u)))

@api.put("/manager/ai-knowledge", response_model=HotelAiKnowledgeOut)
async def manager_save_ai_knowledge(body: HotelAiKnowledgeUpdateIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    hotel_id = user_hotel_id(u)
    if not await db.hotels.find_one({"id": hotel_id}, {"_id": 1}):
        raise HTTPException(404, "Otel bulunamadı")
    doc = normalize_ai_knowledge_payload(body.model_dump(), hotel_id, u.get("id") or u.get("email"))
    await db.hotel_ai_knowledge.update_one(
        {"hotel_id": hotel_id},
        {"$set": doc},
        upsert=True,
    )
    return public_ai_knowledge(doc)

@api.delete("/manager/ai-knowledge")
async def manager_delete_ai_knowledge(u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    hotel_id = user_hotel_id(u)
    await db.hotel_ai_knowledge.delete_many({"$or": [{"hotel_id": hotel_id}, {"hotelId": hotel_id}]})
    return {"ok": True}

@api.get("/staff/ai-knowledge", response_model=HotelAiKnowledgeOut)
async def staff_get_ai_knowledge(u: dict = Depends(get_current_user)):
    require_roles(u, "staff")
    return public_ai_knowledge(await get_ai_knowledge_doc(user_hotel_id(u)))

@api.get("/system/ai-knowledge", response_model=HotelAiKnowledgeOut)
async def system_get_ai_knowledge(hotel_id: str = Query(...), u: dict = Depends(get_current_user)):
    require_roles(u, "system_admin")
    hotel_id = hotel_id.strip()
    if not hotel_id:
        raise HTTPException(400, "hotel_id gerekli")
    if not await db.hotels.find_one({"id": hotel_id}, {"_id": 1}):
        raise HTTPException(404, "Otel bulunamadı")
    return public_ai_knowledge(await get_ai_knowledge_doc(hotel_id))

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
        "identity_status": "pending_review" if body.start_identity_verification else None,
        "active": False if body.start_identity_verification else True,
        "created_at": now_iso(),
    }
    if not all([staff["name"], staff["gender"], staff["nationality"], staff["country"], staff["region_city"]]):
        raise HTTPException(400, "Çalışan profil alanları zorunludur")
    await db.users.insert_one(staff.copy())
    if body.start_identity_verification:
        verification = {
            "id": str(uuid.uuid4()),
            "user_id": staff["id"],
            "hotel_id": user_hotel_id(u),
            "hotelId": user_hotel_id(u),
            "role": "staff",
            "subject_type": "employee",
            "status": "pending_review",
            "profile": {
                "first_name": staff["name"].split(" ", 1)[0],
                "last_name": staff["name"].split(" ", 1)[1] if " " in staff["name"] else "",
                "birth_date": staff["birth_date"],
                "nationality": staff["nationality"],
                "document_type": None,
                "employee_role": staff["department"],
            },
            "encrypted_profile": {},
            "masked_document_number": None,
            "created_by": u["id"],
            "updated_by": u["id"],
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.identity_verifications.insert_one(verification.copy())
        await append_verification_history({**verification, "status": None}, u, "pending_review", "Çalışan kaydında kimlik doğrulaması başlatıldı")
        await create_identity_alert(
            user_hotel_id(u),
            staff["id"],
            "Çalışan kimlik doğrulaması başlatıldı",
            f"{staff['name']} için çalışan kimlik doğrulaması bekliyor.",
        )
    return public_admin_user(staff)

@api.patch("/manager/staff/{staff_id}", response_model=UserAdminOut)
async def manager_update_staff(staff_id: str, body: StaffUpdateIn, u: dict = Depends(get_current_user)):
    require_roles(u, "hotel_manager")
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if update.get("department") and update["department"] not in DEPARTMENTS:
        raise HTTPException(400, "Geçerli bir departman seçin")
    if "birth_date" in update:
        update["birth_date"] = validate_birth_date(update["birth_date"])
    current_staff = await db.users.find_one(with_hotel_scope(u, {"id": staff_id, "role": "staff"}), {"_id": 0})
    if not current_staff:
        raise HTTPException(404, "Personel bulunamadı")
    if update.get("active") is True and current_staff.get("identity_status") and current_staff.get("identity_status") not in {"verified_by_hotel", "approved", "active_employee"}:
        raise HTTPException(403, "Kimlik doğrulaması onaylanmadan çalışan aktif yapılamaz")
    for key in ("name", "gender", "nationality", "country", "region_city"):
        if key in update:
            update[key] = update[key].strip()
            if not update[key]:
                raise HTTPException(400, "Çalışan profil alanları boş olamaz")
    if update:
        await db.users.update_one(with_hotel_scope(u, {"id": staff_id, "role": "staff"}), {"$set": update})
    staff = await db.users.find_one(with_hotel_scope(u, {"id": staff_id, "role": "staff"}), {"_id": 0})
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


# --- Panter Security admin dashboard ---
def require_panter_admin(u: dict) -> None:
    require_roles(u, "system_admin", "hotel_manager", "staff")


def public_panter_admin_request(doc: dict) -> PanterAdminRequestOut:
    return PanterAdminRequestOut(
        id=doc["id"],
        type=doc["type"],
        payload=doc.get("payload") or {},
        source=doc.get("source") or "panter-ai",
        status=doc.get("status") or "New",
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


def panter_file_bytes(data_uri: str) -> bytes:
    value = data_uri.split(",", 1)[1] if "," in data_uri else data_uri
    try:
        return base64.b64decode(value)
    except Exception:
        raise HTTPException(400, "File data is invalid")


async def add_panter_inspection_history(request_id: str, action: str, actor: dict, notes: Optional[str] = None) -> None:
    await db.panter_inspection_history.insert_one({
        "id": str(uuid.uuid4()),
        "request_id": request_id,
        "action": action,
        "notes": notes,
        "actor_id": actor.get("id"),
        "actor_name": actor.get("name"),
        "actor_role": role_of(actor),
        "created_at": now_iso(),
    })


def normalize_operation_date(value: Optional[str]) -> str:
    if value and re.match(r"^\d{4}-\d{2}-\d{2}$", value.strip()):
        return value.strip()
    return datetime.now(timezone.utc).date().isoformat()


async def create_panter_operation_event(
    payload: Dict[str, Any],
    event_type: PanterOperationEventType,
    source: str,
    request_id: Optional[str] = None,
    actor_id: Optional[str] = None,
) -> dict:
    title = payload.get("title") or payload.get("projectName") or payload.get("project") or payload.get("company") or event_type
    assigned_employee_id = payload.get("assigned_employee_id") or payload.get("inspector_id") or payload.get("assigned_to")
    assigned_employee_name = payload.get("assigned_employee_name") or payload.get("inspector_name")
    if assigned_employee_id and not assigned_employee_name:
        employee = await db.users.find_one({"id": assigned_employee_id}, {"_id": 0})
        assigned_employee_name = (employee or {}).get("name")
    doc = {
        "id": str(uuid.uuid4()),
        "title": str(title),
        "description": payload.get("description") or payload.get("reason") or payload.get("notes"),
        "date": normalize_operation_date(payload.get("date") or payload.get("preferredDate")),
        "start_time": payload.get("start_time") or payload.get("preferredTime"),
        "end_time": payload.get("end_time"),
        "event_type": event_type,
        "priority": payload.get("priority") or "Medium",
        "status": payload.get("event_status") or "Pending",
        "assigned_employee_id": assigned_employee_id,
        "assigned_employee_name": assigned_employee_name,
        "customer": payload.get("customer") or payload.get("company") or payload.get("name"),
        "project": payload.get("project") or payload.get("projectName"),
        "address": payload.get("address") or payload.get("projectAddress"),
        "notes": payload.get("notes"),
        "attachments": payload.get("attachments") or [],
        "request_id": request_id,
        "source": source,
        "created_by": actor_id or source,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.panter_operations_calendar.insert_one(doc.copy())
    if source == "panter-ai":
        await db.panter_admin_notifications.insert_one({
            "id": str(uuid.uuid4()),
            "type": "operations_calendar_event",
            "title": f"New {event_type} event",
            "event_id": doc["id"],
            "request_id": request_id,
            "read": False,
            "created_at": now_iso(),
        })
    return doc


@api.post("/panter/requests", response_model=PanterAdminRequestOut)
async def create_panter_admin_request(body: PanterAdminRequestIn):
    payload = dict(body.payload or {})
    request_type = body.type
    default_status = {
        "quotation": "New Quotation",
        "recruitment": "HR Review",
        "inspection": "Pending Inspection",
    }[request_type]
    if request_type == "inspection":
        payload.setdefault("status", "Pending Inspection")

    doc = {
        "id": str(uuid.uuid4()),
        "type": request_type,
        "payload": payload,
        "source": body.source or "panter-ai",
        "status": payload.get("status") or default_status,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.panter_admin_requests.insert_one(doc.copy())
    if request_type == "inspection":
        await create_panter_operation_event(payload, "Security Inspection", body.source or "panter-ai", doc["id"])
    logger.info("Panter admin request created: type=%s id=%s", request_type, doc["id"])
    return public_panter_admin_request(doc)


@api.get("/panter/admin/dashboard")
async def panter_admin_dashboard(u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    today = datetime.now(timezone.utc).date().isoformat()
    inspections_today = await db.panter_admin_requests.count_documents({
        "type": "inspection",
        "$or": [
            {"payload.preferredDate": {"$regex": today}},
            {"payload.preferredDate": {"$regex": today[8:10]}},
            {"created_at": {"$regex": f"^{today}"}},
        ],
    })
    pending_inspections = await db.panter_admin_requests.count_documents({"type": "inspection", "status": {"$in": ["Pending Inspection", "Scheduled", "Inspector Assigned"]}})
    new_cvs = await db.panter_cvs.count_documents({"status": {"$in": ["New", "HR Review", None]}})
    ai_conversations = len(await db.chat_messages.distinct("session_id"))
    new_quotations = await db.panter_admin_requests.count_documents({"type": "quotation", "status": {"$in": ["New Quotation", "New"]}})
    total_requests = await db.panter_admin_requests.count_documents({})
    hired = await db.panter_cvs.count_documents({"status": "Hired"})
    rejected = await db.panter_cvs.count_documents({"status": "Rejected"})
    today_events = await db.panter_operations_calendar.find({"date": today}, {"_id": 0}).sort("start_time", 1).to_list(50)
    upcoming_query = {"date": {"$gte": today}, "status": {"$nin": ["Completed", "Cancelled"]}}
    upcoming_events = await db.panter_operations_calendar.find(upcoming_query, {"_id": 0}).sort("date", 1).to_list(50)
    upcoming_inspections = await db.panter_operations_calendar.find({**upcoming_query, "event_type": "Security Inspection"}, {"_id": 0}).sort("date", 1).to_list(50)
    upcoming_meetings = await db.panter_operations_calendar.find({**upcoming_query, "event_type": {"$in": ["Customer Meeting", "Internal Meeting"]}}, {"_id": 0}).sort("date", 1).to_list(50)
    return {
        "today_inspections": inspections_today,
        "pending_inspections": pending_inspections,
        "new_cvs": new_cvs,
        "ai_conversations": ai_conversations,
        "new_quotation_requests": new_quotations,
        "calendar_widgets": {
            "today_schedule": today_events,
            "upcoming_events": upcoming_events,
            "upcoming_inspections": upcoming_inspections,
            "upcoming_meetings": upcoming_meetings,
        },
        "statistics": {
            "total_requests": total_requests,
            "total_cvs": await db.panter_cvs.count_documents({}),
            "hired_candidates": hired,
            "rejected_candidates": rejected,
            "appointments": await db.panter_operations_calendar.count_documents({}),
            "employees": await db.users.count_documents({"role": "staff", "active": {"$ne": False}}),
            "projects": await db.panter_projects.count_documents({}),
            "active_projects": await db.panter_projects.count_documents({"project_status": "Active"}),
        },
    }


@api.get("/panter/admin/requests", response_model=List[PanterAdminRequestOut])
async def list_panter_admin_requests(
    request_type: Optional[PanterRequestType] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    u: dict = Depends(get_current_user),
):
    require_panter_admin(u)
    q: dict = {}
    if request_type:
        q["type"] = request_type
    if status_filter:
        q["status"] = status_filter
    docs = await db.panter_admin_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [public_panter_admin_request(doc) for doc in docs]


@api.patch("/panter/admin/requests/{request_id}", response_model=PanterAdminRequestOut)
async def update_panter_admin_request(request_id: str, body: PanterAdminRequestUpdateIn, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    doc = await db.panter_admin_requests.find_one({"id": request_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    payload = dict(doc.get("payload") or {})
    if body.payload:
        payload.update(body.payload)
    if body.notes is not None:
        payload["admin_notes"] = body.notes
    update = {"payload": payload, "updated_at": now_iso()}
    if body.status:
        update["status"] = body.status
        payload["status"] = body.status
    await db.panter_admin_requests.update_one({"id": request_id}, {"$set": update})
    updated = await db.panter_admin_requests.find_one({"id": request_id}, {"_id": 0})
    return public_panter_admin_request(updated)


@api.get("/panter/admin/cvs")
async def list_panter_cvs(search: Optional[str] = None, status_filter: Optional[str] = Query(default=None, alias="status"), u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    q: dict = {}
    if status_filter:
        q["status"] = status_filter
    if search:
        q["$or"] = [
            {"candidate_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    return await db.panter_cvs.find(q, {"_id": 0, "data_uri": 0}).sort("created_at", -1).to_list(500)


@api.post("/panter/admin/cvs")
async def upload_panter_cv(body: PanterCvIn, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    doc = {
        "id": str(uuid.uuid4()),
        "candidate_name": body.candidate_name.strip(),
        "email": str(body.email) if body.email else None,
        "phone": body.phone,
        "file_name": body.file_name,
        "mime_type": body.mime_type,
        "data_uri": body.data_uri,
        "ai_score": min(100, max(0, 40 + (10 if body.email else 0) + (10 if body.phone else 0) + min(40, len(body.data_uri) // 4000))),
        "status": "New",
        "notes": body.notes,
        "created_by": u.get("id"),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.panter_cvs.insert_one(doc.copy())
    return {k: v for k, v in doc.items() if k != "data_uri"}


@api.get("/panter/admin/cvs/{cv_id}")
async def get_panter_cv(cv_id: str, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    doc = await db.panter_cvs.find_one({"id": cv_id}, {"_id": 0, "data_uri": 0})
    if not doc:
        raise HTTPException(404, "CV not found")
    return doc


@api.get("/panter/admin/cvs/{cv_id}/download")
async def download_panter_cv(cv_id: str, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    doc = await db.panter_cvs.find_one({"id": cv_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "CV not found")
    return Response(
        panter_file_bytes(doc.get("data_uri") or ""),
        media_type=doc.get("mime_type") or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc.get("file_name") or "cv"}"'},
    )


@api.patch("/panter/admin/cvs/{cv_id}")
async def update_panter_cv(cv_id: str, body: PanterCvUpdateIn, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    update["updated_at"] = now_iso()
    res = await db.panter_cvs.update_one({"id": cv_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "CV not found")
    return await db.panter_cvs.find_one({"id": cv_id}, {"_id": 0, "data_uri": 0})


@api.post("/panter/admin/cvs/{cv_id}/interview")
async def interview_panter_cv(cv_id: str, body: PanterCvUpdateIn, u: dict = Depends(get_current_user)):
    body.status = "Interview"
    return await update_panter_cv(cv_id, body, u)


@api.post("/panter/admin/cvs/{cv_id}/reject")
async def reject_panter_cv(cv_id: str, body: PanterCvUpdateIn, u: dict = Depends(get_current_user)):
    body.status = "Rejected"
    return await update_panter_cv(cv_id, body, u)


@api.post("/panter/admin/cvs/{cv_id}/hire")
async def hire_panter_cv(cv_id: str, body: PanterCvUpdateIn, u: dict = Depends(get_current_user)):
    body.status = "Hired"
    return await update_panter_cv(cv_id, body, u)


@api.get("/panter/admin/appointments")
async def list_panter_appointments(
    date: Optional[str] = None,
    search: Optional[str] = None,
    event_type: Optional[str] = None,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    priority: Optional[str] = None,
    assigned_employee_id: Optional[str] = None,
    u: dict = Depends(get_current_user),
):
    require_panter_admin(u)
    q: dict = {}
    if date:
        q["date"] = date
    if event_type:
        q["event_type"] = event_type
    if status_filter:
        q["status"] = status_filter
    if priority:
        q["priority"] = priority
    if assigned_employee_id:
        q["assigned_employee_id"] = assigned_employee_id
    if search:
        q["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"customer": {"$regex": search, "$options": "i"}},
            {"project": {"$regex": search, "$options": "i"}},
            {"address": {"$regex": search, "$options": "i"}},
        ]
    return await db.panter_operations_calendar.find(q, {"_id": 0}).sort([("date", 1), ("start_time", 1)]).to_list(1000)


@api.post("/panter/admin/appointments")
async def create_panter_appointment(body: PanterAppointmentIn, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    payload = body.model_dump()
    if payload.get("assigned_employee_id") and not payload.get("assigned_employee_name"):
        employee = await db.users.find_one({"id": payload["assigned_employee_id"]}, {"_id": 0})
        payload["assigned_employee_name"] = (employee or {}).get("name")
    doc = {**payload, "id": str(uuid.uuid4()), "source": "admin-dashboard", "created_by": u.get("id"), "created_at": now_iso(), "updated_at": now_iso()}
    await db.panter_operations_calendar.insert_one(doc.copy())
    return doc


@api.post("/panter/operation-events")
async def create_panter_ai_operation_event(body: PanterAppointmentIn):
    payload = body.model_dump()
    doc = await create_panter_operation_event(payload, body.event_type, "panter-ai")
    return doc


@api.patch("/panter/admin/appointments/{appointment_id}")
async def update_panter_appointment(appointment_id: str, body: Dict[str, Any], u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    if body.get("assigned_employee_id") and not body.get("assigned_employee_name"):
        employee = await db.users.find_one({"id": body["assigned_employee_id"]}, {"_id": 0})
        body["assigned_employee_name"] = (employee or {}).get("name")
    body["updated_at"] = now_iso()
    res = await db.panter_operations_calendar.update_one({"id": appointment_id}, {"$set": body})
    if res.matched_count == 0:
        raise HTTPException(404, "Appointment not found")
    return await db.panter_operations_calendar.find_one({"id": appointment_id}, {"_id": 0})


@api.delete("/panter/admin/appointments/{appointment_id}")
async def delete_panter_appointment(appointment_id: str, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    res = await db.panter_operations_calendar.delete_one({"id": appointment_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Appointment not found")
    return {"ok": True}


# --- AI powered security shift planning ---
def require_shift_planning_admin(u: dict) -> None:
    # Existing roles: system_admin is administrator, hotel_manager is used as operations manager.
    require_roles(u, "system_admin", "hotel_manager")


def parse_hhmm(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    if not re.match(r"^\d{2}:\d{2}$", value):
        raise HTTPException(400, f"Invalid time format: {value}")
    hours, minutes = [int(part) for part in value.split(":")]
    if hours > 23 or minutes > 59:
        raise HTTPException(400, f"Invalid time value: {value}")
    return hours * 60 + minutes


def project_personnel_total(requirements: PanterProjectPersonnelRequirementsIn) -> int:
    return (
        requirements.required_armed_security_guards
        + requirements.required_unarmed_security_guards
        + requirements.required_shift_supervisors
        + requirements.required_reception_personnel
        + requirements.required_mobile_patrol_personnel
    )


def validate_panter_project(body: PanterProjectIn) -> List[str]:
    warnings: List[str] = []
    if not body.project_name.strip():
        raise HTTPException(400, "Project name is required")
    if not body.customer_company_name.strip():
        raise HTTPException(400, "Customer / company name is required")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", body.project_start_date):
        raise HTTPException(400, "Project start date must be YYYY-MM-DD")
    if body.project_end_date and not re.match(r"^\d{4}-\d{2}-\d{2}$", body.project_end_date):
        raise HTTPException(400, "Project end date must be YYYY-MM-DD")

    req = body.personnel_requirements
    configured_total = project_personnel_total(req)
    if req.required_armed_security_guards > req.total_required_personnel:
        raise HTTPException(400, "Required armed personnel exceeds total personnel")
    if configured_total > req.total_required_personnel:
        raise HTTPException(400, "Armed + unarmed + other personnel cannot exceed total personnel")

    post_total = sum(max(0, post.required_personnel) for post in body.security_posts)
    armed_post_total = sum(
        max(0, post.required_personnel)
        for post in body.security_posts
        if post.armed_required or post.armed_requirement in ["Armed", "Both"]
    )
    if req.total_required_personnel < post_total:
        warnings.append("Total required personnel is lower than total personnel assigned to posts.")
    if post_total > req.total_required_personnel:
        warnings.append("Required personnel for posts exceeds available personnel.")
    if armed_post_total > req.required_armed_security_guards:
        warnings.append("Armed posts require more armed guards than configured.")

    shift = body.shift_configuration
    if shift.number_of_shifts < 1:
        raise HTTPException(400, "Number of shifts must be at least 1")
    shift_pairs = [
        (shift.morning_shift_start, shift.morning_shift_end, "Morning"),
        (shift.evening_shift_start, shift.evening_shift_end, "Evening"),
        (shift.night_shift_start, shift.night_shift_end, "Night"),
    ][: shift.number_of_shifts]
    for start, end, name in shift_pairs:
        if not start or not end:
            warnings.append(f"{name} shift start and end should be configured.")
            continue
        parse_hhmm(start)
        parse_hhmm(end)
    if shift.shift_duration == "Custom Shift" and not shift.custom_shift_hours:
        warnings.append("Custom shift duration is selected but custom hours are empty.")

    if req.total_required_personnel > 0 and post_total < max(1, req.total_required_personnel * 0.5):
        warnings.append("Panter AI recommends defining more security posts so responsibilities are clearer.")
    if req.required_shift_supervisors == 0 and req.total_required_personnel >= 8:
        warnings.append("Panter AI recommends at least one shift supervisor for larger projects.")
    return warnings


def generate_project_code(project_name: str) -> str:
    prefix = "".join(ch for ch in project_name.upper() if ch.isalnum())[:4] or "PRJ"
    return f"{prefix}-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(uuid.uuid4())[:4].upper()}"


def panter_project_ai_recommendations(doc: Dict[str, Any], warnings: List[str]) -> List[Dict[str, str]]:
    req = doc.get("personnel_requirements") or {}
    posts = doc.get("security_posts") or []
    recommendations: List[Dict[str, str]] = []
    if not posts:
        recommendations.append({
            "title": "Güvenlik noktaları önerisi",
            "description": "Panter AI giriş kapısı, resepsiyon, devriye rotası ve kontrol odası gibi temel postların tanımlanmasını önerir.",
            "reason": "Post bazlı planlama ileride vardiya oluştururken görev dağılımını daha net ve denetlenebilir yapar.",
        })
    if req.get("total_required_personnel", 0) >= 8 and req.get("required_shift_supervisors", 0) == 0:
        recommendations.append({
            "title": "Vardiya amiri ekleyin",
            "description": "Toplam personel yüksek olduğu için her vardiya için en az bir vardiya amiri planlanabilir.",
            "reason": "Operasyon yönetimi, raporlama ve acil durum koordinasyonu için sorumlu kişi gerekir.",
        })
    if req.get("required_mobile_patrol_personnel", 0) == 0 and len(posts) >= 4:
        recommendations.append({
            "title": "Mobil devriye değerlendirin",
            "description": "Çoklu post yapısında mobil devriye personeli eklemek kör noktaları azaltabilir.",
            "reason": "Sabit postlar alanı tutarken mobil devriye çevre ve ara bölgeleri kontrol eder.",
        })
    for warning in warnings:
        recommendations.append({
            "title": "Validasyon uyarısı",
            "description": warning,
            "reason": "Bu uyarı proje ileride AI vardiya planlayıcıya gönderildiğinde personel eksikliği veya kural ihlali oluşmaması için gösterilir.",
        })
    return recommendations


def public_panter_project(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in doc.items() if k != "_id"}


def time_ranges_overlap(start_a: str, end_a: str, start_b: str, end_b: str) -> bool:
    a_start = parse_hhmm(start_a)
    a_end = parse_hhmm(end_a)
    b_start = parse_hhmm(start_b)
    b_end = parse_hhmm(end_b)
    if a_start is None or a_end is None or b_start is None or b_end is None:
        return False
    if a_end <= a_start:
        a_end += 24 * 60
    if b_end <= b_start:
        b_end += 24 * 60
    return max(a_start, b_start) < min(a_end, b_end)


def support_request_time_hours(request_doc: Dict[str, Any]) -> float:
    start = parse_hhmm(request_doc.get("start_time"))
    end = parse_hhmm(request_doc.get("end_time"))
    if start is None or end is None:
        return 0
    if end <= start:
        end += 24 * 60
    return round((end - start) / 60, 2)


def validate_support_payload(payload: Dict[str, Any]) -> None:
    if not payload.get("destination_project_id"):
        raise HTTPException(400, "Destination project is required")
    if int(payload.get("required_personnel") or 0) < 1:
        raise HTTPException(400, "Required personnel must be at least 1")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(payload.get("date") or "")):
        raise HTTPException(400, "Support date must be YYYY-MM-DD")
    parse_hhmm(payload.get("start_time"))
    parse_hhmm(payload.get("end_time"))
    if not str(payload.get("reason") or "").strip():
        raise HTTPException(400, "Reason for request is required")


async def employee_current_project(employee: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    assigned_projects = employee.get("assigned_projects") or []
    project_ids = [item for item in assigned_projects if isinstance(item, str)]
    if project_ids:
        project = await db.panter_projects.find_one({"id": {"$in": project_ids}, "project_status": "Active"}, {"_id": 0})
        if project:
            return project
    plan = await db.panter_shift_plans.find({
        "status": {"$in": ["Draft", "Approved"]},
        "input.employees.name": employee.get("name"),
    }, {"_id": 0}).sort("created_at", -1).to_list(1)
    if plan:
        project_name = plan[0].get("project")
        project = await db.panter_projects.find_one({"project_name": project_name, "project_status": "Active"}, {"_id": 0})
        if project:
            return project
        return {"id": plan[0].get("id"), "project_name": project_name, "project_code": plan[0].get("project"), "personnel_requirements": {"total_required_personnel": 0}}
    return None


async def employee_has_support_conflict(employee_id: str, date: str, start_time: str, end_time: str) -> bool:
    existing = await db.panter_support_assignments.find({
        "employee_id": employee_id,
        "date": date,
        "status": {"$nin": ["Rejected", "Cancelled"]},
    }, {"_id": 0}).to_list(100)
    return any(time_ranges_overlap(start_time, end_time, item.get("start_time") or "", item.get("end_time") or "") for item in existing)


async def analyze_support_request(request_doc: Dict[str, Any]) -> Dict[str, Any]:
    destination = await db.panter_projects.find_one({"id": request_doc["destination_project_id"]}, {"_id": 0})
    if not destination:
        raise HTTPException(404, "Destination project not found")
    employees = await db.users.find({"role": "staff", "active": {"$ne": False}}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(500)
    required_position = (request_doc.get("required_position") or "").lower()
    armed_requirement = request_doc.get("armed_requirement") or "Any"
    needed = int(request_doc.get("required_personnel") or 1)
    request_hours = support_request_time_hours(request_doc)
    destination_id = request_doc["destination_project_id"]
    recommendations: List[Dict[str, Any]] = []
    rejected: List[Dict[str, Any]] = []
    blocking_warnings: List[str] = []

    for employee in employees:
        reasons: List[str] = []
        blocks: List[str] = []
        employee_id = employee.get("id")
        current_project = await employee_current_project(employee)
        current_project_id = (current_project or {}).get("id")
        if current_project_id == destination_id:
            blocks.append("Employee already belongs to the destination project.")
        if armed_requirement == "Armed" and not employee.get("armed", False):
            blocks.append("Employee does not match the armed requirement.")
        if required_position and required_position not in str(employee.get("position") or employee.get("department") or "").lower():
            blocks.append("Employee position does not match the required position.")
        leave_days = set(employee.get("leave_days") or [])
        if request_doc["date"] in leave_days:
            blocks.append("Employee is on leave for the selected date.")
        if employee_id and await employee_has_support_conflict(employee_id, request_doc["date"], request_doc["start_time"], request_doc["end_time"]):
            blocks.append("Employee already has a support assignment conflict.")

        source_project_name = (current_project or {}).get("project_name") or "Atanmamış"
        source_total = ((current_project or {}).get("personnel_requirements") or {}).get("total_required_personnel", 0)
        source_posts = sum((post.get("required_personnel") or 0) for post in ((current_project or {}).get("security_posts") or []))
        if current_project and source_total and source_total <= source_posts:
            blocks.append("Transferring this employee may leave the original project understaffed.")

        max_hours = float(employee.get("maximum_working_hours") or 45)
        weekly_hours = float(employee.get("weekly_working_hours") or 0)
        overtime_impact = max(0.0, weekly_hours + request_hours - max_hours)
        if overtime_impact > 0 and ((destination.get("company_policies") or {}).get("overtime_requires_approval") is True):
            reasons.append("Overtime may require manager approval under configured company policy.")

        if not blocks:
            qualifications = employee.get("certificates") or employee.get("skills") or []
            reasons.append("Employee is active, available, and matches the requested support profile.")
            if current_project:
                reasons.append("Original project impact is acceptable based on configured project requirements.")
            recommendations.append({
                "employee_id": employee_id,
                "employee_name": employee.get("name"),
                "current_project_id": current_project_id,
                "current_project": source_project_name,
                "position": employee.get("position") or employee.get("department") or "-",
                "qualification": ", ".join(qualifications) if qualifications else "-",
                "reason_for_recommendation": " ".join(reasons),
                "expected_overtime_impact": overtime_impact,
                "staffing_impact_on_original_project": "No understaffing detected." if current_project else "No active source project detected.",
                "selected_explanation": "Selected because the employee passes availability, qualification, armed/unarmed, conflict, rest and source staffing checks.",
            })
        else:
            rejected.append({"employee_id": employee_id, "employee_name": employee.get("name"), "reasons": blocks})

    if len(recommendations) < needed:
        blocking_warnings.append("Not enough eligible employees were found for this support request.")
    return {
        "destination_project": destination,
        "recommendations": recommendations[: max(needed * 3, 10)],
        "rejected_candidates": rejected[:50],
        "blocking_warnings": blocking_warnings,
        "analysis_summary": {
            "active_projects_checked": await db.panter_projects.count_documents({"project_status": "Active"}),
            "employees_checked": len(employees),
            "eligible_employees": len(recommendations),
            "required_personnel": needed,
        },
    }


async def audit_support_request(request_id: str, action: str, actor: dict, changes: Optional[Dict[str, Any]] = None) -> None:
    await db.panter_support_audit.insert_one({
        "id": str(uuid.uuid4()),
        "request_id": request_id,
        "action": action,
        "actor_id": actor.get("id"),
        "actor_name": actor.get("name"),
        "actor_role": role_of(actor),
        "changes": changes or {},
        "created_at": now_iso(),
    })


def parse_shift_date_range(date_range: Dict[str, str]) -> List[str]:
    start_raw = date_range.get("start") or date_range.get("from")
    end_raw = date_range.get("end") or date_range.get("to") or start_raw
    if not start_raw:
        raise HTTPException(400, "Date range start is required")
    try:
        start = datetime.strptime(start_raw, "%Y-%m-%d").date()
        end = datetime.strptime(end_raw, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(400, "Date range must use YYYY-MM-DD")
    if end < start:
        raise HTTPException(400, "Date range end cannot be before start")
    if (end - start).days > 62:
        raise HTTPException(400, "Shift planning range cannot exceed 62 days")
    return [(start + timedelta(days=offset)).isoformat() for offset in range((end - start).days + 1)]


def shift_hours(shift: Dict[str, Any]) -> float:
    start = str(shift.get("start") or shift.get("start_time") or "00:00")
    end = str(shift.get("end") or shift.get("end_time") or "00:00")
    try:
        start_dt = datetime.strptime(start, "%H:%M")
        end_dt = datetime.strptime(end, "%H:%M")
        hours = (end_dt - start_dt).total_seconds() / 3600
        return hours if hours > 0 else hours + 24
    except Exception:
        return float(shift.get("hours") or 8)


def employee_is_qualified(employee: Dict[str, Any], body: PanterShiftPlanIn, armed_needed: bool) -> tuple[bool, List[str]]:
    reasons = []
    employee_certs = set(employee.get("certificates") or [])
    employee_skills = set(employee.get("skills") or [])
    employee_projects = set(employee.get("assigned_projects") or [])
    for cert in body.required_certificates:
        if cert not in employee_certs:
            reasons.append(f"missing_certificate:{cert}")
    for role in body.required_roles:
        if role and role not in employee_skills and role != employee.get("position"):
            reasons.append(f"missing_role:{role}")
    if armed_needed and not employee.get("armed"):
        reasons.append("armed_required")
    if employee_projects and body.project not in employee_projects:
        reasons.append("project_not_assigned")
    return not reasons, reasons


def build_shift_option(body: PanterShiftPlanIn, option_name: str, weights: Dict[str, float]) -> Dict[str, Any]:
    days = parse_shift_date_range(body.date_range)
    employees = [e.model_dump() for e in body.employees]
    weekly_hours = {employee["name"]: float(employee.get("weekly_working_hours") or 0) for employee in employees}
    total_hours = {employee["name"]: 0.0 for employee in employees}
    assigned_today: Dict[str, set] = {day: set() for day in days}
    schedule: List[Dict[str, Any]] = []
    violations: List[str] = []
    staffing_problems: List[str] = []
    warnings: List[str] = []
    total_labor_cost = 0.0
    total_overtime_cost = 0.0
    required_total = 0
    assigned_total = 0
    min_rest_hours = float(body.labor_rules.get("minimum_rest_hours") or 8)
    last_assignment_end: Dict[str, datetime] = {}

    for day in days:
        for shift_index, shift in enumerate(body.shift_times):
            required = int(shift.get("required_number_of_employees") or body.required_number_of_employees)
            armed_required = int(shift.get("required_armed_guards") or body.required_armed_guards)
            unarmed_required = int(shift.get("required_unarmed_guards") or body.required_unarmed_guards)
            if armed_required + unarmed_required > required:
                required = armed_required + unarmed_required
            required_total += required
            hours = shift_hours(shift)
            shift_start = str(shift.get("start") or shift.get("start_time") or body.working_hours or "00:00").split("-")[0].strip()
            shift_end = str(shift.get("end") or shift.get("end_time") or "00:00")
            try:
                start_dt = datetime.strptime(f"{day} {shift_start}", "%Y-%m-%d %H:%M")
                end_dt = datetime.strptime(f"{day} {shift_end}", "%Y-%m-%d %H:%M")
                if end_dt <= start_dt:
                    end_dt += timedelta(days=1)
            except Exception:
                start_dt = datetime.strptime(f"{day} 00:00", "%Y-%m-%d %H:%M")
                end_dt = start_dt + timedelta(hours=hours)
            assignments: List[Dict[str, Any]] = []

            def select_one(armed_needed: bool) -> Optional[Dict[str, Any]]:
                candidates = []
                for employee in employees:
                    name = employee["name"]
                    qualified, reasons = employee_is_qualified(employee, body, armed_needed)
                    if not qualified:
                        warnings.extend([f"{name}: {reason}" for reason in reasons])
                        continue
                    if day in (employee.get("leave_days") or []):
                        warnings.append(f"{name}: leave conflict on {day}")
                        continue
                    availability = employee.get("availability") or []
                    if availability and day not in availability:
                        warnings.append(f"{name}: unavailable on {day}")
                        continue
                    if name in assigned_today[day]:
                        warnings.append(f"{name}: double shift avoided on {day}")
                        continue
                    previous_end = last_assignment_end.get(name)
                    if previous_end and (start_dt - previous_end).total_seconds() / 3600 < min_rest_hours:
                        warnings.append(f"{name}: minimum rest conflict on {day}")
                        continue
                    max_hours = float(employee.get("maximum_working_hours") or 45)
                    projected_week = weekly_hours[name] + hours
                    overtime_hours = max(0.0, projected_week - max_hours)
                    salary = float(employee.get("salary") or 0)
                    overtime_cost = float(employee.get("overtime_cost") or salary * 1.5)
                    preferred_penalty = 0 if not employee.get("preferred_shift") or employee.get("preferred_shift") == shift.get("name") else 1
                    score = (
                        weights["cost"] * (salary * hours + overtime_cost * overtime_hours)
                        + weights["overtime"] * overtime_hours
                        + weights["balance"] * total_hours[name]
                        + preferred_penalty
                    )
                    candidates.append((score, employee, overtime_hours, salary, overtime_cost))
                candidates.sort(key=lambda item: item[0])
                return candidates[0] if candidates else None

            for armed_slot in range(armed_required):
                choice = select_one(True)
                if not choice:
                    violations.append(f"{day} {shift.get('name') or shift_index}: missing armed guard")
                    staffing_problems.append(f"Missing armed guard for {day} {shift.get('name') or shift_index}")
                    continue
                _, employee, overtime_hours, salary, overtime_cost = choice
                name = employee["name"]
                assigned_today[day].add(name)
                weekly_hours[name] += hours
                total_hours[name] += hours
                last_assignment_end[name] = end_dt
                total_labor_cost += salary * hours
                total_overtime_cost += overtime_cost * overtime_hours
                assignments.append({"employee_id": employee.get("id"), "name": name, "armed": True, "hours": hours, "overtime_hours": overtime_hours, "role": employee.get("position")})

            for slot in range(max(0, required - len(assignments))):
                choice = select_one(False)
                if not choice:
                    violations.append(f"{day} {shift.get('name') or shift_index}: insufficient staffing")
                    staffing_problems.append(f"Missing employee for {day} {shift.get('name') or shift_index}")
                    continue
                _, employee, overtime_hours, salary, overtime_cost = choice
                name = employee["name"]
                assigned_today[day].add(name)
                weekly_hours[name] += hours
                total_hours[name] += hours
                last_assignment_end[name] = end_dt
                total_labor_cost += salary * hours
                total_overtime_cost += overtime_cost * overtime_hours
                assignments.append({"employee_id": employee.get("id"), "name": name, "armed": bool(employee.get("armed")), "hours": hours, "overtime_hours": overtime_hours, "role": employee.get("position")})

            assigned_total += len(assignments)
            schedule.append({
                "date": day,
                "shift": shift.get("name") or f"Shift {shift_index + 1}",
                "start_time": shift_start,
                "end_time": shift_end,
                "required": required,
                "assignments": assignments,
            })

    total_working_hours = sum(total_hours.values())
    overtime_hours = sum(max(0.0, weekly_hours[name] - float(next((e.get("maximum_working_hours") or 45 for e in employees if e["name"] == name), 45))) for name in weekly_hours)
    coverage = round((assigned_total / required_total) * 100, 2) if required_total else 100
    balance_values = list(total_hours.values()) or [0]
    workload_spread = max(balance_values) - min(balance_values)
    optimization_score = max(0, round(100 - len(violations) * 10 - overtime_hours * 1.5 - workload_spread * 0.5 - max(0, 100 - coverage), 2))
    employee_schedule = [{"employee": name, "total_hours": hours, "assignments": [row for row in schedule if any(a["name"] == name for a in row["assignments"])]} for name, hours in total_hours.items()]
    project_schedule = {"project": body.project, "shifts": schedule}
    return {
        "name": option_name,
        "reason": {
            "Option A": "Generated with lowest labor cost as the strongest optimization weight.",
            "Option B": "Generated with overtime minimization as the strongest optimization weight.",
            "Option C": "Generated with balanced workload distribution as the strongest optimization weight.",
        }[option_name],
        "weekly_schedule": schedule[:7 * max(1, len(body.shift_times))],
        "monthly_schedule": schedule,
        "employee_schedule": employee_schedule,
        "project_schedule": project_schedule,
        "daily_shift_assignment": schedule,
        "analysis": {
            "total_employees": len(employees),
            "total_working_hours": round(total_working_hours, 2),
            "overtime_hours": round(overtime_hours, 2),
            "estimated_labor_cost": round(total_labor_cost, 2),
            "estimated_overtime_cost": round(total_overtime_cost, 2),
            "coverage_percentage": coverage,
            "rule_violations": sorted(set(violations)),
            "staffing_problems": sorted(set(staffing_problems)),
            "optimization_score": optimization_score,
            "warnings": sorted(set(warnings))[:100],
        },
    }


async def audit_shift_plan(plan_id: str, action: str, actor: dict, changes: Optional[Dict[str, Any]] = None) -> None:
    await db.panter_shift_plan_audit.insert_one({
        "id": str(uuid.uuid4()),
        "plan_id": plan_id,
        "action": action,
        "actor_id": actor.get("id"),
        "actor_name": actor.get("name"),
        "actor_role": role_of(actor),
        "changes": changes or {},
        "created_at": now_iso(),
    })


@api.get("/panter/admin/projects")
async def list_panter_projects(
    search: Optional[str] = None,
    status: Optional[PanterProjectStatus] = None,
    u: dict = Depends(get_current_user),
):
    require_shift_planning_admin(u)
    q: Dict[str, Any] = {}
    if status:
        q["project_status"] = status
    if search:
        q["$or"] = [
            {"project_name": {"$regex": search, "$options": "i"}},
            {"customer_company_name": {"$regex": search, "$options": "i"}},
            {"project_code": {"$regex": search, "$options": "i"}},
        ]
    docs = await db.panter_projects.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api.get("/panter/admin/projects/{project_id}")
async def get_panter_project(project_id: str, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    doc = await db.panter_projects.find_one({"id": project_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Project not found")
    return doc


@api.post("/panter/admin/projects")
async def create_panter_project(body: PanterProjectIn, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    warnings = validate_panter_project(body)
    payload = body.model_dump()
    payload["project_code"] = (payload.get("project_code") or generate_project_code(body.project_name)).strip()
    payload["security_posts"] = [
        {**post, "id": post.get("id") or str(uuid.uuid4()), "armed_required": post.get("armed_requirement") in ["Armed", "Both"] or post.get("armed_required", False)}
        for post in payload.get("security_posts", [])
    ]
    payload["employees"] = [
        {**employee, "id": employee.get("id") or str(uuid.uuid4())}
        for employee in payload.get("employees", [])
    ]
    doc = {
        **payload,
        "id": str(uuid.uuid4()),
        "validation_warnings": warnings,
        "ai_recommendations": [],
        "created_by": u.get("id"),
        "updated_by": u.get("id"),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    doc["ai_recommendations"] = panter_project_ai_recommendations(doc, warnings)
    await db.panter_projects.insert_one(doc.copy())
    return public_panter_project(doc)


@api.patch("/panter/admin/projects/{project_id}")
async def update_panter_project(project_id: str, body: PanterProjectUpdateIn, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    existing = await db.panter_projects.find_one({"id": project_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Project not found")
    merged = {**existing, **body.model_dump(exclude_unset=True)}
    validation_body = PanterProjectIn(**{
        "project_name": merged["project_name"],
        "customer_company_name": merged["customer_company_name"],
        "project_code": merged.get("project_code"),
        "project_start_date": merged["project_start_date"],
        "project_end_date": merged.get("project_end_date"),
        "project_status": merged.get("project_status", "Active"),
        "personnel_requirements": merged["personnel_requirements"],
        "shift_configuration": merged["shift_configuration"],
        "security_posts": merged.get("security_posts") or [],
        "employees": merged.get("employees") or [],
        "labor_rules": merged.get("labor_rules") or {},
        "company_policies": merged.get("company_policies") or {},
    })
    warnings = validate_panter_project(validation_body)
    update = body.model_dump(exclude_unset=True)
    if "security_posts" in update and update["security_posts"] is not None:
        update["security_posts"] = [
            {**post, "id": post.get("id") or str(uuid.uuid4()), "armed_required": post.get("armed_requirement") in ["Armed", "Both"] or post.get("armed_required", False)}
            for post in update["security_posts"]
        ]
    if "employees" in update and update["employees"] is not None:
        update["employees"] = [
            {**employee, "id": employee.get("id") or str(uuid.uuid4())}
            for employee in update["employees"]
        ]
    preview = {**merged, **update, "validation_warnings": warnings}
    update["validation_warnings"] = warnings
    update["ai_recommendations"] = panter_project_ai_recommendations(preview, warnings)
    update["updated_by"] = u.get("id")
    update["updated_at"] = now_iso()
    await db.panter_projects.update_one({"id": project_id}, {"$set": update})
    return await db.panter_projects.find_one({"id": project_id}, {"_id": 0})


@api.delete("/panter/admin/projects/{project_id}")
async def delete_panter_project(project_id: str, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    res = await db.panter_projects.delete_one({"id": project_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Project not found")
    return {"ok": True}


@api.post("/panter/admin/projects/assist")
async def assist_panter_project(body: PanterProjectIn, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    warnings = validate_panter_project(body)
    doc = body.model_dump()
    doc["project_code"] = doc.get("project_code") or generate_project_code(body.project_name)
    return {
        "validation_warnings": warnings,
        "ai_recommendations": panter_project_ai_recommendations(doc, warnings),
        "suggested_posts": [
            "Ana Giriş Güvenlik Noktası",
            "Resepsiyon Karşılama Noktası",
            "Mobil Devriye Rotası",
            "Kontrol Odası",
            "Araç Giriş Kontrol Noktası",
        ],
    }


@api.get("/panter/admin/support-requests")
async def list_panter_support_requests(
    status: Optional[PanterSupportStatus] = None,
    destination_project_id: Optional[str] = None,
    u: dict = Depends(get_current_user),
):
    require_shift_planning_admin(u)
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    if destination_project_id:
        q["destination_project_id"] = destination_project_id
    return await db.panter_support_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/panter/admin/support-requests")
async def create_panter_support_request(body: PanterSupportRequestIn, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    payload = body.model_dump()
    validate_support_payload(payload)
    destination = await db.panter_projects.find_one({"id": payload["destination_project_id"]}, {"_id": 0})
    if not destination:
        raise HTTPException(404, "Destination project not found")
    doc = {
        **payload,
        "id": str(uuid.uuid4()),
        "destination_project_name": destination.get("project_name"),
        "status": "Pending",
        "analysis": {},
        "created_by": u.get("id"),
        "requested_by": u.get("id"),
        "requested_by_name": u.get("name"),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    doc["analysis"] = await analyze_support_request(doc)
    await db.panter_support_requests.insert_one(doc.copy())
    await audit_support_request(doc["id"], "created", u, {"destination_project": destination.get("project_name"), "reason": doc.get("reason")})
    return public_panter_project(doc)


@api.patch("/panter/admin/support-requests/{request_id}")
async def update_panter_support_request(request_id: str, body: PanterSupportRequestUpdateIn, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    existing = await db.panter_support_requests.find_one({"id": request_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Support request not found")
    update = body.model_dump(exclude_unset=True)
    merged = {**existing, **update}
    validate_support_payload(merged)
    if update.get("destination_project_id"):
        destination = await db.panter_projects.find_one({"id": update["destination_project_id"]}, {"_id": 0})
        if not destination:
            raise HTTPException(404, "Destination project not found")
        update["destination_project_name"] = destination.get("project_name")
    merged = {**existing, **update}
    update["analysis"] = await analyze_support_request(merged)
    update["updated_by"] = u.get("id")
    update["updated_at"] = now_iso()
    await db.panter_support_requests.update_one({"id": request_id}, {"$set": update})
    await audit_support_request(request_id, "updated", u, update)
    return await db.panter_support_requests.find_one({"id": request_id}, {"_id": 0})


@api.post("/panter/admin/support-requests/{request_id}/analyze")
async def analyze_panter_support_request_endpoint(request_id: str, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    request_doc = await db.panter_support_requests.find_one({"id": request_id}, {"_id": 0})
    if not request_doc:
        raise HTTPException(404, "Support request not found")
    analysis = await analyze_support_request(request_doc)
    await db.panter_support_requests.update_one({"id": request_id}, {"$set": {"analysis": analysis, "updated_at": now_iso()}})
    await audit_support_request(request_id, "analyzed", u, {"eligible_employees": analysis["analysis_summary"]["eligible_employees"]})
    return analysis


@api.post("/panter/admin/support-requests/{request_id}/approve")
async def approve_panter_support_request(request_id: str, body: PanterSupportApprovalIn, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    request_doc = await db.panter_support_requests.find_one({"id": request_id}, {"_id": 0})
    if not request_doc:
        raise HTTPException(404, "Support request not found")
    if not body.employee_ids:
        raise HTTPException(400, "At least one employee must be selected")
    analysis = await analyze_support_request(request_doc)
    if analysis.get("blocking_warnings"):
        raise HTTPException(400, "; ".join(analysis["blocking_warnings"]))
    eligible = {item["employee_id"]: item for item in analysis.get("recommendations", [])}
    if len(body.employee_ids) > int(request_doc.get("required_personnel") or 1):
        raise HTTPException(400, "Selected employee count exceeds required personnel")
    for employee_id in body.employee_ids:
        if employee_id not in eligible:
            raise HTTPException(400, "Selected employee is not eligible for transfer")

    assignments = []
    for employee_id in body.employee_ids:
        recommendation = eligible[employee_id]
        assignment = {
            "id": str(uuid.uuid4()),
            "request_id": request_id,
            "employee_id": employee_id,
            "employee_name": recommendation.get("employee_name"),
            "source_project_id": recommendation.get("current_project_id"),
            "source_project": recommendation.get("current_project"),
            "destination_project_id": request_doc.get("destination_project_id"),
            "destination_project": request_doc.get("destination_project_name"),
            "date": request_doc.get("date"),
            "start_time": request_doc.get("start_time"),
            "end_time": request_doc.get("end_time"),
            "reason": request_doc.get("reason"),
            "status": "Approved",
            "approved_by": u.get("id"),
            "approved_by_name": u.get("name"),
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        assignments.append(assignment)
        await db.panter_support_assignments.insert_one(assignment.copy())
        await db.users.update_one({"id": employee_id}, {"$addToSet": {"assigned_projects": request_doc.get("destination_project_id")}})
        await db.panter_shift_plans.update_many(
            {"project": {"$in": [recommendation.get("current_project"), request_doc.get("destination_project_name")]}},
            {"$push": {"support_transfer_adjustments": assignment}, "$set": {"updated_at": now_iso()}},
        )

    update = {
        "status": "Approved",
        "approved_by": u.get("id"),
        "approved_by_name": u.get("name"),
        "approved_at": now_iso(),
        "approved_employee_ids": body.employee_ids,
        "approval_notes": body.notes,
        "analysis": analysis,
        "updated_at": now_iso(),
    }
    await db.panter_support_requests.update_one({"id": request_id}, {"$set": update})
    await audit_support_request(request_id, "approved", u, {"employee_ids": body.employee_ids, "notes": body.notes})
    return await db.panter_support_requests.find_one({"id": request_id}, {"_id": 0})


@api.post("/panter/admin/support-requests/{request_id}/reject")
async def reject_panter_support_request(request_id: str, body: PanterSupportRejectIn, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    res = await db.panter_support_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "Rejected", "rejected_by": u.get("id"), "rejected_by_name": u.get("name"), "rejected_at": now_iso(), "rejection_notes": body.notes, "updated_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Support request not found")
    await audit_support_request(request_id, "rejected", u, {"notes": body.notes})
    return await db.panter_support_requests.find_one({"id": request_id}, {"_id": 0})


@api.get("/panter/admin/support-assignments")
async def list_panter_support_assignments(u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    return await db.panter_support_assignments.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.get("/panter/admin/support-requests/{request_id}/audit")
async def list_panter_support_audit(request_id: str, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    return await db.panter_support_audit.find({"request_id": request_id}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.get("/panter/admin/support-stats")
async def panter_support_stats(u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    requests = await db.panter_support_requests.find({}, {"_id": 0}).to_list(2000)
    assignments = await db.panter_support_assignments.find({}, {"_id": 0}).to_list(2000)
    project_counts: Dict[str, int] = {}
    employee_counts: Dict[str, int] = {}
    monthly_counts: Dict[str, int] = {}
    for item in requests:
        project = item.get("destination_project_name") or item.get("destination_project_id") or "-"
        project_counts[project] = project_counts.get(project, 0) + 1
        month = str(item.get("date") or item.get("created_at") or "")[:7] or "unknown"
        monthly_counts[month] = monthly_counts.get(month, 0) + 1
    for item in assignments:
        employee = item.get("employee_name") or item.get("employee_id") or "-"
        employee_counts[employee] = employee_counts.get(employee, 0) + 1
    return {
        "total_support_requests": len(requests),
        "total_support_assignments": len(assignments),
        "most_requested_projects": sorted(project_counts.items(), key=lambda row: row[1], reverse=True)[:10],
        "most_transferred_employees": sorted(employee_counts.items(), key=lambda row: row[1], reverse=True)[:10],
        "monthly_support_history": sorted(monthly_counts.items()),
    }


@api.post("/panter/admin/shift-plans/generate")
async def generate_panter_shift_plan(body: PanterShiftPlanIn, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    options = [
        build_shift_option(body, "Option A", {"cost": 1.0, "overtime": 0.6, "balance": 0.25}),
        build_shift_option(body, "Option B", {"cost": 0.5, "overtime": 1.2, "balance": 0.25}),
        build_shift_option(body, "Option C", {"cost": 0.5, "overtime": 0.6, "balance": 1.0}),
    ]
    recommended = max(options, key=lambda option: option["analysis"]["optimization_score"])
    doc = {
        "id": str(uuid.uuid4()),
        "project": body.project,
        "input": body.model_dump(),
        "options": options,
        "recommended_option": recommended["name"],
        "schedule": recommended,
        "status": "Draft",
        "created_by": u.get("id"),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.panter_shift_plans.insert_one(doc.copy())
    await audit_shift_plan(doc["id"], "generated", u, {"recommended_option": recommended["name"]})
    return doc


@api.get("/panter/admin/shift-plans")
async def list_panter_shift_plans(project: Optional[str] = None, status_filter: Optional[str] = Query(default=None, alias="status"), u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    q: dict = {}
    if project:
        q["project"] = {"$regex": project, "$options": "i"}
    if status_filter:
        q["status"] = status_filter
    return await db.panter_shift_plans.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.patch("/panter/admin/shift-plans/{plan_id}")
async def update_panter_shift_plan(plan_id: str, body: PanterShiftPlanUpdateIn, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    update["updated_at"] = now_iso()
    res = await db.panter_shift_plans.update_one({"id": plan_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Shift plan not found")
    await audit_shift_plan(plan_id, "updated", u, update)
    return await db.panter_shift_plans.find_one({"id": plan_id}, {"_id": 0})


@api.post("/panter/admin/shift-plans/{plan_id}/approve")
async def approve_panter_shift_plan(plan_id: str, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    res = await db.panter_shift_plans.update_one({"id": plan_id}, {"$set": {"status": "Approved", "approved_by": u.get("id"), "approved_at": now_iso(), "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Shift plan not found")
    await audit_shift_plan(plan_id, "approved", u)
    return await db.panter_shift_plans.find_one({"id": plan_id}, {"_id": 0})


@api.get("/panter/admin/shift-plans/{plan_id}/audit")
async def panter_shift_plan_audit(plan_id: str, u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    return await db.panter_shift_plan_audit.find({"plan_id": plan_id}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.get("/panter/admin/shift-plans/{plan_id}/export")
async def export_panter_shift_plan(plan_id: str, format: str = Query("excel"), u: dict = Depends(get_current_user)):
    require_shift_planning_admin(u)
    plan = await db.panter_shift_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Shift plan not found")
    rows = ["date,shift,start_time,end_time,employee,role,armed,hours,overtime_hours"]
    for shift in (plan.get("schedule") or {}).get("daily_shift_assignment") or []:
        for assignment in shift.get("assignments") or []:
            rows.append(",".join([
                str(shift.get("date") or ""),
                str(shift.get("shift") or ""),
                str(shift.get("start_time") or ""),
                str(shift.get("end_time") or ""),
                str(assignment.get("name") or ""),
                str(assignment.get("role") or ""),
                str(assignment.get("armed") or False),
                str(assignment.get("hours") or 0),
                str(assignment.get("overtime_hours") or 0),
            ]))
    if format == "pdf":
        summary = (plan.get("schedule") or {}).get("analysis") or {}
        lines = [
            f"Panter Shift Plan - {plan.get('project')}",
            f"Status: {plan.get('status')}",
            f"Recommended Option: {plan.get('recommended_option')}",
            f"Total Employees: {summary.get('total_employees', 0)}",
            f"Total Working Hours: {summary.get('total_working_hours', 0)}",
            f"Overtime Hours: {summary.get('overtime_hours', 0)}",
            f"Labor Cost: {summary.get('estimated_labor_cost', 0)}",
            f"Overtime Cost: {summary.get('estimated_overtime_cost', 0)}",
            f"Coverage: {summary.get('coverage_percentage', 0)}%",
            f"Optimization Score: {summary.get('optimization_score', 0)}",
        ]
        content = "\n".join([line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in lines])
        text_commands = "BT /F1 12 Tf 50 780 Td " + " T* ".join([f"({line})" for line in content.split("\n")]) + " ET"
        stream = text_commands.encode("latin-1", "replace")
        objects = [
            b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
            b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
            b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
            b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
            b"5 0 obj << /Length " + str(len(stream)).encode() + b" >> stream\n" + stream + b"\nendstream endobj",
        ]
        pdf = bytearray(b"%PDF-1.4\n")
        offsets = []
        for obj in objects:
            offsets.append(len(pdf))
            pdf.extend(obj + b"\n")
        xref_start = len(pdf)
        pdf.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
        for offset in offsets:
            pdf.extend(f"{offset:010d} 00000 n \n".encode())
        pdf.extend(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF".encode())
        return Response(bytes(pdf), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="shift-plan-{plan_id}.pdf"'})
    # Excel-friendly UTF-8 CSV with BOM (opens cleanly in Excel as .xls download name)
    csv_body = "\ufeff" + "\n".join(rows)
    return Response(
        csv_body.encode("utf-8"),
        media_type="application/vnd.ms-excel",
        headers={"Content-Disposition": f'attachment; filename="shift-plan-{plan_id}.xls"'},
    )


@api.get("/panter/admin/inspection-requests", response_model=List[PanterAdminRequestOut])
async def list_panter_inspections(u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    docs = await db.panter_admin_requests.find({"type": "inspection"}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [public_panter_admin_request(doc) for doc in docs]


@api.post("/panter/admin/inspection-requests", response_model=PanterAdminRequestOut)
async def create_panter_inspection(body: PanterAdminRequestIn, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    body.type = "inspection"
    created = await create_panter_admin_request(body)
    await add_panter_inspection_history(created.id, "created", u)
    return created


@api.patch("/panter/admin/inspection-requests/{request_id}/status", response_model=PanterAdminRequestOut)
async def update_panter_inspection_status(request_id: str, body: PanterInspectionStatusIn, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    doc = await db.panter_admin_requests.find_one({"id": request_id, "type": "inspection"}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Inspection request not found")

    payload = dict(doc.get("payload") or {})
    payload["status"] = body.status
    if body.notes:
        payload["admin_notes"] = body.notes
    await db.panter_admin_requests.update_one(
        {"id": request_id},
        {"$set": {"status": body.status, "payload": payload, "updated_at": now_iso()}},
    )
    updated = await db.panter_admin_requests.find_one({"id": request_id}, {"_id": 0})
    await add_panter_inspection_history(request_id, f"status:{body.status}", u, body.notes)
    return public_panter_admin_request(updated)


@api.post("/panter/admin/inspection-requests/{request_id}/assign", response_model=PanterAdminRequestOut)
async def assign_panter_inspector(request_id: str, body: PanterInspectorAssignIn, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    inspector = await db.users.find_one({"id": body.inspector_id, "role": "staff"}, {"_id": 0})
    if not inspector:
        raise HTTPException(404, "Inspector not found")
    doc = await db.panter_admin_requests.find_one({"id": request_id, "type": "inspection"}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Inspection request not found")
    payload = dict(doc.get("payload") or {})
    payload["inspector_id"] = inspector["id"]
    payload["inspector_name"] = inspector["name"]
    await db.panter_admin_requests.update_one({"id": request_id}, {"$set": {"payload": payload, "status": "Inspector Assigned", "updated_at": now_iso()}})
    await add_panter_inspection_history(request_id, "assigned", u, inspector["name"])
    updated = await db.panter_admin_requests.find_one({"id": request_id}, {"_id": 0})
    return public_panter_admin_request(updated)


@api.post("/panter/admin/inspection-requests/{request_id}/report", response_model=PanterAdminRequestOut)
async def upload_panter_inspection_report(request_id: str, body: PanterReportUploadIn, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    doc = await db.panter_admin_requests.find_one({"id": request_id, "type": "inspection"}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Inspection request not found")
    report = {**body.model_dump(), "id": str(uuid.uuid4()), "uploaded_by": u.get("id"), "created_at": now_iso()}
    await db.panter_inspection_reports.insert_one({**report, "request_id": request_id})
    payload = dict(doc.get("payload") or {})
    payload["latest_report_id"] = report["id"]
    await db.panter_admin_requests.update_one({"id": request_id}, {"$set": {"payload": payload, "status": "Report Uploaded", "updated_at": now_iso()}})
    await add_panter_inspection_history(request_id, "report_uploaded", u, body.notes)
    updated = await db.panter_admin_requests.find_one({"id": request_id}, {"_id": 0})
    return public_panter_admin_request(updated)


@api.get("/panter/admin/inspection-requests/{request_id}/history")
async def panter_inspection_history(request_id: str, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    return await db.panter_inspection_history.find({"request_id": request_id}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.get("/panter/admin/quotations", response_model=List[PanterAdminRequestOut])
async def list_panter_quotations(u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    docs = await db.panter_admin_requests.find({"type": "quotation"}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [public_panter_admin_request(doc) for doc in docs]


@api.patch("/panter/admin/quotations/{request_id}", response_model=PanterAdminRequestOut)
async def update_panter_quotation(request_id: str, body: PanterAdminRequestUpdateIn, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    doc = await db.panter_admin_requests.find_one({"id": request_id, "type": "quotation"}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Quotation request not found")
    return await update_panter_admin_request(request_id, body, u)


@api.get("/panter/admin/ai/conversations")
async def list_panter_ai_conversations(u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    sessions = await db.chat_messages.distinct("session_id")
    rows = []
    for session_id in sessions[:500]:
        messages = await db.chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(100)
        if messages:
            rows.append({"session_id": session_id, "messages": messages, "message_count": len(messages), "updated_at": messages[-1].get("created_at")})
    return sorted(rows, key=lambda row: row.get("updated_at") or "", reverse=True)


@api.get("/panter/admin/ai/knowledge")
async def get_panter_ai_knowledge(u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    doc = await db.panter_ai_knowledge.find_one({"id": "default"}, {"_id": 0})
    return doc or {"id": "default", "content": "", "updated_at": None}


@api.put("/panter/admin/ai/knowledge")
async def save_panter_ai_knowledge(body: Dict[str, Any], u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    doc = {"id": "default", "content": body.get("content") or "", "updated_by": u.get("id"), "updated_at": now_iso()}
    await db.panter_ai_knowledge.update_one({"id": "default"}, {"$set": doc}, upsert=True)
    return doc


@api.get("/panter/admin/ai/documents")
async def list_panter_ai_documents(u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    return await db.panter_ai_documents.find({}, {"_id": 0, "data_uri": 0}).sort("created_at", -1).to_list(500)


@api.post("/panter/admin/ai/documents")
async def upload_panter_ai_document(body: PanterAiDocumentIn, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    doc = {**body.model_dump(), "id": str(uuid.uuid4()), "uploaded_by": u.get("id"), "created_at": now_iso(), "updated_at": now_iso()}
    await db.panter_ai_documents.insert_one(doc.copy())
    return {k: v for k, v in doc.items() if k != "data_uri"}


@api.post("/panter/admin/ai/training")
async def train_panter_ai(body: Dict[str, Any], u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    doc = {"id": str(uuid.uuid4()), "status": "completed", "input": body, "created_by": u.get("id"), "created_at": now_iso()}
    await db.panter_ai_training_runs.insert_one(doc.copy())
    return doc


@api.get("/panter/admin/ai/feedback")
async def list_panter_ai_feedback(u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    return await db.panter_ai_feedback.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/panter/admin/ai/feedback")
async def create_panter_ai_feedback(body: PanterAiFeedbackIn, u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    doc = {**body.model_dump(), "id": str(uuid.uuid4()), "created_by": u.get("id"), "created_at": now_iso()}
    await db.panter_ai_feedback.insert_one(doc.copy())
    return doc


@api.get("/panter/admin/employees")
async def list_panter_employees(u: dict = Depends(get_current_user)):
    require_panter_admin(u)
    docs = await db.users.find({"role": "staff"}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(500)
    return [
        {
            **doc,
            "active_projects": await db.panter_admin_requests.count_documents({"payload.inspector_id": doc.get("id"), "status": {"$nin": ["Inspection Completed", "Cancelled"]}}),
            "status": "active" if doc.get("active", True) else "inactive",
            "contact": {"email": doc.get("email"), "phone": doc.get("phone") or doc.get("room_no")},
        }
        for doc in docs
    ]

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
        set_fields["email"] = email
        await db.users.update_one({"id": other_admin["id"]}, {"$set": set_fields})
        logger.info("System admin credentials updated from env for %s", email)
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

async def migrate_room_fields() -> None:
    defaults = {
        "capacity": 2,
        "price_per_night": 0,
        "operational_status": "normal",
        "is_active": True,
        "description": None,
        "updated_at": now_iso(),
    }
    for key, value in defaults.items():
        await db.rooms.update_many({key: {"$exists": False}}, {"$set": {key: value}})
    await db.rooms.update_many({"room_type": {"$exists": False}, "type": {"$exists": True}}, [{"$set": {"room_type": "$type"}}])
    await db.rooms.update_many({"room_type": {"$exists": False}}, {"$set": {"room_type": "Standard", "type": "Standard"}})
    await db.rooms.update_many({"type": {"$exists": False}, "room_type": {"$exists": True}}, [{"$set": {"type": "$room_type"}}])
    await db.rooms.update_many({"status": "out_of_service"}, {"$set": {"operational_status": "maintenance", "status": "maintenance"}})

async def ensure_ai_knowledge_indexes() -> None:
    await db.hotel_ai_knowledge.update_many(
        {"hotel_id": {"$exists": True}, "hotelId": {"$exists": False}},
        [{"$set": {"hotelId": "$hotel_id"}}],
    )
    await db.hotel_ai_knowledge.update_many(
        {"hotelId": {"$exists": True}, "hotel_id": {"$exists": False}},
        [{"$set": {"hotel_id": "$hotelId"}}],
    )
    await db.hotel_ai_knowledge.create_index(
        "hotel_id",
        unique=True,
        background=True,
        partialFilterExpression={"hotel_id": {"$exists": True}},
    )

async def ensure_identity_indexes() -> None:
    await db.identity_verifications.create_index("user_id", unique=True, background=True)
    await db.identity_verifications.create_index([("hotel_id", 1), ("status", 1)], background=True)
    await db.identity_verifications.create_index("document_fingerprint", background=True, sparse=True)
    await db.identity_documents.create_index("verification_id", background=True)
    await db.identity_documents.create_index("checksum", background=True)
    await db.identity_documents.create_index("perceptual_hash", background=True, sparse=True)
    await db.identity_ocr_results.create_index([("verification_id", 1), ("created_at", -1)], background=True)
    await db.identity_face_results.create_index([("verification_id", 1), ("created_at", -1)], background=True)
    await db.identity_fraud_analysis.create_index([("verification_id", 1), ("created_at", -1)], background=True)
    await db.identity_liveness_challenges.create_index([("user_id", 1), ("created_at", -1)], background=True)
    await db.verification_history.create_index("verification_id", background=True)
    await db.audit_logs.create_index([("verification_id", 1), ("created_at", -1)], background=True)

async def seed_demo():
    if await db.users.count_documents({}) > 0:
        await db.users.update_many({"role": "admin"}, {"$set": {"role": "hotel_manager"}})
        await db.users.update_many({"hotel_id": {"$exists": True}, "hotelId": {"$exists": False}}, [{"$set": {"hotelId": "$hotel_id"}}])
        await db.requests.update_many({"hotel_id": {"$exists": True}, "hotelId": {"$exists": False}}, [{"$set": {"hotelId": "$hotel_id"}}])
        await db.rooms.update_many({"hotel_id": {"$exists": True}, "hotelId": {"$exists": False}}, [{"$set": {"hotelId": "$hotel_id"}}])
        await db.reservations.update_many({"hotel_id": {"$exists": True}, "hotelId": {"$exists": False}}, [{"$set": {"hotelId": "$hotel_id"}}])
        await migrate_room_fields()
        await ensure_ai_knowledge_indexes()
        await ensure_identity_indexes()
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
        ("101", "Standard", "1", 2, 4500), ("102", "Standard", "1", 2, 4500), ("103", "Family", "1", 4, 6200),
        ("204", "Deluxe", "2", 2, 5000), ("205", "Deluxe", "2", 2, 5000),
        ("315", "Deluxe", "3", 3, 5400), ("316", "Family", "3", 4, 6500),
        ("401", "Suite", "4", 2, 8500), ("402", "VIP", "4", 2, 12000),
    ]
    for rn, tp, floor, capacity, price in rooms_seed:
        # Mark occupied for rooms already assigned to seeded guests
        status_r = "occupied" if rn in ("204", "315") else "available"
        await db.rooms.insert_one({
            "id": str(uuid.uuid4()),
            "room_number": rn,
            "room_name": f"{rn} {tp}" if tp != "Standard" else rn,
            "room_type": tp,
            "type": tp,
            "floor": floor,
            "capacity": capacity,
            "price_per_night": price,
            "operational_status": "normal",
            "status": status_r,
            "is_active": True,
            "description": None,
            "hotel_id": DEFAULT_HOTEL_ID,
            "hotelId": DEFAULT_HOTEL_ID,
            "created_at": now_iso(),
            "updated_at": now_iso(),
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

    await ensure_ai_knowledge_indexes()
    await ensure_identity_indexes()
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
