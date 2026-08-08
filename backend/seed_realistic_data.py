#!/usr/bin/env python3
"""
Hospira AI Hotel Management System — Realistic Seed Data

Inserts rich test data into the EXISTING MongoDB collections used by the app.
Does NOT modify application code or schema.

Usage:
  python seed_realistic_data.py
  python seed_realistic_data.py --force          # remove previous seed_tag batch, then re-seed
  python seed_realistic_data.py --dry-run        # print plan only

Default login password for all seeded users: Hospira2026!
Seed marker field on every inserted doc: seed_tag = "hospira-realistic-v1"

Notes (schema mapping):
  - Hotels / rooms / users / requests / chat_messages /
    announcements / identity_alerts / hotel_ai_knowledge → live app collections
  - Extra profile fields (phone, salary, shift, nationality, …) are stored on
    documents; the API ignores unknown fields safely (MongoDB)
  - reviews / invoices / analytics_monthly / staff_schedules are additive
    seed-only collections (no app code change) for reporting / future UIs
  - reservations collection is not inserted (module removed); build_reservations()
    still runs in-memory to assign guest rooms and feed related seed docs
  - Staff departments match DEPARTMENTS keys in server.py
"""

from __future__ import annotations

import argparse
import hashlib
import os
import random
import string
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import bcrypt
from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne

# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------
SEED_TAG = "hospira-realistic-v1"
DEFAULT_PASSWORD = "Hospira2026!"
RNG = random.Random(20260730)  # reproducible

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "hotel_ops")

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

ROOM_TYPES = [
    ("Standard", 2, 3500, 4800),
    ("Deluxe", 2, 4800, 7200),
    ("Suite", 2, 8500, 14000),
    ("Family", 4, 6200, 9500),
    ("VIP", 2, 12000, 22000),
]

BOOKING_SOURCES = [
    "Direct Website",
    "Booking.com",
    "Expedia",
    "Hotels.com",
    "Phone",
    "Walk-in",
    "Corporate",
    "Travel Agent",
]

PAYMENT_METHODS = ["credit_card", "debit_card", "cash", "bank_transfer", "company_invoice"]
PAYMENT_STATUSES = ["pending", "paid", "vip_guest", "company_paid", "casino_guest"]
SHIFTS = ["Morning", "Evening", "Night"]
LANGUAGES = ["tr", "en", "de", "fr", "ru", "ar", "nl", "it"]

FIRST_NAMES_M = [
    "Ahmet", "Mehmet", "Mustafa", "Ali", "Hüseyin", "Hasan", "İbrahim", "Yusuf",
    "Ömer", "Murat", "Emre", "Can", "Burak", "Serkan", "Onur", "Kerem", "Ege",
    "Baran", "Deniz", "Tolga", "Cem", "Kaan", "Arda", "Berk", "Umut", "Furkan",
]
FIRST_NAMES_F = [
    "Ayşe", "Fatma", "Emine", "Hatice", "Zeynep", "Elif", "Merve", "Selin",
    "Deniz", "İrem", "Ece", "Ceren", "Derya", "Gül", "Sude", "Defne", "Melis",
    "Büşra", "Esra", "Pınar", "Nur", "Yasemin", "Sibel", "Aslı", "Gamze", "İpek",
]
LAST_NAMES = [
    "Yılmaz", "Kaya", "Demir", "Çelik", "Şahin", "Yıldız", "Yıldırım", "Öztürk",
    "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kara",
    "Koç", "Kurt", "Özkan", "Şimşek", "Erdoğan", "Güneş", "Aksoy", "Polat",
    "Acar", "Tekin", "Bulut", "Bozkurt", "Taş", "Avcı",
]

INTL_GUESTS = [
    ("James", "Smith", "England", "British", "en"),
    ("Emma", "Johnson", "England", "British", "en"),
    ("Hans", "Müller", "Germany", "German", "de"),
    ("Anna", "Schmidt", "Germany", "German", "de"),
    ("Pierre", "Dupont", "France", "French", "fr"),
    ("Sophie", "Martin", "France", "French", "fr"),
    ("Marco", "Rossi", "Italy", "Italian", "it"),
    ("Giulia", "Bianchi", "Italy", "Italian", "it"),
    ("Ivan", "Petrov", "Russia", "Russian", "ru"),
    ("Olga", "Sokolova", "Russia", "Russian", "ru"),
    ("Lars", "de Vries", "Netherlands", "Dutch", "nl"),
    ("Eva", "Jansen", "Netherlands", "Dutch", "nl"),
    ("Omar", "Al-Rashid", "Saudi Arabia", "Saudi", "ar"),
    ("Fatima", "Al-Harbi", "Saudi Arabia", "Saudi", "ar"),
    ("Michael", "Brown", "United States", "American", "en"),
    ("Emily", "Davis", "United States", "American", "en"),
    ("Robert", "Wilson", "United States", "American", "en"),
    ("Chloe", "Anderson", "England", "British", "en"),
    ("Klaus", "Weber", "Germany", "German", "de"),
    ("Camille", "Bernard", "France", "French", "fr"),
]

HOTEL_DEFS = [
    {
        "slug": "hospira-grand-istanbul",
        "hotel_name": "Hospira Grand Istanbul",
        "city": "Istanbul",
        "address": "Abdi İpekçi Cad. No:42, Nişantaşı, Şişli",
        "latitude": 41.0524,
        "longitude": 28.9928,
        "phone": "+90 212 555 0101",
        "email": "grand.istanbul@hospira.com",
        "description": "Boğaz manzaralı lüks şehir oteli. İş ve VIP seyahatler için ideal.",
        "star_rating": 5,
        "room_count": 180,
    },
    {
        "slug": "bosphorus-elite",
        "hotel_name": "Bosphorus Elite Hotel",
        "city": "Istanbul",
        "address": "Ciragan Cad. No:18, Beşiktaş",
        "latitude": 41.0438,
        "longitude": 29.0153,
        "phone": "+90 212 555 0202",
        "email": "bosphorus@hospira.com",
        "description": "Boğaz kenarında butik elite konaklama, spa ve fine dining.",
        "star_rating": 5,
        "room_count": 95,
    },
    {
        "slug": "blue-horizon-resort",
        "hotel_name": "Blue Horizon Resort",
        "city": "Bodrum",
        "address": "Yalıkavak Mah. Sahil Yolu No:7",
        "latitude": 37.1060,
        "longitude": 27.2940,
        "phone": "+90 252 555 0303",
        "email": "bluehorizon@hospira.com",
        "description": "Ege sahilinde aile dostu resort, kids club ve plaj kulübü.",
        "star_rating": 4,
        "room_count": 220,
    },
    {
        "slug": "cappadocia-cave-suites",
        "hotel_name": "Cappadocia Cave Suites",
        "city": "Nevşehir",
        "address": "Gaferli Mah. Cave Street No:12, Göreme",
        "latitude": 38.6431,
        "longitude": 34.8289,
        "phone": "+90 384 555 0404",
        "email": "cappadocia@hospira.com",
        "description": "Oyma taş mağara süitleri, balon manzarası ve yerel deneyimler.",
        "star_rating": 4,
        "room_count": 80,
    },
    {
        "slug": "antalya-beach-palace",
        "hotel_name": "Antalya Beach Palace",
        "city": "Antalya",
        "address": "Lara Cad. No:88, Muratpaşa",
        "latitude": 36.8563,
        "longitude": 30.7866,
        "phone": "+90 242 555 0505",
        "email": "antalya@hospira.com",
        "description": "Akdeniz kıyısında all-inclusive beach palace, spa ve aquapark.",
        "star_rating": 5,
        "room_count": 250,
    },
]

CHAT_SCENARIOS = [
    ("Gece yarısından sonra geleceğim, resepsiyon açık mı?",
     "Tabii ki. 24 saat resepsiyon hizmetimiz var. Geç varışınızı not aldım; oda anahtarınız sizi bekliyor olacak."),
    ("Bebek yatağı isteyebilir miyim?",
     "Elbette. Odanıza bebek yatağı ekliyorum. Housekeeping ekibimiz check-in öncesi hazırlayacak."),
    ("Havalimanı transferine ihtiyacım var.",
     "Anlaşıldı. Uçuş numaranızı ve varış saatinizi paylaşırsanız transferi ayarlayabilirim."),
    ("Geç check-out rica ediyorum.",
     "Müsaitlik durumuna göre 14:00'e kadar ücretsiz geç check-out sunabiliyoruz. Onayladım."),
    ("Restoran çalışma saatleri nedir?",
     "Ana restoran 07:00–23:00, oda servisi 24 saattir. Rezervasyon isterseniz yardımcı olurum."),
    ("Odaya ekstra havlu ve yastık gönderir misiniz?",
     "Housekeeping’e ilettim. Yaklaşık 15 dakika içinde odanıza ulaşacak."),
    ("Spa için randevu almak istiyorum.",
     "Bugün 16:30 ve 18:00 müsait. Hangisini tercih edersiniz?"),
    ("Klimam soğuk üflemiyor.",
     "Teknik destek talebinizi oluşturdum. Ekibimiz en kısa sürede odanıza gelecek."),
    ("Vale hizmeti var mı?",
     "Evet, vale hizmetimiz 24 saat aktif. Araç plakanızı paylaşırsanız yönlendireyim."),
    ("Şehir turu önerir misiniz?",
     "Tabii. Yarım günlük Boğaz turu veya tarihi yarımada turu popüler. Bütçenize göre seçenek verebilirim."),
    ("Çamaşır yıkama hizmeti istiyorum.",
     "Kuru temizleme / laundry talebinizi aldım. Aynı gün teslim için 10:00’dan önce bırakmanız yeterli."),
    ("VIP check-in mümkün mü?",
     "Evet. VIP salonda karşılama ve hızlı check-in ayarladım. Hoş geldiniz!"),
    ("Glutensiz kahvaltı seçenekleriniz var mı?",
     "Var. Glutensiz menüyü oda servisine not ettim. Sabah 08:00 için hazır olsun mu?"),
    ("Otopark ücretli mi?",
     "Otel misafirlerine kapalı otopark ücretsizdir. Vale ile de bırakabilirsiniz."),
    ("Erken check-in yapabilir miyim?",
     "Oda hazır olursa 12:00’den itibaren erken check-in mümkün. Sizi bilgilendireceğim."),
]

REVIEW_COMMENTS = {
    5: [
        "Mükemmel hizmet, personel çok ilgili. Kesinlikle tekrar geleceğiz.",
        "Oda tertemiz, manzara harika. Kahvaltı çeşitleri çok zengindi.",
        "AI asistan gerçekten yardımcı oldu, transfer ve spa kolay ayarlandı.",
        "VIP karşılama unutulmazdı. Her detay düşünülmüş.",
    ],
    4: [
        "Genel olarak çok iyi. Spa biraz daha geniş olabilirdi.",
        "Konum süper, oda konforlu. Check-out biraz yoğun geçti.",
        "Personel güler yüzlü. Restoran menüsü başarılı.",
        "Temizlik ve sessizlik puanı yüksek. Tekrar tercih ederim.",
    ],
    3: [
        "Ortalama bir konaklama. Wi-Fi bazen yavaşladı.",
        "Oda güzel ama klima sesi rahatsız etti.",
        "Fiyat/performans kabul edilebilir. Kahvaltı sıradan.",
        "Personel iyi niyetli, süreçler biraz yavaş.",
    ],
    2: [
        "Check-in uzun sürdü. Oda geç hazırlandı.",
        "Ses yalıtımı zayıf, komşu gürültüsü vardı.",
        "Restoran servisi beklediğimden yavaştı.",
    ],
    1: [
        "Rezervasyon karışıklığı yaşadık, hayal kırıklığı.",
        "Temizlik standartların altındaydı.",
    ],
}

NOTIFICATION_TEMPLATES = [
    ("New reservation", "Yeni rezervasyon oluşturuldu: {guest} — oda {room}", "info"),
    ("VIP guest arrived", "VIP misafir check-in yaptı: {guest}", "high"),
    ("Maintenance request", "Bakım talebi: Oda {room} — {detail}", "medium"),
    ("Payment received", "Ödeme alındı: {guest} — {amount} TRY", "info"),
    ("Room cleaned", "Oda {room} temizlendi ve müsait.", "info"),
    ("Late check-out approved", "Geç check-out onaylandı: {guest} / oda {room}", "info"),
    ("Housekeeping alert", "Housekeeping: Oda {room} için ekstra set talep edildi.", "low"),
    ("Airport transfer", "Transfer planlandı: {guest}", "medium"),
]


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def uid() -> str:
    return str(uuid.uuid4())


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()


def phone_tr(used: set) -> str:
    while True:
        p = f"+90 5{RNG.randint(30, 59)} {RNG.randint(100, 999)} {RNG.randint(10, 99)} {RNG.randint(10, 99)}"
        if p not in used:
            used.add(p)
            return p


def email_of(first: str, last: str, domain: str, used: set, suffix: str = "") -> str:
    base = f"{_slug(first)}.{_slug(last)}{suffix}@{domain}".lower()
    e = base
    n = 1
    while e in used:
        n += 1
        e = f"{_slug(first)}.{_slug(last)}{suffix}{n}@{domain}".lower()
    used.add(e)
    return e


def _slug(s: str) -> str:
    table = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    return "".join(ch for ch in s.translate(table).lower() if ch.isalnum())


def passport_id(nationality: str, used: set) -> str:
    while True:
        if nationality == "Turkish":
            val = f"T{RNG.randint(10, 99)}{RNG.randint(1000000, 9999999)}"
        else:
            val = f"P{RNG.choice(string.ascii_uppercase)}{RNG.randint(10000000, 99999999)}"
        if val not in used:
            used.add(val)
            return val


def access_code() -> str:
    return "".join(RNG.choices(string.digits, k=6))


def iso_date(d: date) -> str:
    return d.isoformat()


def iso_dt(d: date, hour: int = 12, minute: int = 0) -> str:
    return datetime(d.year, d.month, d.day, hour, minute, tzinfo=timezone.utc).isoformat()


def pick_name(gender: str) -> Tuple[str, str]:
    first = RNG.choice(FIRST_NAMES_M if gender == "male" else FIRST_NAMES_F)
    last = RNG.choice(LAST_NAMES)
    return first, last


def age_to_birth(age: int) -> str:
    today = date.today()
    year = today.year - age
    month = RNG.randint(1, 12)
    day = RNG.randint(1, 28)
    return iso_date(date(year, month, day))


def default_services() -> Dict[str, bool]:
    return {k: True for k in SERVICE_OPTIONS}


def photo_url(seed: str) -> str:
    h = hashlib.md5(seed.encode()).hexdigest()[:8]
    return f"https://i.pravatar.cc/150?u={h}"


def tag(doc: dict) -> dict:
    doc["seed_tag"] = SEED_TAG
    return doc


# --------------------------------------------------------------------------
# Seed builders
# --------------------------------------------------------------------------
def build_hotels() -> List[dict]:
    hotels = []
    for h in HOTEL_DEFS:
        hotels.append(tag({
            "id": f"hotel-{h['slug']}",
            "hotel_name": h["hotel_name"],
            "city": h["city"],
            "address": h["address"],
            "latitude": h["latitude"],
            "longitude": h["longitude"],
            "country": "Turkey",
            "phone": h["phone"],
            "email": h["email"],
            "description": h["description"],
            "star_rating": h["star_rating"],
            "room_count": h["room_count"],
            "status": "Active",
            "active": True,
            "manager_id": None,
            "services": default_services(),
            "created_at": now_iso(),
        }))
    return hotels


def build_rooms(hotels: List[dict]) -> List[dict]:
    rooms: List[dict] = []
    for hotel in hotels:
        count = int(hotel["room_count"])
        hid = hotel["id"]
        used_numbers: set = set()
        for i in range(1, count + 1):
            floor = 1 + ((i - 1) // 25)
            seq = ((i - 1) % 25) + 1
            room_number = f"{floor}{seq:02d}"
            # collision guard (rare across high room counts)
            n = 0
            while room_number in used_numbers:
                n += 1
                room_number = f"{floor}{seq:02d}{n}"
            used_numbers.add(room_number)
            rtype, cap, pmin, pmax = ROOM_TYPES[(i - 1) % len(ROOM_TYPES)]
            price = RNG.randint(pmin, pmax)
            op = "normal"
            roll = RNG.random()
            if roll < 0.03:
                op = "maintenance"
            elif roll < 0.08:
                op = "cleaning"
            rooms.append(tag({
                "id": uid(),
                "room_number": room_number,
                "room_name": f"{room_number} {rtype}",
                "room_type": rtype,
                "type": rtype,
                "floor": str(floor),
                "capacity": cap,
                "price_per_night": price,
                "operational_status": op,
                "status": "available",
                "is_active": True,
                "description": f"{rtype} oda — {hotel['hotel_name']}",
                "hotel_id": hid,
                "hotelId": hid,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }))
    return rooms


def build_employees(hotels: List[dict]) -> List[dict]:
    """50 employees distributed across hotels with role/department mapping."""
    used_emails: set = set()
    used_phones: set = set()
    employees: List[dict] = []

    # Role plan: (count, app_role, department, position_title, salary_range)
    plan = [
        (5, "hotel_manager", None, "Hotel Manager", (90000, 140000)),
        (5, "staff", "concierge", "Reception Supervisor", (45000, 65000)),
        (15, "staff", "concierge", "Receptionist", (28000, 42000)),
        (10, "staff", "housekeeping", "Housekeeping Staff", (25000, 38000)),
        (5, "staff", "oda_servisi", "Restaurant Staff", (26000, 40000)),
        (5, "staff", "vale", "Security Staff", (27000, 40000)),
        (5, "staff", "teknik_destek", "Maintenance Staff", (28000, 45000)),
    ]

    # Round-robin hotel assignment
    hotel_cycle = [h["id"] for h in hotels]
    idx = 0

    for count, role, dept, position, (smin, smax) in plan:
        for n in range(count):
            gender = RNG.choice(["male", "female"])
            first, last = pick_name(gender)
            age = RNG.randint(22, 58)
            hid = hotel_cycle[idx % len(hotel_cycle)]
            idx += 1
            hotel = next(h for h in hotels if h["id"] == hid)
            domain = hotel["email"].split("@")[1]
            emp = tag({
                "id": uid(),
                "email": email_of(first, last, domain, used_emails, suffix=f".{position.split()[0].lower()}"),
                "password_hash": None,  # filled later once
                "name": f"{first} {last}",
                "first_name": first,
                "last_name": last,
                "role": role,
                "department": dept,
                "position": position,
                "phone": phone_tr(used_phones),
                "profile_photo": photo_url(f"{first}{last}{n}"),
                "gender": gender,
                "age": age,
                "birth_date": age_to_birth(age),
                "nationality": "Turkish",
                "country": "Turkey",
                "region_city": hotel["city"],
                "hotel_id": hid,
                "hotelId": hid,
                "salary": RNG.randint(smin, smax),
                "employment_date": iso_date(date.today() - timedelta(days=RNG.randint(30, 2000))),
                "shift": RNG.choice(SHIFTS),
                "status": "Active",
                "active": True,
                "room_no": None,
                "guest_type": None,
                "identity_status": "approved",
                "created_at": now_iso(),
            })
            employees.append(emp)

    return employees


def build_guests() -> List[dict]:
    used_emails: set = set()
    used_phones: set = set()
    used_ids: set = set()
    guests: List[dict] = []

    for i in range(200):
        is_intl = RNG.random() < 0.45
        if is_intl:
            first, last, country, nationality, lang = RNG.choice(INTL_GUESTS)
            # slight variation
            if RNG.random() < 0.5:
                first = first + ("" if RNG.random() < 0.7 else "")
            gender = "male" if first in {
                "James", "Hans", "Pierre", "Marco", "Ivan", "Lars", "Omar", "Michael", "Robert", "Klaus"
            } else "female"
        else:
            gender = RNG.choice(["male", "female"])
            first, last = pick_name(gender)
            country, nationality, lang = "Turkey", "Turkish", "tr"

        age = RNG.randint(21, 72)
        vip = RNG.random() < 0.10
        prev_stays = RNG.randint(0, 18)
        guests.append(tag({
            "id": uid(),
            "email": email_of(first, last, "guest.hospira.com", used_emails, suffix=str(i)),
            "password_hash": None,
            "name": f"{first} {last}",
            "first_name": first,
            "last_name": last,
            "role": "guest",
            "department": None,
            "phone": phone_tr(used_phones) if nationality == "Turkish" or RNG.random() < 0.6 else f"+{RNG.randint(1, 99)} {RNG.randint(100000000, 999999999)}",
            "profile_photo": photo_url(f"guest-{i}"),
            "gender": gender,
            "age": age,
            "birth_date": age_to_birth(age),
            "nationality": nationality,
            "country": country,
            "passport_id": passport_id(nationality, used_ids),
            "vip": vip,
            "guest_type": "vip" if vip else "standard",
            "loyalty_points": RNG.randint(0, 25000) if prev_stays else RNG.randint(0, 500),
            "previous_stay_count": prev_stays,
            "preferred_language": lang,
            "notes": RNG.choice([
                "",
                "Late arrival expected",
                "Allergy: peanuts",
                "High floor preferred",
                "Quiet room requested",
                "Celebrating anniversary",
                "Business traveler",
                "Family with children",
            ]),
            "hotel_id": None,  # assigned when checked into a room
            "hotelId": None,
            "room_no": None,
            "access_code": access_code(),
            "status": "Active",
            "active": True,
            "created_at": now_iso(),
        }))
    return guests


def build_reservations(
    hotels: List[dict],
    rooms_by_hotel: Dict[str, List[dict]],
    guests: List[dict],
) -> Tuple[List[dict], List[dict]]:
    """Create reservations ~70% occupancy today + mix of statuses. Returns reservations, invoices."""
    today = date.today()
    reservations: List[dict] = []
    invoices: List[dict] = []
    used_room_day: set = set()  # (hotel_id, room_number, date_iso) occupancy lock for checked_in/pending overlapping today

    def overlaps_today(ci: date, co: date) -> bool:
        return ci <= today < co

    for hotel in hotels:
        hid = hotel["id"]
        rooms = [r for r in rooms_by_hotel[hid] if r["operational_status"] == "normal"]
        target_occ = int(len(rooms_by_hotel[hid]) * 0.70)
        occupied_rooms = rooms[:target_occ]
        remaining = rooms[target_occ:]

        # Checked-in (~70%)
        for room in occupied_rooms:
            guest = RNG.choice(guests)
            nights = RNG.randint(1, 7)
            ci = today - timedelta(days=RNG.randint(0, max(0, nights - 1)))
            co = ci + timedelta(days=nights)
            if not overlaps_today(ci, co):
                ci = today
                co = today + timedelta(days=nights)
            price = room["price_per_night"]
            total = price * nights
            pay = RNG.choices(PAYMENT_STATUSES, weights=[10, 70, 8, 8, 4])[0]
            special = RNG.choice([
                "", "Late check-in", "Baby crib", "Airport transfer", "High floor",
                "Quiet room", "Extra towels", "Anniversary decor", "Early check-in",
            ])
            rid = uid()
            guest_hotel_assign(guest, hid, room["room_number"])
            res = tag({
                "id": rid,
                "customer_name": guest["name"],
                "customer_email": guest["email"],
                "customer_phone": guest.get("phone"),
                "capacity": room["capacity"],
                "room_id": room["id"],
                "room_number": room["room_number"],
                "room_name": room["room_name"],
                "price_per_night": price,
                "total_nights": nights,
                "total_price": total,
                "check_in_date": iso_date(ci),
                "check_out_date": iso_date(co),
                "hotel_id": hid,
                "hotelId": hid,
                "payment_status": pay,
                "guest_type": guest.get("guest_type") or "standard",
                "identity_verification_requested": False,
                "identity_status": "not_required",
                "identity_members": [],
                "identity_failure_reason": None,
                "encrypted_entry_code": None,
                "entry_code_hash": None,
                "entry_code_expires_at": None,
                "access_code": access_code(),
                "status": "checked_in",
                "user_id": guest["id"],
                "email_sent": True,
                "booking_source": RNG.choice(BOOKING_SOURCES),
                "special_requests": special,
                "payment_method": RNG.choice(PAYMENT_METHODS),
                "created_at": iso_dt(ci - timedelta(days=RNG.randint(1, 40))),
                "updated_at": now_iso(),
            })
            reservations.append(res)
            invoices.append(build_invoice(res, guest))
            used_room_day.add((hid, room["room_number"], iso_date(today)))

        # Reserved (pending) future
        for room in remaining[: max(8, len(remaining) // 5)]:
            guest = RNG.choice(guests)
            nights = RNG.randint(1, 5)
            ci = today + timedelta(days=RNG.randint(1, 21))
            co = ci + timedelta(days=nights)
            price = room["price_per_night"]
            rid = uid()
            res = tag({
                "id": rid,
                "customer_name": guest["name"],
                "customer_email": guest["email"],
                "customer_phone": guest.get("phone"),
                "capacity": room["capacity"],
                "room_id": room["id"],
                "room_number": room["room_number"],
                "room_name": room["room_name"],
                "price_per_night": price,
                "total_nights": nights,
                "total_price": price * nights,
                "check_in_date": iso_date(ci),
                "check_out_date": iso_date(co),
                "hotel_id": hid,
                "hotelId": hid,
                "payment_status": RNG.choice(["pending", "paid", "company_paid"]),
                "guest_type": guest.get("guest_type") or "standard",
                "identity_verification_requested": RNG.random() < 0.2,
                "identity_status": "waiting_for_verification" if RNG.random() < 0.2 else "not_required",
                "identity_members": [],
                "access_code": access_code(),
                "status": "pending",
                "user_id": None,
                "email_sent": True,
                "booking_source": RNG.choice(BOOKING_SOURCES),
                "special_requests": RNG.choice(["", "Airport transfer", "Late arrival", "Sea view"]),
                "payment_method": RNG.choice(PAYMENT_METHODS),
                "created_at": now_iso(),
                "updated_at": now_iso(),
            })
            reservations.append(res)
            invoices.append(build_invoice(res, guest))

        # Checked out (completed) history
        for _ in range(max(15, target_occ // 3)):
            room = RNG.choice(rooms_by_hotel[hid])
            guest = RNG.choice(guests)
            nights = RNG.randint(1, 6)
            co = today - timedelta(days=RNG.randint(1, 60))
            ci = co - timedelta(days=nights)
            price = room["price_per_night"]
            rid = uid()
            res = tag({
                "id": rid,
                "customer_name": guest["name"],
                "customer_email": guest["email"],
                "customer_phone": guest.get("phone"),
                "capacity": room["capacity"],
                "room_id": room["id"],
                "room_number": room["room_number"],
                "room_name": room["room_name"],
                "price_per_night": price,
                "total_nights": nights,
                "total_price": price * nights,
                "check_in_date": iso_date(ci),
                "check_out_date": iso_date(co),
                "hotel_id": hid,
                "hotelId": hid,
                "payment_status": "paid",
                "guest_type": guest.get("guest_type") or "standard",
                "identity_status": "not_required",
                "identity_members": [],
                "access_code": access_code(),
                "status": "completed",
                "user_id": guest["id"],
                "email_sent": True,
                "booking_source": RNG.choice(BOOKING_SOURCES),
                "special_requests": "",
                "payment_method": RNG.choice(PAYMENT_METHODS),
                "created_at": iso_dt(ci - timedelta(days=5)),
                "updated_at": iso_dt(co),
            })
            reservations.append(res)
            invoices.append(build_invoice(res, guest))

        # Cancelled
        for _ in range(max(5, target_occ // 8)):
            room = RNG.choice(rooms_by_hotel[hid])
            guest = RNG.choice(guests)
            nights = RNG.randint(1, 4)
            ci = today + timedelta(days=RNG.randint(-10, 30))
            co = ci + timedelta(days=nights)
            price = room["price_per_night"]
            rid = uid()
            reservations.append(tag({
                "id": rid,
                "customer_name": guest["name"],
                "customer_email": guest["email"],
                "customer_phone": guest.get("phone"),
                "capacity": room["capacity"],
                "room_id": room["id"],
                "room_number": room["room_number"],
                "room_name": room["room_name"],
                "price_per_night": price,
                "total_nights": nights,
                "total_price": price * nights,
                "check_in_date": iso_date(ci),
                "check_out_date": iso_date(co),
                "hotel_id": hid,
                "hotelId": hid,
                "payment_status": "pending",
                "guest_type": "standard",
                "identity_status": "not_required",
                "identity_members": [],
                "access_code": access_code(),
                "status": "cancelled",
                "user_id": None,
                "email_sent": True,
                "booking_source": RNG.choice(BOOKING_SOURCES),
                "special_requests": "Cancelled by guest",
                "payment_method": RNG.choice(PAYMENT_METHODS),
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }))

    return reservations, invoices


def guest_hotel_assign(guest: dict, hotel_id: str, room_no: str) -> None:
    if not guest.get("hotel_id"):
        guest["hotel_id"] = hotel_id
        guest["hotelId"] = hotel_id
        guest["room_no"] = room_no


def build_invoice(res: dict, guest: dict) -> dict:
    room_fee = int(res.get("total_price") or 0)
    restaurant = RNG.randint(0, 4500) if res["status"] in ("checked_in", "completed") else 0
    spa = RNG.randint(0, 3500) if RNG.random() < 0.35 else 0
    laundry = RNG.randint(0, 1200) if RNG.random() < 0.25 else 0
    transfer = RNG.choice([0, 0, 1500, 2500]) if RNG.random() < 0.3 else 0
    subtotal = room_fee + restaurant + spa + laundry + transfer
    tax = int(subtotal * 0.10)
    total = subtotal + tax
    paid = res.get("payment_status") in ("paid", "vip_guest", "company_paid", "casino_guest")
    return tag({
        "id": uid(),
        "reservation_id": res["id"],
        "hotel_id": res["hotel_id"],
        "hotelId": res["hotel_id"],
        "guest_id": guest["id"],
        "guest_name": guest["name"],
        "room_number": res.get("room_number"),
        "line_items": [
            {"code": "room", "label": "Room Fee", "amount": room_fee},
            {"code": "restaurant", "label": "Restaurant", "amount": restaurant},
            {"code": "spa", "label": "Spa", "amount": spa},
            {"code": "laundry", "label": "Laundry", "amount": laundry},
            {"code": "airport_transfer", "label": "Airport Transfer", "amount": transfer},
            {"code": "tax", "label": "Taxes (10%)", "amount": tax},
        ],
        "subtotal": subtotal,
        "tax": tax,
        "total": total,
        "currency": "TRY",
        "payment_method": res.get("payment_method"),
        "status": "Paid" if paid else "Pending",
        "created_at": res.get("created_at") or now_iso(),
    })


def build_requests(reservations: List[dict], employees: List[dict]) -> List[dict]:
    checked = [r for r in reservations if r["status"] == "checked_in"]
    staff_by_hotel: Dict[str, List[dict]] = {}
    for e in employees:
        if e["role"] == "staff":
            staff_by_hotel.setdefault(e["hotel_id"], []).append(e)

    samples = [
        ("kuru_temizleme", "Kuru Temizleme", "Takım elbise ütü / yıkama", "ORTA"),
        ("oda_servisi", "Oda Servisi", "Türk kahvaltısı, 2 kişilik", "ORTA"),
        ("teknik_destek", "Teknik Destek", "Klima arızası", "YUKSEK"),
        ("housekeeping", "Housekeeping", "Ekstra havlu ve yastık", "DUSUK"),
        ("vale", "Vale", "Araç vale talebi", "ORTA"),
        ("concierge", "Concierge", "Şehir turu rezervasyonu", "ORTA"),
        ("teknik_destek", "Teknik Destek", "TV açılmıyor", "YUKSEK"),
        ("housekeeping", "Housekeeping", "Oda temizliği", "ORTA"),
        ("oda_servisi", "Restoran", "Akşam yemeği rezervasyonu", "ORTA"),
        ("concierge", "Transfer", "Havalimanı transferi", "YUKSEK"),
    ]
    statuses = ["ALINDI", "PERSONEL_GIDIYOR", "TAMAMLANDI", "REDDEDILDI"]
    weights = [30, 25, 35, 10]
    out = []
    for res in checked[:120]:
        dept, hizmet, detay, prio = RNG.choice(samples)
        st = RNG.choices(statuses, weights=weights)[0]
        staff_pool = [s for s in staff_by_hotel.get(res["hotel_id"], []) if s.get("department") == dept]
        assigned = RNG.choice(staff_pool) if staff_pool and st != "ALINDI" else None
        out.append(tag({
            "id": uid(),
            "guest_id": res.get("user_id"),
            "guest_name": res["customer_name"],
            "room_no": res.get("room_number"),
            "hotel_id": res["hotel_id"],
            "hotelId": res["hotel_id"],
            "departman": dept,
            "service_key": None,
            "hizmet_turu": hizmet,
            "zaman": f"{RNG.randint(8, 22):02d}:00",
            "detay": detay,
            "oncelik": prio,
            "status": st,
            "assigned_staff_id": assigned["id"] if assigned else None,
            "assigned_staff_name": assigned["name"] if assigned else None,
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "completed_at": now_iso() if st == "TAMAMLANDI" else None,
        }))
    return out


def build_chat(guests: List[dict], hotels: List[dict]) -> List[dict]:
    msgs: List[dict] = []
    pool = [g for g in guests if g.get("hotel_id")] or guests
    for i in range(100):
        guest = pool[i % len(pool)]
        session_id = f"seed-session-{i+1:03d}"
        q, a = CHAT_SCENARIOS[i % len(CHAT_SCENARIOS)]
        t0 = datetime.now(timezone.utc) - timedelta(minutes=RNG.randint(5, 5000))
        msgs.append(tag({
            "id": uid(),
            "session_id": session_id,
            "user_id": guest["id"],
            "role": "user",
            "content": q,
            "created_at": t0.isoformat(),
            "hotel_id": guest.get("hotel_id") or hotels[0]["id"],
        }))
        msgs.append(tag({
            "id": uid(),
            "session_id": session_id,
            "user_id": guest["id"],
            "role": "assistant",
            "content": a,
            "created_at": (t0 + timedelta(seconds=RNG.randint(3, 40))).isoformat(),
            "hotel_id": guest.get("hotel_id") or hotels[0]["id"],
        }))
    return msgs


def build_notifications(reservations: List[dict], hotels: List[dict]) -> Tuple[List[dict], List[dict]]:
    alerts = []
    announcements = []
    for hotel in hotels:
        hid = hotel["id"]
        hotel_res = [r for r in reservations if r["hotel_id"] == hid]
        for _ in range(12):
            res = RNG.choice(hotel_res) if hotel_res else None
            title_t, detail_t, sev = RNG.choice(NOTIFICATION_TEMPLATES)
            guest = res["customer_name"] if res else "Misafir"
            room = res.get("room_number") if res else "—"
            amount = res.get("total_price") if res else 0
            detail = detail_t.format(guest=guest, room=room, amount=amount, detail="klima")
            alerts.append(tag({
                "id": uid(),
                "hotel_id": hid,
                "hotelId": hid,
                "reservation_id": res["id"] if res else None,
                "title": title_t,
                "detail": detail,
                "severity": sev,
                "read": RNG.random() < 0.4,
                "created_at": now_iso(),
            }))
        announcements.append(tag({
            "id": uid(),
            "hotel_id": hid,
            "hotelId": hid,
            "title": f"{hotel['hotel_name']} — Günlük Bilgilendirme",
            "message": "Havuz 08:00–20:00 açıktır. Spa randevuları resepsiyondan alınabilir.",
            "active": True,
            "created_at": now_iso(),
        }))
        announcements.append(tag({
            "id": uid(),
            "hotel_id": hid,
            "hotelId": hid,
            "title": "Akşam Canlı Müzik",
            "message": "Lobby bar’da 20:00–23:00 canlı performans.",
            "active": True,
            "created_at": now_iso(),
        }))
    return alerts, announcements


def build_schedules(employees: List[dict]) -> List[dict]:
    """One month of shifts; no impossible overlaps (one shift/day/employee)."""
    today = date.today()
    start = today.replace(day=1)
    # month length
    if start.month == 12:
        end = date(start.year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(start.year, start.month + 1, 1) - timedelta(days=1)

    shift_hours = {
        "Morning": ("08:00", "16:00"),
        "Evening": ("16:00", "00:00"),
        "Night": ("00:00", "08:00"),
    }
    out = []
    staff = [e for e in employees if e["role"] in ("staff", "hotel_manager")]
    d = start
    while d <= end:
        for emp in staff:
            # managers: mostly morning; staff: prefer their assigned shift, rotate days off
            if (hash(emp["id"]) + d.toordinal()) % 7 == 0:
                continue  # day off
            shift = emp.get("shift") or "Morning"
            if emp["role"] == "hotel_manager":
                shift = "Morning"
            start_t, end_t = shift_hours[shift]
            out.append(tag({
                "id": uid(),
                "employee_id": emp["id"],
                "employee_name": emp["name"],
                "hotel_id": emp["hotel_id"],
                "hotelId": emp["hotel_id"],
                "department": emp.get("department"),
                "position": emp.get("position"),
                "date": iso_date(d),
                "shift": shift,
                "start_time": start_t,
                "end_time": end_t,
                "status": "Scheduled",
                "created_at": now_iso(),
            }))
        d += timedelta(days=1)
    return out


def build_reviews(reservations: List[dict]) -> List[dict]:
    completed = [r for r in reservations if r["status"] == "completed"]
    pool = completed if len(completed) >= 100 else reservations
    out = []
    for i in range(100):
        res = pool[i % len(pool)]
        rating = RNG.choices([5, 4, 3, 2, 1], weights=[40, 30, 18, 8, 4])[0]
        out.append(tag({
            "id": uid(),
            "reservation_id": res["id"],
            "hotel_id": res["hotel_id"],
            "hotelId": res["hotel_id"],
            "guest_name": res["customer_name"],
            "guest_email": res["customer_email"],
            "room_number": res.get("room_number"),
            "rating": rating,
            "comment": RNG.choice(REVIEW_COMMENTS[rating]),
            "created_at": res.get("updated_at") or now_iso(),
        }))
    return out


def build_analytics(hotels: List[dict], reservations: List[dict]) -> List[dict]:
    today = date.today()
    out = []
    for hotel in hotels:
        hid = hotel["id"]
        hres = [r for r in reservations if r["hotel_id"] == hid]
        rooms_n = hotel["room_count"]
        for m in range(12):
            # month m months ago
            year = today.year
            month = today.month - m
            while month <= 0:
                month += 12
                year -= 1
            label = f"{year:04d}-{month:02d}"
            occ = round(RNG.uniform(0.55, 0.92), 3)
            bookings = RNG.randint(40, int(rooms_n * 1.2))
            cancellations = int(bookings * RNG.uniform(0.04, 0.12))
            revenue = int(rooms_n * occ * RNG.randint(4200, 9000) * 30)
            avg_stay = round(RNG.uniform(1.8, 4.2), 2)
            nationalities = {
                "Turkey": RNG.randint(30, 55),
                "Germany": RNG.randint(5, 15),
                "England": RNG.randint(4, 12),
                "Russia": RNG.randint(3, 10),
                "Saudi Arabia": RNG.randint(2, 8),
                "United States": RNG.randint(2, 7),
                "France": RNG.randint(1, 6),
                "Italy": RNG.randint(1, 5),
                "Netherlands": RNG.randint(1, 4),
            }
            # normalize roughly to 100
            total_n = sum(nationalities.values())
            nationalities = {k: round(v * 100 / total_n, 1) for k, v in nationalities.items()}
            out.append(tag({
                "id": uid(),
                "hotel_id": hid,
                "hotelId": hid,
                "hotel_name": hotel["hotel_name"],
                "month": label,
                "occupancy": occ,
                "revenue": revenue,
                "bookings": bookings,
                "cancellations": cancellations,
                "guest_nationalities": nationalities,
                "average_stay_length": avg_stay,
                "guest_satisfaction": round(RNG.uniform(3.8, 4.9), 2),
                "staff_performance": round(RNG.uniform(0.78, 0.98), 2),
                "created_at": now_iso(),
            }))
    return out


def build_dashboard_snapshots(hotels: List[dict], rooms: List[dict], reservations: List[dict]) -> List[dict]:
    today = iso_date(date.today())
    snaps = []
    for hotel in hotels:
        hid = hotel["id"]
        hrooms = [r for r in rooms if r["hotel_id"] == hid]
        hres = [r for r in reservations if r["hotel_id"] == hid]
        occupied = [r for r in hres if r["status"] == "checked_in"]
        pending = [r for r in hres if r["status"] == "pending"]
        today_ci = [r for r in hres if r.get("check_in_date") == today]
        today_co = [r for r in hres if r.get("check_out_date") == today]
        month_rev = sum(int(r.get("total_price") or 0) for r in hres if r["status"] in ("checked_in", "completed", "pending") and (r.get("payment_status") != "pending" or r["status"] == "checked_in"))
        snaps.append(tag({
            "id": uid(),
            "hotel_id": hid,
            "hotelId": hid,
            "hotel_name": hotel["hotel_name"],
            "date": today,
            "todays_checkins": len(today_ci),
            "todays_checkouts": len(today_co),
            "pending_reservations": len(pending),
            "occupied_rooms": len(occupied),
            "available_rooms": max(0, len(hrooms) - len(occupied)),
            "revenue_today": sum(int(r.get("price_per_night") or 0) for r in occupied),
            "monthly_revenue": month_rev,
            "average_occupancy": round(len(occupied) / max(1, len(hrooms)), 3),
            "guest_satisfaction": round(RNG.uniform(4.1, 4.8), 2),
            "staff_performance": round(RNG.uniform(0.82, 0.96), 2),
            "created_at": now_iso(),
        }))
    return snaps


def build_ai_knowledge(hotels: List[dict]) -> List[dict]:
    docs = []
    for hotel in hotels:
        hid = hotel["id"]
        docs.append(tag({
            "hotel_id": hid,
            "hotelId": hid,
            "hotel_info": {
                "name": hotel["hotel_name"],
                "address": hotel["address"],
                "city": hotel["city"],
                "phone": hotel.get("phone"),
                "email": hotel.get("email"),
                "stars": hotel.get("star_rating"),
                "description": hotel.get("description"),
            },
            "services": {k: {"available": True, "notes": v} for k, v in SERVICE_OPTIONS.items()},
            "restaurant": {
                "name": f"{hotel['hotel_name']} Restaurant",
                "hours": "07:00-23:00",
                "cuisine": "International / Turkish",
                "dress_code": "Smart casual",
            },
            "rooms": {
                "types": [t[0] for t in ROOM_TYPES],
                "check_in": "14:00",
                "check_out": "12:00",
            },
            "policies": {
                "pets": "Not allowed",
                "smoking": "Non-smoking rooms",
                "cancellation": "Free cancellation up to 24h before arrival",
                "children": "Welcome",
            },
            "general_info": {"wifi": "Free high-speed Wi-Fi", "parking": "Free valet parking"},
            "events": [],
            "paid_services": [
                {"id": uid(), "name": "Airport Transfer", "is_paid": True, "price": "1500 TRY", "description": "One-way"},
                {"id": uid(), "name": "Spa Massage", "is_paid": True, "price": "2500 TRY", "description": "60 min"},
            ],
            "nearby_places": [
                {"id": uid(), "name": "City Center", "category": "Attraction", "description": "Taxi 15 min", "distance": "8 km"},
            ],
            "faq": [
                {"id": uid(), "question": "Late check-out?", "answer": "Until 14:00 subject to availability."},
                {"id": uid(), "question": "Airport transfer?", "answer": "Yes, book via AI reception or front desk."},
            ],
            "custom_entries": [],
            "updated_at": now_iso(),
            "updated_by": "seed",
        }))
    return docs


# --------------------------------------------------------------------------
# DB ops
# --------------------------------------------------------------------------
def clear_seed(db) -> None:
    q = {"seed_tag": SEED_TAG}
    collections = [
        "hotels", "users", "rooms", "reservations", "requests", "chat_messages",
        "announcements", "identity_alerts", "hotel_ai_knowledge",
        "reviews", "invoices", "analytics_monthly", "staff_schedules", "dashboard_snapshots",
    ]
    for name in collections:
        res = db[name].delete_many(q)
        print(f"  cleared {name}: {res.deleted_count}")


def insert_many(db, name: str, docs: List[dict], dry: bool) -> None:
    if not docs:
        print(f"  {name}: 0")
        return
    if dry:
        print(f"  {name}: would insert {len(docs)}")
        return
    # hotel_ai_knowledge unique on hotel_id — upsert
    if name == "hotel_ai_knowledge":
        for d in docs:
            db[name].update_one(
                {"hotel_id": d["hotel_id"], "seed_tag": SEED_TAG},
                {"$set": d},
                upsert=True,
            )
        print(f"  {name}: upserted {len(docs)}")
        return
    db[name].insert_many(docs, ordered=False)
    print(f"  {name}: inserted {len(docs)}")


def link_managers(hotels: List[dict], employees: List[dict]) -> None:
    managers = [e for e in employees if e["role"] == "hotel_manager"]
    # one manager per hotel (first 5)
    for hotel, mgr in zip(hotels, managers):
        hotel["manager_id"] = mgr["id"]
        # ensure manager hotel matches
        mgr["hotel_id"] = hotel["id"]
        mgr["hotelId"] = hotel["id"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Hospira realistic seed data")
    parser.add_argument("--force", action="store_true", help="Delete previous SEED_TAG docs then re-seed")
    parser.add_argument("--dry-run", action="store_true", help="Build data but do not write")
    args = parser.parse_args()

    print(f"Mongo: {MONGO_URL} / db={DB_NAME}")
    print(f"Seed tag: {SEED_TAG}")
    print(f"Default password for seeded users: {DEFAULT_PASSWORD}")

    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)
    db = client[DB_NAME]
    client.admin.command("ping")
    print("Connected.")

    if args.force and not args.dry_run:
        print("Clearing previous seed batch...")
        clear_seed(db)

    existing = db.hotels.count_documents({"seed_tag": SEED_TAG})
    if existing and not args.force and not args.dry_run:
        print(f"Found {existing} seeded hotels already. Use --force to rebuild.")
        return

    print("Building datasets...")
    hotels = build_hotels()
    rooms = build_rooms(hotels)
    employees = build_employees(hotels)
    link_managers(hotels, employees)
    guests = build_guests()

    pw_hash = hash_password(DEFAULT_PASSWORD)
    for u in employees + guests:
        u["password_hash"] = pw_hash

    rooms_by_hotel = {h["id"]: [r for r in rooms if r["hotel_id"] == h["id"]] for h in hotels}
    # build_reservations still assigns guests to rooms and feeds related seed builders;
    # reservation documents themselves are no longer persisted.
    reservations, invoices = build_reservations(hotels, rooms_by_hotel, guests)
    requests = build_requests(reservations, employees)
    chats = build_chat(guests, hotels)
    alerts, announcements = build_notifications(reservations, hotels)
    schedules = build_schedules(employees)
    reviews = build_reviews(reservations)
    analytics = build_analytics(hotels, reservations)
    dashboards = build_dashboard_snapshots(hotels, rooms, reservations)
    knowledge = build_ai_knowledge(hotels)

    # Assign remaining guests without hotel to a random hotel for login scope
    for g in guests:
        if not g.get("hotel_id"):
            h = RNG.choice(hotels)
            g["hotel_id"] = h["id"]
            g["hotelId"] = h["id"]
        if not g.get("access_code"):
            g["access_code"] = access_code()

    print("Inserting...")
    insert_many(db, "hotels", hotels, args.dry_run)
    insert_many(db, "rooms", rooms, args.dry_run)
    insert_many(db, "users", employees + guests, args.dry_run)
    # reservations collection intentionally skipped (module removed)
    insert_many(db, "requests", requests, args.dry_run)
    insert_many(db, "chat_messages", chats, args.dry_run)
    insert_many(db, "identity_alerts", alerts, args.dry_run)
    insert_many(db, "announcements", announcements, args.dry_run)
    insert_many(db, "hotel_ai_knowledge", knowledge, args.dry_run)
    insert_many(db, "staff_schedules", schedules, args.dry_run)
    insert_many(db, "reviews", reviews, args.dry_run)
    insert_many(db, "invoices", invoices, args.dry_run)
    insert_many(db, "analytics_monthly", analytics, args.dry_run)
    insert_many(db, "dashboard_snapshots", dashboards, args.dry_run)

    if not args.dry_run:
        db.reservations.drop()

    # Quick summary
    print("\n=== Seed Summary ===")
    print(f"Hotels:              {len(hotels)}")
    print(f"Rooms:               {len(rooms)}")
    print(f"Employees:           {len(employees)} (5 managers + 45 staff)")
    print(f"Guests:              {len(guests)}")
    print(f"Reservations:        skipped (module removed; in-memory {len(reservations)} for related seed)")
    print(f"Service requests:    {len(requests)}")
    print(f"Chat messages:       {len(chats)} ({len(chats)//2} conversations)")
    print(f"Notifications:       {len(alerts)}")
    print(f"Announcements:       {len(announcements)}")
    print(f"Staff schedule rows: {len(schedules)}")
    print(f"Reviews:             {len(reviews)}")
    print(f"Invoices:            {len(invoices)}")
    print(f"Analytics months:    {len(analytics)}")
    print(f"Dashboard snaps:     {len(dashboards)}")
    print("\nSample logins (password = Hospira2026!):")
    for e in employees[:3]:
        print(f"  {e['role']:15} {e['email']:45} hotel={e['hotel_id']}")
    g0 = guests[0]
    print(f"  {'guest':15} {g0['email']:45} hotel={g0['hotel_id']} code={g0.get('access_code')}")
    print("\nDone.")
    client.close()


if __name__ == "__main__":
    main()
