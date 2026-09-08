"""Simple hotel reservation referral tracking."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


class ReservationReferralIn(BaseModel):
    hotel_id: Optional[str] = None
    check_in_date: str
    check_out_date: str
    guest_count: int = Field(ge=1, le=20)
    room_type: str = Field(min_length=2, max_length=80)


class ReservationReferralOut(BaseModel):
    id: str
    hotel_id: str
    hotel_name: str
    guest_id: str
    check_in_date: str
    check_out_date: str
    guest_count: int
    room_type: str
    status: str
    redirect_url: str
    created_at: str


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def hotel_id_of(user: dict) -> str:
    hotel_id = user.get("hotel_id") or user.get("hotelId")
    if not hotel_id:
        raise HTTPException(403, "Kullanıcının otel kapsamı bulunamadı")
    return str(hotel_id)


def role_of(user: dict) -> str:
    return "hotel_manager" if user.get("role") == "admin" else str(user.get("role") or "")


def public_referral(doc: dict) -> ReservationReferralOut:
    created_at = doc["created_at"]
    if isinstance(created_at, datetime):
        created_at = created_at.astimezone(timezone.utc).isoformat()
    return ReservationReferralOut(
        id=doc["id"],
        hotel_id=doc["hotel_id"],
        hotel_name=doc["hotel_name"],
        guest_id=doc["guest_id"],
        check_in_date=doc["check_in_date"],
        check_out_date=doc["check_out_date"],
        guest_count=doc["guest_count"],
        room_type=doc["room_type"],
        status=doc["status"],
        redirect_url=doc["redirect_url"],
        created_at=created_at,
    )


def parse_dates(check_in_date: str, check_out_date: str) -> tuple[str, str]:
    try:
        check_in = datetime.strptime(check_in_date, "%Y-%m-%d").date()
        check_out = datetime.strptime(check_out_date, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(400, "Tarihler YYYY-MM-DD formatında olmalı") from exc
    if check_in < utc_now().date():
        raise HTTPException(400, "Giriş tarihi geçmişte olamaz")
    if check_out <= check_in:
        raise HTTPException(400, "Çıkış tarihi giriş tarihinden sonra olmalı")
    return check_in.isoformat(), check_out.isoformat()


async def ensure_indexes(db: Any) -> None:
    await db.reservation_referrals.create_index(
        [("hotel_id", 1), ("created_at", -1)], background=True
    )
    await db.reservation_referrals.create_index(
        [("guest_id", 1), ("created_at", -1)], background=True
    )


def register_routes(api: APIRouter, db: Any, get_current_user: Any) -> None:
    @api.post("/reservation-referrals", response_model=ReservationReferralOut)
    async def create_referral(
        body: ReservationReferralIn,
        user: dict = Depends(get_current_user),
    ):
        if role_of(user) != "guest":
            raise HTTPException(403, "Rezervasyon yönlendirmesini yalnızca misafir oluşturabilir")
        hotel_id = body.hotel_id or hotel_id_of(user)
        hotel = await db.hotels.find_one(
            {"id": hotel_id, "active": {"$ne": False}},
            {"_id": 0},
        )
        if not hotel:
            raise HTTPException(404, "Otel bulunamadı")
        redirect_url = str(hotel.get("reservation_url") or "").strip()
        if not redirect_url:
            raise HTTPException(409, "Otel resmi rezervasyon bağlantısını henüz tanımlamamış")
        if not redirect_url.lower().startswith("https://"):
            raise HTTPException(409, "Otel rezervasyon bağlantısı güvenli değil")
        check_in, check_out = parse_dates(body.check_in_date, body.check_out_date)
        now = utc_now()
        doc = {
            "id": str(uuid.uuid4()),
            "hotel_id": hotel_id,
            "hotelId": hotel_id,
            "hotel_name": hotel["hotel_name"],
            "guest_id": user["id"],
            "guest_name": user.get("name"),
            "check_in_date": check_in,
            "check_out_date": check_out,
            "guest_count": body.guest_count,
            "room_type": body.room_type.strip(),
            "status": "pending_request",
            "redirect_url": redirect_url,
            "source": "hospira",
            "created_at": now,
        }
        await db.reservation_referrals.insert_one(doc.copy())
        return public_referral(doc)

    @api.get("/reservation-referrals/me", response_model=list[ReservationReferralOut])
    async def my_referrals(user: dict = Depends(get_current_user)):
        if role_of(user) != "guest":
            raise HTTPException(403, "Sadece misafir")
        docs = await db.reservation_referrals.find(
            {"guest_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        return [public_referral(doc) for doc in docs]

    @api.get("/manager/reservation-referrals", response_model=list[ReservationReferralOut])
    async def manager_referrals(user: dict = Depends(get_current_user)):
        if role_of(user) != "hotel_manager":
            raise HTTPException(403, "Sadece Hotel Manager")
        docs = await db.reservation_referrals.find(
            {"$or": [{"hotel_id": hotel_id_of(user)}, {"hotelId": hotel_id_of(user)}]},
            {"_id": 0},
        ).sort("created_at", -1).to_list(500)
        return [public_referral(doc) for doc in docs]

    @api.get("/manager/reservation-referrals/stats")
    async def manager_referral_stats(user: dict = Depends(get_current_user)):
        if role_of(user) != "hotel_manager":
            raise HTTPException(403, "Sadece Hotel Manager")
        hotel_id = hotel_id_of(user)
        scope = {"$or": [{"hotel_id": hotel_id}, {"hotelId": hotel_id}]}
        total = await db.reservation_referrals.count_documents(scope)
        pipeline = [
            {"$match": scope},
            {"$group": {"_id": "$room_type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        by_room_type = {
            row["_id"]: row["count"]
            async for row in db.reservation_referrals.aggregate(pipeline)
        }
        return {"total_referrals": total, "by_room_type": by_room_type}
