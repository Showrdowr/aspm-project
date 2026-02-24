from locust import HttpUser, task, between, constant

class WebsiteUser(HttpUser):
    # ระยะเวลาพักระหว่างการยิงแต่ละครั้ง (เร็วขึ้นเพื่อให้ทดสอบตรง duration)
    wait_time = constant(0.1)  # รอ 0.1 วินาที (ยิงเร็วขึ้น)

    @task
    def index(self):
        # สั่งให้ยิง Request แบบ GET ไปที่หน้าแรก "/"
        self.client.get("/")