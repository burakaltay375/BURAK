"""End-to-end checks for the shared Guest AI / Staff AI operations flow."""

import os
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
        cls.manager_id = f"manager-{suffix}"
        cls.room_204_id = f"room-204-{suffix}"
        cls.room_2400_id = f"room-2400-{suffix}"
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
                "name": "Ahmet West", "role": "staff",
                "department": "housekeeping", "position": "Kat Görevlisi",
                "work_area": "West Block",
                "responsibility_description": "West Block 200-250 odalarının temizliğinden sorumludur.",
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
                "id": cls.out_of_scope_staff_id, "email": "staff2300@test.local",
                "name": "Ayşe West", "role": "staff",
                "department": "housekeeping", "position": "Kat Görevlisi",
                "work_area": "West Block",
                "responsibility_description": "West Block 2300-2399 odalarının temizliğinden sorumludur.",
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
                "type": "Standard", "floor": "West Block", "capacity": 2,
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
                "employee_name": "Ahmet West", "department": "housekeeping",
                "date": server.hotel_local_now().date().isoformat(),
                "start_time": "00:00", "end_time": "23:59", "task": "West Block",
                "status": "Approved", "created_at": server.now_iso(),
                "updated_at": server.now_iso(), **scope,
            },
            {
                "id": f"shift-{cls.out_of_scope_staff_id}",
                "employee_id": cls.out_of_scope_staff_id,
                "employee_name": "Ayşe West", "department": "housekeeping",
                "date": server.hotel_local_now().date().isoformat(),
                "start_time": "00:00", "end_time": "23:59", "task": "West Block 2300",
                "status": "Approved", "created_at": server.now_iso(),
                "updated_at": server.now_iso(), **scope,
            },
        ])

    @classmethod
    def tearDownClass(cls) -> None:
        hotel_scope = {
            "$or": [{"hotel_id": cls.hotel_id}, {"hotelId": cls.hotel_id}],
        }
        cls.database.chat_messages.delete_many({
            "user_id": {"$in": [
                cls.guest_id, cls.other_guest_id, cls.staff_id,
                cls.ambiguous_staff_id, cls.manager_id,
            ]},
        })
        for collection in ("staff_schedules", "requests", "rooms", "users"):
            cls.database[collection].delete_many(hotel_scope)
        cls.database.hotels.delete_many({"id": cls.hotel_id})
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
        self.assertEqual(task["status"], "PERSONEL_GIDIYOR")

        _, rooms = self.request("GET", "/api/staff/rooms", self.staff_id)
        room_204 = next(room for room in rooms if room["room_number"] == "204")
        self.assertEqual(room_204["status"], "cleaning")

        _, tasks = self.request(
            "POST", "/api/chat", self.staff_id,
            {"message": "Bugün görevlerim neler?"},
        )
        self.assertIn("204", tasks["reply"])

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

    def test_supported_operation_types_and_internal_issue_isolation(self) -> None:
        cases = (
            ("204'te klima çalışmıyor.", "teknik_destek"),
            ("Odamda iki tane ekstra havlu istiyorum.", "housekeeping"),
            ("Mini barı doldurabilir misiniz?", "housekeeping"),
            ("Restorandan odama yemek gönderebilir misiniz?", "oda_servisi"),
            ("Televizyon çalışmıyor.", "teknik_destek"),
            ("Ekstra yastık istiyorum.", "housekeeping"),
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

    def test_guest_cannot_create_for_another_room(self) -> None:
        status_code, _ = self.request(
            "POST", "/api/chat", self.guest_id,
            {"message": "2400 numaralı odaya havlu istiyorum."},
        )
        self.assertEqual(status_code, 403)


if __name__ == "__main__":
    unittest.main(verbosity=2)
