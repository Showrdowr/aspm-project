# Phase 5: Grafana Integration Guide

## ✅ สถานะปัจจุบัน

- [x] ติดตั้ง InfluxDB + Grafana (Docker)
- [x] เพิ่ม InfluxDB Data Source
- [x] Import k6 Dashboard (ID: 2587)
- [ ] ทดสอบ k6 พร้อมส่งข้อมูลไป InfluxDB
- [ ] ดูผลลัพธ์ใน Grafana

---

## 🧪 ทดสอบ k6 → InfluxDB → Grafana

### ขั้นตอนที่ 1: รัน k6 พร้อมส่งข้อมูลไป InfluxDB

```bash
cd c:\xampp\htdocs\NewProject\k6\scripts
k6 run --out influxdb=http://localhost:8086/k6 -e TARGET_URL=http://localhost:3000 --vus 10 --duration 30s load-test.js
```

**หมายเหตุ:**

- `--out influxdb=http://localhost:8086/k6` → ส่ง metrics ไป InfluxDB
- `-e TARGET_URL=...` → URL ที่ต้องการทดสอบ
- `--vus 10` → จำนวน Virtual Users
- `--duration 30s` → ระยะเวลาทดสอบ

---

### ขั้นตอนที่ 2: ดู Dashboard ใน Grafana

1. เปิด: **http://localhost:3001/d/k6-dashboard**
2. เลือก Time range ที่มุมขวาบน → **Last 5 minutes**
3. กด **Refresh** 🔄

---

## 🔧 แก้ไขปัญหาที่อาจเกิดขึ้น

### ปัญหา: "No data" ใน Dashboard

**สาเหตุที่ 1:** InfluxDB bucket ไม่ตรงกัน

```bash
# ตรวจสอบ bucket ใน InfluxDB
docker exec -it loadtest-influxdb influx bucket list
```

**สาเหตุที่ 2:** Data source ตั้งค่าไม่ถูก

- ไปที่ Connections → Data sources → InfluxDB
- ตรวจสอบ: Bucket = `k6`, Organization = `loadtest`

**สาเหตุที่ 3:** k6 ไม่ได้ใช้ `--out influxdb`

- ต้องเพิ่ม flag นี้ทุกครั้งที่รัน k6

---

## 📊 Dashboard Panels ที่ควรมี

| Panel               | Description                    |
| ------------------- | ------------------------------ |
| Virtual Users       | จำนวน VUs ที่ active           |
| Requests/sec        | จำนวน requests ต่อวินาที       |
| Response Time (p95) | 95th percentile response time  |
| Error Rate          | เปอร์เซ็นต์ของ failed requests |
| HTTP Duration       | Response time distribution     |

---

## 🔗 URLs สำคัญ

| Service                             | URL                                                   |
| ----------------------------------- | ----------------------------------------------------- |
| Grafana                             | http://localhost:3001                                 |
| InfluxDB                            | http://localhost:8086                                 |
| k6 Dashboard                        | http://localhost:3001/d/k6-dashboard                  |
| Dashboard (Kiosk mode สำหรับ embed) | http://localhost:3001/d/k6-dashboard?kiosk&theme=dark |
