"""End-to-end checks for the shared Guest AI / Staff AI operations flow."""

import os
import asyncio
import json
import unittest
import urllib.error
import urllib.request
import uuid

from pymongo import MongoClient

import server


class CentralAiOperationsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.base_url = "http://127.0.0.1:18080"
        cls.mongo = MongoClient(server.MONGO_URL)
        cls.database = cls.mongo[server.DB_NAME]
        urllib.request.urlopen(f"{cls.base_url}/api/hotels/active", timeout=5).read()
        suffix = uuid.uuid4().hex
        cls.hotel_id = f"test-central-operations-{suffix}"
        cls.guest_id = f"guest-room-204-{suffix}"
        cls.other_guest_id = f"guest-room-2400-{suffix}"
        cls.staff_id = f"staff-west-204-{suffix}"
        cls.out_of_scope_staff_id = f"staff-west-2300-{suffix}"
        cls.ambiguous_staff_id = f"staff-ambiguous-{suffix}"
        cls.empty_scope_staff_id = f"staff-empty-scope-{suffix}"
        cls.no_shift_staff_id = f"staff-no-shift-{suffix}"
        cls.manager_id = f"manager-{suffix}"
        cls.room_204_id = f"room-204-{suffix}"
        cls.room_2400_id = f"room-2400-{suffix}"
        cls.hotel_ids = [cls.hotel_id]
        cls.user_ids = [
            cls.guest_id, cls.other_guest_id, cls.staff_id,
            cls.out_of_scope_staff_id, cls.ambiguous_staff_id,
            cls.empty_scope_staff_id, cls.no_shift_staff_id, cls.manager_id,
        ]
        scope = {"hotel_id": cls.hotel_id, "hotelId": cls.hotel_id}
        cls.database.hotels.insert_one({
            "id": cls.hotel_id,
            "hotel_name": "Central Operations Test Hotel",
            "city": "Istanbul",
            "active": True,
            "services": server.default_services(),
            **scope,
        })
        cls.database.users.insert_many([
            {
                "id": cls.guest_id, "email": "guest204@test.local",
                "name": "Guest 204", "role": "guest", "room_no": "204",
                "active": True, **scope,
            },
            {
                "id": cls.other_guest_id, "email": "guest2400@test.local",
                "name": "Guest 2400", "role": "guest", "room_no": "2400",
                "active": True, **scope,
            },
            {
                "id": cls.staff_id, "email": "staff204@test.local",
                "name": "melih", "role": "staff",
                "department": "housekeeping", "position": "Kat Görevlisi",
                "work_area": "2. kat",
                "responsibility_description": "200 ile 300 arası odaların temizliğinden sorumludur.",
                "active": True, **scope,
            },
            {
                "id": cls.ambiguous_staff_id, "email": "ambiguous@test.local",
                "name": "Ali Supervisor", "role": "staff",
                "department": "housekeeping", "position": "Kat Şefi",
                "work_area": "Sağ blok",
                "responsibility_description": "Temizlikçilerin vardiyalarını düzenler, gerektiğinde yardım eder.",
                "active": True, **scope,
            },
            {
                "id": cls.empty_scope_staff_id, "email": "empty@test.local",
                "name": "Empty Scope", "role": "staff",
                "department": "housekeeping", "position": "Kat Görevlisi",
                "work_area": None, "responsibility_description": None,
                "active": True, **scope,
            },
            {
                "id": cls.no_shift_staff_id, "email": "noshift@test.local",
                "name": "No Shift", "role": "staff",
                "department": "housekeeping", "position": "Kat Görevlisi",
                "work_area": "2. kat",
                "responsibility_description": "200-300 numaralı odalar",
                "active": True, **scope,
            },
            {
                "id": cls.out_of_scope_staff_id, "email": "staff2300@test.local",
                "name": "Ayşe West", "role": "staff",
                "department": "housekeeping", "position": "Kat Görevlisi",
                "work_area": "2. kat",
                "responsibility_description": "301-400 numaralı odaların temizliğinden sorumludur.",
                "active": True, **scope,
            },
            {
                "id": cls.manager_id, "email": "manager@test.local",
                "name": "Operations Manager", "role": "hotel_manager",
                "active": True, **scope,
            },
        ])
        cls.database.rooms.insert_many([
            {
                "id": cls.room_204_id, "room_number": "204", "room_type": "Standard",
                "type": "Standard", "floor": "2", "capacity": 2,
                "price_per_night": 100, "operational_status": "normal",
                "status": "occupied", "is_active": True,
                "created_at": server.now_iso(), "updated_at": server.now_iso(), **scope,
            },
            {
                "id": cls.room_2400_id, "room_number": "2400", "room_type": "Standard",
                "type": "Standard", "floor": "West Block", "capacity": 2,
                "price_per_night": 100, "operational_status": "normal",
                "status": "occupied", "is_active": True,
                "created_at": server.now_iso(), "updated_at": server.now_iso(), **scope,
            },
        ])
        cls.database.staff_schedules.insert_many([
            {
                "id": f"shift-{cls.staff_id}", "employee_id": cls.staff_id,
                "employee_name": "melih", "department": "housekeeping",
                "date": server.hotel_local_now().date().isoformat(),
                "start_time": "00:00", "end_time": "23:59", "task": "2. kat",
                "status": "Approved", "created_at": server.now_iso(),
                "updated_at": server.now_iso(), **scope,
            },
            {
                "id": f"shift-{cls.out_of_scope_staff_id}",
                "employee_id": cls.out_of_scope_staff_id,
                "employee_name": "Ayşe West", "department": "housekeeping",
                "date": server.hotel_local_now().date().isoformat(),
                "start_time": "00:00", "end_time": "23:59", "task": "2. kat",
                "status": "Approved", "created_at": server.now_iso(),
                "updated_at": server.now_iso(), **scope,
            },
            {
                "id": f"shift-{cls.empty_scope_staff_id}",
                "employee_id": cls.empty_scope_staff_id,
                "employee_name": "Empty Scope", "department": "housekeeping",
                "date": server.hotel_local_now().date().isoformat(),
                "start_time": "00:00", "end_time": "23:59", "task": "2. kat",
                "status": "Approved", "created_at": server.now_iso(),
                "updated_at": server.now_iso(), **scope,
            },
        ])

    @classmethod
    def tearDownClass(cls) -> None:
        hotel_scope = {"$or": [
            {"hotel_id": {"$in": cls.hotel_ids}},
            {"hotelId": {"$in": cls.hotel_ids}},
        ]}
        cls.database.chat_messages.delete_many({
            "user_id": {"$in": cls.user_ids},
        })
        for collection in ("staff_schedules", "requests", "rooms", "users"):
            cls.database[collection].delete_many(hotel_scope)
        cls.database.hotels.delete_many({"id": {"$in": cls.hotel_ids}})
        cls.mongo.close()

    def auth(self, user_id: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {server.make_token(user_id)}"}

    def request(
        self,
        method: str,
        path: str,
        user_id: str,
        payload: dict | None = None,
    ) -> tuple[int, dict]:
        body = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=body,
            method=method,
            headers={"Content-Type": "application/json", **self.auth(user_id)},
        )
        try:
            response = urllib.request.urlopen(request, timeout=10)
            return response.status, json.loads(response.read())
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read())

    def seed_tenant(
        self,
        label: str,
        room_number: str,
        floor: str,
        staff_scopes: list[tuple[str, str, str]],
    ) -> tuple[str, str, dict[str, str]]:
        suffix = uuid.uuid4().hex
        hotel_id = f"tenant-{label}-{suffix}"
        guest_id = f"guest-{label}-{suffix}"
        scope = {"hotel_id": hotel_id, "hotelId": hotel_id}
        self.hotel_ids.append(hotel_id)
        self.user_ids.append(guest_id)
        self.database.hotels.insert_one({
            "id": hotel_id, "hotel_name": f"Tenant {label}", "city": "Istanbul",
            "active": True, "services": server.default_services(), **scope,
        })
        self.database.users.insert_one({
            "id": guest_id, "email": f"guest-{suffix}@test.local",
            "name": f"Guest {label}", "role": "guest", "room_no": room_number,
            "active": True, **scope,
        })
        self.database.rooms.insert_one({
            "id": f"room-{suffix}", "room_number": room_number,
            "room_type": "Standard", "type": "Standard", "floor": floor,
            "capacity": 2, "price_per_night": 100,
            "operational_status": "normal", "status": "occupied",
            "is_active": True, "created_at": server.now_iso(),
            "updated_at": server.now_iso(), **scope,
        })
        staff_ids: dict[str, str] = {}
        for name, work_area, responsibility in staff_scopes:
            staff_id = f"staff-{name.lower()}-{suffix}"
            staff_ids[name] = staff_id
            self.user_ids.append(staff_id)
            self.database.users.insert_one({
                "id": staff_id, "email": f"{name.lower()}-{suffix}@test.local",
                "name": name, "role": "staff", "department": "housekeeping",
                "position": "Kat Görevlisi", "work_area": work_area,
                "responsibility_description": responsibility,
                "active": True, **scope,
            })
            self.database.staff_schedules.insert_one({
                "id": f"shift-{staff_id}", "employee_id": staff_id,
                "employee_name": name, "department": "housekeeping",
                "date": server.hotel_local_now().date().isoformat(),
                "start_time": "00:00", "end_time": "23:59",
                "task": work_area, "status": "Approved",
                "created_at": server.now_iso(), "updated_at": server.now_iso(),
                **scope,
            })
        return hotel_id, guest_id, staff_ids

    def test_assignment_candidate_security_and_invalid_ai_id(self) -> None:
        request_id = f"invalid-ai-{uuid.uuid4().hex}"
        scope = {"hotel_id": self.hotel_id, "hotelId": self.hotel_id}
        request_doc = {
            "id": request_id,
            "guest_id": self.guest_id,
            "guest_name": "Guest 204",
            "room_no": "204",
            "room_area": "2. kat 204 Standard oda",
            "room_type": "Standard",
            "departman": "housekeeping",
            "hizmet_turu": "Housekeeping",
            "zaman": "Şimdi",
            "detay": "204 numaralı odanın temizlenmesini istiyorum.",
            "oncelik": "ORTA",
            "status": "ALINDI",
            "created_at": server.now_iso(),
            "updated_at": server.now_iso(),
            **scope,
        }
        self.database.requests.insert_one(request_doc.copy())

        async def run_checks() -> tuple[list[str], object]:
            candidates = await server._safe_assignment_candidates(request_doc)
            candidate_ids = [candidate["staff"]["id"] for candidate in candidates]
            original = server.call_assignment_ai

            async def invalid_ai(_request: dict, _candidates: list[dict]) -> dict:
                return {
                    "recommended_staff_id": "invented-cross-tenant-id",
                    "confidence": 0.99,
                    "reason": "invalid",
                    "candidate_analysis": [],
                }

            server.call_assignment_ai = invalid_ai
            try:
                selected = await server.assign_request_to_best_staff(request_doc)
            finally:
                server.call_assignment_ai = original
            return candidate_ids, selected

        candidate_ids, selected = asyncio.run(run_checks())
        self.assertEqual(candidate_ids, [self.staff_id])
        self.assertIsNone(selected)
        stored = self.database.requests.find_one({"id": request_id})
        self.assertEqual(stored["status"], "ALINDI")
        self.assertIsNone(stored.get("assigned_staff_id"))

    def test_full_guest_staff_operations_flow(self) -> None:
        status_code, created = self.request(
            "POST", "/api/chat", self.guest_id,
            {"message": "204 numaralı odanın temizlenmesini istiyorum."},
        )
        self.assertEqual(status_code, 200, created)
        request_id = created["request_id"]
        self.assertIsNotNone(request_id)
        task = self.database.requests.find_one({"id": request_id})
        self.assertEqual(task["departman"], "housekeeping")
        self.assertEqual(task["source"], "guest_ai")
        self.assertEqual(task["assigned_staff_id"], self.staff_id)
        self.assertEqual(task["assigned_staff_name"], "melih")
        self.assertEqual(task["assignment_source"], "secure_workload_fallback")
        self.assertEqual(task["status"], "PERSONEL_GIDIYOR")

        _, rooms = self.request("GET", "/api/staff/rooms", self.staff_id)
        room_204 = next(room for room in rooms if room["room_number"] == "204")
        self.assertEqual(room_204["status"], "cleaning")

        _, tasks = self.request(
            "POST", "/api/chat", self.staff_id,
            {"message": "Bugün görevlerim neler?"},
        )
        self.assertIn("204", tasks["reply"])
        for task_question in ("görevim varmı", "görev varmı yokmu"):
            _, task_answer = self.request(
                "POST", "/api/chat", self.staff_id,
                {"message": task_question},
            )
            self.assertIn("1 aktif görev var", task_answer["reply"])
            self.assertIn("204", task_answer["reply"])

        _, room_info = self.request(
            "POST", "/api/chat", self.staff_id,
            {"message": "204 numaralı oda için görev geldi."},
        )
        self.assertIn("Misafir talebi", room_info["reply"])

        _, room_status = self.request(
            "POST", "/api/chat", self.staff_id,
            {"message": "204 numara ne durumda?"},
        )
        self.assertIn("Oda 204", room_status["reply"])
        self.assertIn("PERSONEL_GIDIYOR", room_status["reply"])

        status_code, completed = self.request(
            "POST", "/api/chat", self.staff_id,
            {"message": "204'ü tamamladım."},
        )
        self.assertEqual(status_code, 200, completed)
        self.assertIn("tamamlandı", completed["reply"])
        task = self.database.requests.find_one({"id": request_id})
        self.assertEqual(task["status"], "TAMAMLANDI")
        self.assertEqual(task["completed_via"], "staff_ai")
        self.assertEqual(
            self.database.rooms.find_one({"id": self.room_204_id})["operational_status"],
            "normal",
        )

        _, status = self.request(
            "POST", "/api/chat", self.guest_id,
            {"message": "Temizlik tamamlandı mı?"},
        )
        self.assertEqual(
            status["reply"],
            "204 numaralı odanızın temizlik talebi tamamlandı.",
        )
        self.assertNotIn("Ahmet", status["reply"])
        self.assertNotIn("havlu", status["reply"])

        _, forged_role = self.request(
            "POST", "/api/chat", self.staff_id,
            {"message": "Merhaba", "role": "guest"},
        )
        staff_reply = forged_role["reply"]
        self.assertIn("atanmış", staff_reply)
        self.assertNotIn("Rezervasyon", staff_reply)
        self.assertNotIn("Oda servisi hakkında", staff_reply)

        forbidden_code, _ = self.request(
            "POST", f"/api/requests/{request_id}/complete", self.guest_id,
            {"proof_photo": "test"},
        )
        self.assertEqual(forbidden_code, 403)

    def test_general_multi_turn_guest_operational_state(self) -> None:
        cases = (
            ("Ek havlu istiyorum.", "204", "housekeeping", None),
            ("Ek yastık istiyorum.", "305", "housekeeping", None),
            ("Klima çalışmıyor.", "412", "teknik_destek", None),
            ("3 havlu istiyorum.", "508", "housekeeping", 3),
        )
        for initial_message, room_number, department, quantity in cases:
            suffix = uuid.uuid4().hex
            guest_id = (
                self.guest_id
                if room_number == "204"
                else f"guest-state-{room_number}-{suffix}"
            )
            session_id = f"session-state-{suffix}"
            scope = {"hotel_id": self.hotel_id, "hotelId": self.hotel_id}
            if room_number != "204":
                self.user_ids.append(guest_id)
                self.database.users.insert_one({
                    "id": guest_id,
                    "email": f"state-{room_number}-{suffix}@test.local",
                    "name": f"State Guest {room_number}",
                    "role": "guest",
                    "room_no": room_number,
                    "active": True,
                    **scope,
                })
                self.database.rooms.insert_one({
                    "id": f"room-state-{room_number}-{suffix}",
                    "room_number": room_number,
                    "room_type": "Standard",
                    "type": "Standard",
                    "floor": room_number[:-2] or "1",
                    "capacity": 2,
                    "price_per_night": 100,
                    "operational_status": "normal",
                    "status": "occupied",
                    "is_active": True,
                    "created_at": server.now_iso(),
                    "updated_at": server.now_iso(),
                    **scope,
                })

            first_code, first = self.request(
                "POST", "/api/chat", guest_id,
                {"message": initial_message, "session_id": session_id},
            )
            self.assertEqual(first_code, 200, first)
            self.assertFalse(first["ready"], first)
            self.assertIsNone(first["request_id"], first)
            self.assertIn("oda numaranızı", first["reply"].lower())
            state_doc = self.database.chat_messages.find_one(
                {"session_id": session_id, "user_id": guest_id, "role": "assistant"},
                sort=[("created_at", -1)],
            )
            pending = state_doc["pending_request"]
            self.assertEqual(pending["departman"], department)
            self.assertEqual(pending["missing_required_fields"], ["room_no"])
            self.assertEqual(pending.get("quantity"), quantity)

            second_code, second = self.request(
                "POST", "/api/chat", guest_id,
                {"message": room_number, "session_id": session_id},
            )
            self.assertEqual(second_code, 200, second)
            self.assertTrue(second["ready"], second)
            task = self.database.requests.find_one({"id": second["request_id"]})
            self.assertEqual(task["room_no"], room_number)
            self.assertEqual(task["departman"], department)
            self.assertEqual(task["guest_id"], guest_id)
            self.assertEqual(task["hotel_id"], self.hotel_id)
            self.assertEqual(task.get("quantity"), quantity)

        direct_code, direct = self.request(
            "POST", "/api/chat", self.guest_id,
            {"message": "204 numaralı odaya 2 havlu istiyorum."},
        )
        self.assertEqual(direct_code, 200, direct)
        self.assertTrue(direct["ready"], direct)
        direct_task = self.database.requests.find_one({"id": direct["request_id"]})
        self.assertEqual(direct_task["room_no"], "204")
        self.assertEqual(direct_task["quantity"], 2)

        topic_session = f"topic-change-{uuid.uuid4().hex}"
        self.request(
            "POST", "/api/chat", self.guest_id,
            {"message": "Ek havlu istiyorum.", "session_id": topic_session},
        )
        before = self.database.requests.count_documents({"guest_id": self.guest_id})
        _, changed = self.request(
            "POST", "/api/chat", self.guest_id,
            {"message": "Bugün hava nasıl?", "session_id": topic_session},
        )
        self.assertFalse(changed["ready"], changed)
        self.assertEqual(
            self.database.requests.count_documents({"guest_id": self.guest_id}),
            before,
        )
        last_assistant = self.database.chat_messages.find_one(
            {"session_id": topic_session, "user_id": self.guest_id, "role": "assistant"},
            sort=[("created_at", -1)],
        )
        self.assertNotIn("pending_request", last_assistant)

    def test_out_of_scope_staff_is_not_assigned(self) -> None:
        status_code, created = self.request(
            "POST", "/api/chat", self.other_guest_id,
            {"message": "2400 numaralı odamın temizlenmesini istiyorum."},
        )
        self.assertEqual(status_code, 200, created)
        task = self.database.requests.find_one({"id": created["request_id"]})
        self.assertEqual(task["status"], "ALINDI")
        self.assertIsNone(task["assigned_staff_id"])

    def test_off_shift_then_on_shift_assignment(self) -> None:
        current = server.hotel_local_now()
        if current.hour < 12:
            off_start, off_end = "20:00", "21:00"
        else:
            off_start, off_end = "00:00", "01:00"
        self.database.staff_schedules.update_one(
            {"id": f"shift-{self.staff_id}"},
            {"$set": {"start_time": off_start, "end_time": off_end}},
        )
        status_code, off_shift_created = self.request(
            "POST", "/api/chat", self.guest_id,
            {"message": "204 numaralı odanın temizlenmesini istiyorum."},
        )
        self.assertEqual(status_code, 200, off_shift_created)
        off_shift_task = self.database.requests.find_one({
            "id": off_shift_created["request_id"],
        })
        self.assertEqual(off_shift_task["status"], "ALINDI")
        self.assertIsNone(off_shift_task["assigned_staff_id"])

        self.database.staff_schedules.update_one(
            {"id": f"shift-{self.staff_id}"},
            {"$set": {"start_time": "00:00", "end_time": "23:59"}},
        )
        status_code, on_shift_created = self.request(
            "POST", "/api/chat", self.guest_id,
            {"message": "204 numaralı odanın temizlenmesini istiyorum."},
        )
        self.assertEqual(status_code, 200, on_shift_created)
        on_shift_task = self.database.requests.find_one({
            "id": on_shift_created["request_id"],
        })
        self.assertEqual(on_shift_task["status"], "PERSONEL_GIDIYOR")
        self.assertEqual(on_shift_task["assigned_staff_id"], self.staff_id)

    def test_overnight_shift_covers_next_calendar_day(self) -> None:
        overnight = {
            "date": "2026-09-08",
            "start_time": "22:00",
            "end_time": "06:00",
        }
        at_night = server.datetime(
            2026, 9, 8, 23, 30, tzinfo=server.HOTEL_TIMEZONE
        )
        after_midnight = server.datetime(
            2026, 9, 9, 2, 30, tzinfo=server.HOTEL_TIMEZONE
        )
        after_shift = server.datetime(
            2026, 9, 9, 7, 0, tzinfo=server.HOTEL_TIMEZONE
        )
        self.assertTrue(server._schedule_covers_local_time(overnight, at_night))
        self.assertTrue(server._schedule_covers_local_time(overnight, after_midnight))
        self.assertFalse(server._schedule_covers_local_time(overnight, after_shift))

    def test_multi_tenant_dynamic_assignment(self) -> None:
        hotel_b, guest_b, staff_b = self.seed_tenant(
            "b", "75", "1",
            [
                ("Personel C", "1. kat", "1-50 numaralı odalar"),
                ("Personel D", "1. kat", "51 ile 150 arası odalar"),
            ],
        )
        _, response_b = self.request(
            "POST", "/api/chat", guest_b,
            {"message": "75 numaralı odanın temizlenmesini istiyorum."},
        )
        task_b = self.database.requests.find_one({
            "id": response_b["request_id"],
        })
        self.assertEqual(task_b["hotel_id"], hotel_b)
        self.assertEqual(task_b["assigned_staff_id"], staff_b["Personel D"])

        hotel_c, guest_c, staff_c = self.seed_tenant(
            "c", "10", "B Block",
            [
                ("Personel E", "A blok", "A blok standart odalar"),
                ("Personel F", "B blok", "B blok standart odalar"),
            ],
        )
        _, response_c = self.request(
            "POST", "/api/chat", guest_c,
            {"message": "10 numaralı odanın temizlenmesini istiyorum."},
        )
        task_c = self.database.requests.find_one({
            "id": response_c["request_id"],
        })
        self.assertEqual(task_c["hotel_id"], hotel_c)
        self.assertEqual(task_c["assigned_staff_id"], staff_c["Personel F"])
        self.assertNotIn(task_c["assigned_staff_id"], set(staff_b.values()))

    def test_supported_operation_types_and_internal_issue_isolation(self) -> None:
        cases = (
            ("204'te klima çalışmıyor.", "teknik_destek"),
            ("204 numaralı odama iki tane ekstra havlu istiyorum.", "housekeeping"),
            ("204 numaralı odanın mini barını doldurabilir misiniz?", "housekeeping"),
            ("Restorandan 204 numaralı odama yemek gönderebilir misiniz?", "oda_servisi"),
            ("204 numaralı odada televizyon çalışmıyor.", "teknik_destek"),
            ("204 numaralı odama ekstra yastık istiyorum.", "housekeeping"),
        )
        latest_housekeeping_id = None
        for message, department in cases:
            status_code, created = self.request(
                "POST", "/api/chat", self.guest_id, {"message": message},
            )
            self.assertEqual(status_code, 200, (message, created))
            task = self.database.requests.find_one({"id": created["request_id"]})
            self.assertEqual(task["departman"], department, message)
            if department == "housekeeping":
                latest_housekeeping_id = task["id"]

        status_code, reported = self.request(
            "POST", "/api/chat", self.staff_id,
            {"message": "204'te havlu eksik, tamamlayamadım."},
        )
        self.assertEqual(status_code, 200, reported)
        issue_task = self.database.requests.find_one({"id": latest_housekeeping_id})
        self.assertEqual(issue_task["status"], "PERSONEL_GIDIYOR")
        self.assertEqual(issue_task["issue_status"], "OPEN")

        _, manager_tasks = self.request(
            "GET", "/api/admin/requests", self.manager_id,
        )
        manager_task = next(item for item in manager_tasks if item["id"] == latest_housekeeping_id)
        self.assertEqual(manager_task["issue_status"], "OPEN")
        self.assertIn("tamamlayamadım", manager_task["operational_note"])

        _, guest_tasks = self.request("GET", "/api/requests/me", self.guest_id)
        guest_task = next(item for item in guest_tasks if item["id"] == latest_housekeeping_id)
        self.assertNotIn("issue_status", guest_task)
        self.assertNotIn("operational_note", guest_task)
        self.assertNotIn("assigned_staff_id", guest_task)
        self.assertNotIn("assigned_staff_name", guest_task)
        self.assertNotIn("proof_photo", guest_task)

    def test_scope_parser_natural_language_variants(self) -> None:
        request_doc = {
            "departman": "housekeeping",
            "room_no": "204",
            "room_area": "2. kat B Block Standard oda",
            "room_type": "Standard",
            "hizmet_turu": "Housekeeping",
            "detay": "204 numaralı odanın temizliği",
        }
        valid_scopes = (
            ("Odalar", "200-300 numaralı odalar"),
            ("Odalar", "200 ile 300 arası odalar"),
            ("Odalar", "200, 204, 208 numaralı odalar"),
            ("2. kat", "Bu kattaki odalar"),
            ("B blok", "B blok operasyonları"),
            ("Standart odalar", "Standart odaların temizliği"),
        )
        for work_area, responsibility in valid_scopes:
            staff = {
                "department": "housekeeping",
                "work_area": work_area,
                "responsibility_description": responsibility,
            }
            compatible, reason = server.staff_request_scope_compatibility(
                staff, request_doc
            )
            self.assertTrue(compatible, (work_area, responsibility, reason))

        for work_area, responsibility in (
            ("", ""),
            ("Sağ blok", "Gerektiğinde yardım eder"),
            ("A blok", "A blok standart odalar"),
            ("3. kat", "Bu kattaki odalar"),
        ):
            staff = {
                "department": "housekeeping",
                "work_area": work_area,
                "responsibility_description": responsibility,
            }
            compatible, _ = server.staff_request_scope_compatibility(
                staff, request_doc
            )
            self.assertFalse(compatible, (work_area, responsibility))

    def test_guest_cannot_create_for_another_room(self) -> None:
        status_code, _ = self.request(
            "POST", "/api/chat", self.guest_id,
            {"message": "2400 numaralı odaya havlu istiyorum."},
        )
        self.assertEqual(status_code, 403)


if __name__ == "__main__":
    unittest.main(verbosity=2)
