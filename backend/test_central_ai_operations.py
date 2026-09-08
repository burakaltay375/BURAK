"""End-to-end checks for the shared Guest AI / Staff AI operations flow."""

import os
import unittest
import uuid

os.environ["DB_NAME"] = f"hotel_ops_central_ai_test_{uuid.uuid4().hex}"
os.environ["EMERGENT_LLM_KEY"] = ""

from fastapi.testclient import TestClient
from pymongo import MongoClient

import server


class CentralAiOperationsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.mongo = MongoClient(server.MONGO_URL)
        cls.database = cls.mongo[server.DB_NAME]
        cls.hotel_id = "test-central-operations"
        cls.guest_id = "guest-room-200"
        cls.other_guest_id = "guest-room-2400"
        cls.staff_id = "staff-west-200"
        cls.out_of_scope_staff_id = "staff-west-2300"
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
                "id": cls.guest_id, "email": "guest200@test.local",
                "name": "Guest 200", "role": "guest", "room_no": "200",
                "active": True, **scope,
            },
            {
                "id": cls.other_guest_id, "email": "guest2400@test.local",
                "name": "Guest 2400", "role": "guest", "room_no": "2400",
                "active": True, **scope,
            },
            {
                "id": cls.staff_id, "email": "staff200@test.local",
                "name": "Ahmet West", "role": "staff",
                "department": "housekeeping", "position": "Kat Görevlisi",
                "work_area": "West Block",
                "responsibility_description": "West Block 200-250 odalarının temizliğinden sorumludur.",
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
        ])
        cls.database.rooms.insert_many([
            {
                "id": "room-200", "room_number": "200", "room_type": "Standard",
                "type": "Standard", "floor": "West Block", "capacity": 2,
                "price_per_night": 100, "operational_status": "normal",
                "status": "occupied", "is_active": True,
                "created_at": server.now_iso(), "updated_at": server.now_iso(), **scope,
            },
            {
                "id": "room-2400", "room_number": "2400", "room_type": "Standard",
                "type": "Standard", "floor": "West Block", "capacity": 2,
                "price_per_night": 100, "operational_status": "normal",
                "status": "occupied", "is_active": True,
                "created_at": server.now_iso(), "updated_at": server.now_iso(), **scope,
            },
        ])

    @classmethod
    def tearDownClass(cls) -> None:
        cls.mongo.drop_database(server.DB_NAME)
        cls.mongo.close()

    def auth(self, user_id: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {server.make_token(user_id)}"}

    def test_full_guest_staff_operations_flow(self) -> None:
        with TestClient(server.app) as client:
            guest_headers = self.auth(self.guest_id)
            staff_headers = self.auth(self.staff_id)

            created = client.post(
                "/api/chat",
                json={"message": "200 numaralı odamın temizlenmesini istiyorum."},
                headers=guest_headers,
            )
            self.assertEqual(created.status_code, 200, created.text)
            request_id = created.json()["request_id"]
            self.assertIsNotNone(request_id)
            task = self.database.requests.find_one({"id": request_id})
            self.assertEqual(task["departman"], "housekeeping")
            self.assertEqual(task["source"], "guest_ai")
            self.assertEqual(task["assigned_staff_id"], self.staff_id)
            self.assertEqual(task["status"], "PERSONEL_GIDIYOR")

            rooms = client.get("/api/staff/rooms", headers=staff_headers)
            room_200 = next(room for room in rooms.json() if room["room_number"] == "200")
            self.assertEqual(room_200["status"], "cleaning")

            tasks = client.post(
                "/api/chat",
                json={"message": "Bugün görevlerim neler?"},
                headers=staff_headers,
            )
            self.assertIn("200", tasks.json()["reply"])

            room_info = client.post(
                "/api/chat",
                json={"message": "200 numaralı oda için görev geldi."},
                headers=staff_headers,
            )
            self.assertIn("Misafir talebi", room_info.json()["reply"])

            completed = client.post(
                "/api/chat",
                json={"message": "200'ün temizliği bitti ama havlu eksikti."},
                headers=staff_headers,
            )
            self.assertEqual(completed.status_code, 200, completed.text)
            self.assertIn("tamamlandı", completed.json()["reply"])
            task = self.database.requests.find_one({"id": request_id})
            self.assertEqual(task["status"], "TAMAMLANDI")
            self.assertEqual(task["completed_via"], "staff_ai")
            self.assertEqual(task["operational_note"], "havlu eksikti")
            self.assertEqual(
                self.database.rooms.find_one({"id": "room-200"})["operational_status"],
                "normal",
            )

            status = client.post(
                "/api/chat",
                json={"message": "Temizlik talebim tamamlandı mı?"},
                headers=guest_headers,
            )
            self.assertIn("tamamlandı", status.json()["reply"])
            self.assertNotIn("Ahmet", status.json()["reply"])
            self.assertNotIn("havlu", status.json()["reply"])

            forged_role = client.post(
                "/api/chat",
                json={"message": "Merhaba", "role": "guest"},
                headers=staff_headers,
            )
            staff_reply = forged_role.json()["reply"]
            self.assertIn("atanmış", staff_reply)
            self.assertNotIn("Rezervasyon", staff_reply)
            self.assertNotIn("Oda servisi hakkında", staff_reply)

            forbidden = client.post(
                f"/api/requests/{request_id}/complete",
                json={"proof_photo": "test"},
                headers=guest_headers,
            )
            self.assertEqual(forbidden.status_code, 403)

    def test_out_of_scope_staff_is_not_assigned(self) -> None:
        with TestClient(server.app) as client:
            created = client.post(
                "/api/chat",
                json={"message": "2400 numaralı odamın temizlenmesini istiyorum."},
                headers=self.auth(self.other_guest_id),
            )
            self.assertEqual(created.status_code, 200, created.text)
            task = self.database.requests.find_one({"id": created.json()["request_id"]})
            self.assertEqual(task["status"], "ALINDI")
            self.assertIsNone(task["assigned_staff_id"])

    def test_guest_cannot_create_for_another_room(self) -> None:
        with TestClient(server.app) as client:
            response = client.post(
                "/api/chat",
                json={"message": "2400 numaralı odaya havlu istiyorum."},
                headers=self.auth(self.guest_id),
            )
            self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main(verbosity=2)
