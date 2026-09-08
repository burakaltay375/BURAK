"""End-to-end checks for the shared Guest AI / Staff AI operations flow."""

import os
import json
import subprocess
import sys
import time
import unittest
import urllib.error
import urllib.request
import uuid

os.environ["DB_NAME"] = f"hotel_ops_central_ai_test_{uuid.uuid4().hex}"
os.environ["EMERGENT_LLM_KEY"] = ""

from pymongo import MongoClient

import server


class CentralAiOperationsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.base_url = "http://127.0.0.1:18191"
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
        cls.server_process = subprocess.Popen(
            [
                sys.executable, "-m", "uvicorn", "server:app",
                "--host", "127.0.0.1", "--port", "18191",
            ],
            cwd=os.path.dirname(__file__),
            env=os.environ.copy(),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        for _ in range(200):
            try:
                urllib.request.urlopen(f"{cls.base_url}/api/hotels/active", timeout=1).read()
                break
            except (urllib.error.URLError, TimeoutError):
                time.sleep(0.1)
        else:
            cls.server_process.terminate()
            output, _ = cls.server_process.communicate(timeout=10)
            raise RuntimeError(f"Test Uvicorn server could not start:\n{output}")

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server_process.terminate()
        cls.server_process.wait(timeout=10)
        cls.mongo.drop_database(server.DB_NAME)
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
            {"message": "200 numaralı odamın temizlenmesini istiyorum."},
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
        room_200 = next(room for room in rooms if room["room_number"] == "200")
        self.assertEqual(room_200["status"], "cleaning")

        _, tasks = self.request(
            "POST", "/api/chat", self.staff_id,
            {"message": "Bugün görevlerim neler?"},
        )
        self.assertIn("200", tasks["reply"])

        _, room_info = self.request(
            "POST", "/api/chat", self.staff_id,
            {"message": "200 numaralı oda için görev geldi."},
        )
        self.assertIn("Misafir talebi", room_info["reply"])

        status_code, completed = self.request(
            "POST", "/api/chat", self.staff_id,
            {"message": "200'ün temizliği bitti ama havlu eksikti."},
        )
        self.assertEqual(status_code, 200, completed)
        self.assertIn("tamamlandı", completed["reply"])
        task = self.database.requests.find_one({"id": request_id})
        self.assertEqual(task["status"], "TAMAMLANDI")
        self.assertEqual(task["completed_via"], "staff_ai")
        self.assertEqual(task["operational_note"], "havlu eksikti")
        self.assertEqual(
            self.database.rooms.find_one({"id": "room-200"})["operational_status"],
            "normal",
        )

        _, status = self.request(
            "POST", "/api/chat", self.guest_id,
            {"message": "Temizlik talebim tamamlandı mı?"},
        )
        self.assertIn("tamamlandı", status["reply"])
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

    def test_guest_cannot_create_for_another_room(self) -> None:
        status_code, _ = self.request(
            "POST", "/api/chat", self.guest_id,
            {"message": "2400 numaralı odaya havlu istiyorum."},
        )
        self.assertEqual(status_code, 403)


if __name__ == "__main__":
    unittest.main(verbosity=2)
