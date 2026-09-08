#!/usr/bin/env python3
"""Hospira MongoDB veritabanını Test Otelim verileriyle yeniden oluşturur.

UYARI: Hedef veritabanındaki bütün koleksiyonları kalıcı olarak siler.

Kullanım:
  python reset_seed_test_data.py --dry-run
  python reset_seed_test_data.py --confirm-reset hotel_ops
"""

from __future__ import annotations

import argparse
import os
import random
import secrets
import string
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import bcrypt
from dotenv import load_dotenv
from pymongo import MongoClient


ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "hotel_ops")

HOTEL_ID = "default-hotel"
HOTEL_NAME = "Test Otelim"
HOTEL_EMAIL = "testoteladim@gmail.com"
HOTEL_CODE = "TEST001"
PASSWORD = "Test12345!"
RNG = random.Random(1001)

SERVICE_KEYS = (
    "spa", "luggage", "valet", "room_service", "restaurant", "bar", "pool",
    "fitness", "turkish_bath", "sauna", "airport_transfer", "vip", "kids_club",
    "meeting_room", "laundry", "concierge",
)

# Yeni rol sistemi oluşturulmaz. Pozisyonlar mevcut staff + department yapısına eşlenir.
TEST_ACCOUNTS = (
    ("Admin", "testadmin@gmail.com", "system_admin", None),
    ("Hotel Manager", "testmanager@gmail.com", "hotel_manager", None),
    ("Reception", "testreception@gmail.com", "staff", "concierge"),
    ("Housekeeping Supervisor", "testhousekeeping@gmail.com", "staff", "housekeeping"),
    ("Housekeeping", "testhousekeeper@gmail.com", "staff", "housekeeping"),
    ("Waiter", "testwaiter@gmail.com", "staff", "oda_servisi"),
    ("Chef", "testchef@gmail.com", "staff", "oda_servisi"),
    ("Bartender", "testbartender@gmail.com", "staff", "oda_servisi"),
    ("Valet", "testvalet@gmail.com", "staff", "vale"),
    ("Bellboy", "testbellboy@gmail.com", "staff", "concierge"),
    ("Maintenance", "testmaintenance@gmail.com", "staff", "teknik_destek"),
    ("Security", "testsecurity@gmail.com", "staff", "concierge"),
    ("Accounting", "testaccounting@gmail.com", "staff", "concierge"),
    ("Guest", "testguest@gmail.com", "guest", None),
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def access_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(6))


def build_user(
    position: str,
    email: str,
    role: str,
    department: str | None,
    password_hash: str,
) -> dict[str, Any]:
    hotel_id = None if role == "system_admin" else HOTEL_ID
    return {
        "id": new_id(),
        "email": email,
        "password_hash": password_hash,
        "name": f"Test {position}",
        "role": role,
        "department": department,
        "position": position,
        "room_no": "101" if role == "guest" else None,
        "hotel_id": hotel_id,
        "hotelId": hotel_id,
        "guest_type": "standard" if role == "guest" else None,
        "access_code": access_code() if role == "guest" else None,
        "active": True,
        "created_at": now_iso(),
    }


def build_rooms() -> list[dict[str, Any]]:
    room_types = ("Standard", "Standard", "Deluxe", "Family", "Suite")
    rooms = []
    for index in range(20):
        floor = index // 5 + 1
        number = f"{floor}{index % 5 + 1:02d}"
        room_type = room_types[index % len(room_types)]
        rooms.append({
            "id": new_id(),
            "room_number": number,
            "room_name": f"{number} {room_type}",
            "room_type": room_type,
            "type": room_type,
            "floor": str(floor),
            "capacity": 4 if room_type == "Family" else 2,
            "price_per_night": 3500 + index * 250,
            "operational_status": "normal",
            "status": "occupied" if index < 7 else "available",
            "is_active": True,
            "description": f"{HOTEL_NAME} test odası",
            "hotel_id": HOTEL_ID,
            "hotelId": HOTEL_ID,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })
    return rooms


def build_guests(password_hash: str, room_numbers: list[str]) -> list[dict[str, Any]]:
    guests = []
    for index in range(2, 11):
        room_no = room_numbers[index - 1]
        guests.append({
            "id": new_id(),
            "email": f"testguest{index:02d}@gmail.com",
            "password_hash": password_hash,
            "name": f"Test Misafir {index:02d}",
            "role": "guest",
            "department": None,
            "position": "Guest",
            "room_no": room_no,
            "hotel_id": HOTEL_ID,
            "hotelId": HOTEL_ID,
            "guest_type": "standard",
            "access_code": access_code(),
            "stay_status": "checked_in",
            "active": True,
            "created_at": now_iso(),
        })
    return guests


def build_reservations(guests: list[dict[str, Any]], rooms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    today = date.today()
    reservations = []
    for index, (guest, room) in enumerate(zip(guests, rooms)):
        check_in = today - timedelta(days=index % 3)
        check_out = today + timedelta(days=2 + index % 4)
        reservations.append({
            "id": new_id(),
            "customer_name": guest["name"],
            "customer_email": guest["email"],
            "room_id": room["id"],
            "room_number": room["room_number"],
            "room_name": room["room_name"],
            "check_in_date": check_in.isoformat(),
            "check_out_date": check_out.isoformat(),
            "price_per_night": room["price_per_night"],
            "total_nights": (check_out - check_in).days,
            "total_price": room["price_per_night"] * (check_out - check_in).days,
            "hotel_id": HOTEL_ID,
            "hotelId": HOTEL_ID,
            "payment_status": "paid" if index < 7 else "pending",
            "status": "checked_in" if index < 7 else "pending",
            "user_id": guest["id"],
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })
    return reservations


def request_doc(
    guest: dict[str, Any],
    department: str,
    service: str,
    detail: str,
    service_key: str | None = None,
) -> dict[str, Any]:
    return {
        "id": new_id(),
        "guest_id": guest["id"],
        "guest_name": guest["name"],
        "room_no": guest["room_no"],
        "hotel_id": HOTEL_ID,
        "hotelId": HOTEL_ID,
        "departman": department,
        "service_key": service_key,
        "hizmet_turu": service,
        "zaman": f"{RNG.randint(9, 20):02d}:00",
        "detay": detail,
        "oncelik": "YUKSEK" if department == "teknik_destek" else "ORTA",
        "status": "ALINDI",
        "assigned_staff_id": None,
        "assigned_staff_name": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }


def build_requests(guests: list[dict[str, Any]]) -> list[dict[str, Any]]:
    specs = (
        ("housekeeping", "Oda Temizliği", "Odanın günlük temizliği yapılsın.", None),
        ("housekeeping", "Nevresim Değişimi", "Nevresim ve havlular değiştirilsin.", None),
        ("housekeeping", "Mini Bar Kontrolü", "Mini bar kontrol edilsin.", None),
        ("oda_servisi", "Restoran Siparişi", "Izgara menü ve içecek.", "restaurant"),
        ("oda_servisi", "Restoran Siparişi", "Makarna ve salata.", "restaurant"),
        ("oda_servisi", "Oda Servisi", "Kahvaltı tabağı ve kahve.", "room_service"),
        ("oda_servisi", "Oda Servisi", "Akşam yemeği odaya gönderilsin.", "room_service"),
        ("vale", "Vale Talebi", "Araç otoparktan getirilsin.", "valet"),
        ("vale", "Vale Talebi", "Araç teslim alınsın.", "valet"),
        ("teknik_destek", "Bakım Talebi", "Klima soğutmuyor.", None),
        ("teknik_destek", "Bakım Talebi", "Banyo lambası çalışmıyor.", None),
    )
    return [
        request_doc(guests[index % len(guests)], *spec)
        for index, spec in enumerate(specs)
    ]


def build_seed() -> dict[str, Any]:
    password_hash = hash_password(PASSWORD)
    accounts = [
        build_user(position, email, role, department, password_hash)
        for position, email, role, department in TEST_ACCOUNTS
    ]
    manager = next(user for user in accounts if user["role"] == "hotel_manager")
    rooms = build_rooms()
    primary_guest = next(user for user in accounts if user["role"] == "guest")
    extra_guests = build_guests(password_hash, [room["room_number"] for room in rooms])
    guests = [primary_guest, *extra_guests]
    primary_guest["stay_status"] = "checked_in"
    hotel = {
        "id": HOTEL_ID,
        "hotel_name": HOTEL_NAME,
        "email": HOTEL_EMAIL,
        "hotel_code": HOTEL_CODE,
        "city": "İstanbul",
        "address": "Sultanahmet, Fatih, İstanbul",
        "latitude": 41.0054,
        "longitude": 28.9768,
        "active": True,
        "manager_id": manager["id"],
        "services": {key: True for key in SERVICE_KEYS},
        "created_at": now_iso(),
    }
    return {
        "hotels": [hotel],
        "users": [*accounts, *extra_guests],
        "rooms": rooms,
        "reservations": build_reservations(guests, rooms),
        "requests": build_requests(guests),
    }


def print_plan(seed: dict[str, Any]) -> None:
    print(f"MongoDB: {MONGO_URL} / {DB_NAME}")
    print(f"Otel: {HOTEL_NAME} / {HOTEL_EMAIL} / {HOTEL_CODE}")
    for collection, docs in seed.items():
        print(f"{collection}: {len(docs)}")
    for user in seed["users"][:len(TEST_ACCOUNTS)]:
        suffix = f" / {user['department']}" if user.get("department") else ""
        print(f"  {user['position']}{suffix}: {user['email']}")


def verify_seed(db, seed: dict[str, Any]) -> None:
    for collection, docs in seed.items():
        actual = db[collection].count_documents({})
        if actual != len(docs):
            raise RuntimeError(f"{collection}: beklenen {len(docs)}, bulunan {actual}")
    for user in db.users.find({}, {"password_hash": 1, "email": 1}):
        if not bcrypt.checkpw(PASSWORD.encode(), user["password_hash"].encode()):
            raise RuntimeError(f"Şifre doğrulaması başarısız: {user['email']}")
    if db.users.count_documents({"role": "system_admin"}) != 1:
        raise RuntimeError("System admin rol doğrulaması başarısız.")
    if db.users.count_documents({"role": "hotel_manager", "hotel_id": HOTEL_ID}) != 1:
        raise RuntimeError("Hotel manager rol doğrulaması başarısız.")
    invalid_staff = db.users.count_documents({
        "role": "staff",
        "department": {"$nin": ["concierge", "housekeeping", "oda_servisi", "vale", "teknik_destek"]},
    })
    if invalid_staff:
        raise RuntimeError("Geçersiz staff departman eşlemesi bulundu.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Hospira Test Otelim reset/seed")
    parser.add_argument("--confirm-reset", metavar="DB_NAME")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    seed = build_seed()
    print_plan(seed)
    if args.dry_run:
        print("Dry-run tamamlandı; veri değiştirilmedi.")
        return
    if args.confirm_reset != DB_NAME:
        parser.error(f"Yıkıcı işlem için: --confirm-reset {DB_NAME}")

    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=8000)
    try:
        client.admin.command("ping")
        client.drop_database(DB_NAME)
        db = client[DB_NAME]
        for collection, docs in seed.items():
            db[collection].insert_many(docs, ordered=True)
        db.users.create_index("email", unique=True)
        db.hotels.create_index("id", unique=True)
        verify_seed(db, seed)
        print("Reset, seed ve veritabanı doğrulaması başarılı.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
