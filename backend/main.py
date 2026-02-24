from fastapi import FastAPI, HTTPException, Depends, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import bcrypt  # ใช้ bcrypt โดยตรงแทน passlib
from jose import JWTError, jwt
from datetime import datetime, timedelta
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import models, schemas
from database import engine, SessionLocal
import time
import random
import subprocess
import pandas as pd
import os
import asyncio
import json

# --- Configuration ---
SECRET_KEY = "my_super_secret_key_change_this_in_production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# --- Setup ---
models.Base.metadata.create_all(bind=engine)
app = FastAPI()

# Setup Security
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Helper Functions ---
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """ตรวจสอบรหัสผ่านกับ hash (bcrypt มี limit 72 bytes)"""
    password_bytes = plain_password.encode('utf-8')[:72]
    return bcrypt.checkpw(password_bytes, hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    """สร้าง hash จากรหัสผ่าน (bcrypt มี limit 72 bytes)"""
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- API Endpoints ---

@app.get("/")
def read_root():
    return {"status": "Online", "message": "Backend พร้อมทำงานแล้วครับ!"}

@app.get("/test-db")
def test_db_connection(db: Session = Depends(get_db)):
    return {"database": "Connected"}

@app.post("/register", response_model=schemas.UserOut)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # ตรวจสอบ username ซ้ำ
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username นี้ถูกใช้ไปแล้ว")
    
    # ตรวจสอบ email ซ้ำ
    db_email = db.query(models.User).filter(models.User.email == user.email).first()
    if db_email:
        raise HTTPException(status_code=400, detail="Email นี้ถูกใช้ไปแล้ว")
    
    hashed_password = get_password_hash(user.password)
    new_user = models.User(
        username=user.username,
        email=user.email,
        password_hash=hashed_password,
        role="user" 
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username หรือ Password ไม่ถูกต้อง",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "username": user.username, "role": user.role}

# API เริ่ม Load Test
@app.post("/test/start", response_model=schemas.TestResultOut)
def start_load_test(config: schemas.TestConfigCreate, 
                    current_user: str = Depends(oauth2_scheme),
                    db: Session = Depends(get_db)):
    
    user_id = 1 # (ในอนาคตค่อยแก้ให้ดึงจาก Token จริง)

    # 1. กำหนดชื่อไฟล์ผลลัพธ์ (CSV)
    output_filename = "test_result"
    
    # ลบไฟล์เก่าทิ้งก่อน (ถ้ามี) เพื่อไม่ให้ข้อมูลตีกัน
    if os.path.exists(f"{output_filename}_stats.csv"):
        os.remove(f"{output_filename}_stats.csv")

    # 2. สร้างคำสั่งสำหรับรัน Locust (Headless mode = ไม่ต้องเปิดหน้าเว็บ Locust)
    # รูปแบบ: locust -f locustfile.py --headless -u <users> -r <rate> -t <time> --host <url> --csv <output>
    command = [
        "locust",
        "-f", "locustfile.py",
        "--headless",
        "-u", str(config.virtual_users),    # จำนวน User จำลอง
        "-r", str(config.virtual_users),    # Spawn Rate (ปล่อย User ทั้งหมดออกมาทันที)
        "-t", f"{config.duration}s",        # ระยะเวลาทดสอบ
        "--host", config.target_url,        # URL เป้าหมาย
        "--csv", output_filename            # ชื่อไฟล์ผลลัพธ์
    ]

    print(f"🚀 Starting Real Load Test on: {config.target_url}")
    
    try:
        # สั่งรันคำสั่ง (จะรอจนกว่าจะเสร็จ)
        subprocess.run(command, check=True)
        
        # 3. อ่านผลลัพธ์จากไฟล์ CSV ที่ Locust สร้างให้
        # Locust จะสร้างไฟล์ชื่อ test_result_stats.csv
        csv_path = f"{output_filename}_stats.csv"
        
        if os.path.exists(csv_path):
            df = pd.read_csv(csv_path)
        
            # อ่านแถวสุดท้าย
            total_row = df[df["Name"] == "Aggregated"].iloc[0]
            
            req_count = float(total_row["Request Count"])
            fail_count = float(total_row["Failure Count"])
            
            # --- เพิ่ม Print เพื่อเช็คค่าใน Terminal ---
            print(f"DEBUG: Req={req_count}, Fail={fail_count}") 
            # ---------------------------------------

            if req_count > 0:
                real_avg_response = float(total_row["Average Response Time"])
                real_error_rate = (fail_count / req_count * 100)
                status_msg = "Completed"
            else:
                # ถ้าไม่มี Request เลย = พัง 100%
                print("DEBUG: No requests sent. Setting Error Rate to 100%")
                real_avg_response = 0
                real_error_rate = 100 
                status_msg = "Failed: Connection Error"
        else:
            # กรณีหาไฟล์ CSV ไม่เจอ
            real_avg_response = 0
            real_error_rate = 100
            status_msg = "Error: Report file not found"

    except Exception as e:
        print(f"Error running locust: {e}")
        real_avg_response = 0
        real_error_rate = 100  # แก้จาก 0 เป็น 100 เพื่อให้ Frontend รู้ว่าพัง
        status_msg = "Failed: Locust Error"

    # 4. บันทึกผลจริงลง Database
    new_test = models.TestHistory(
        user_id=user_id,
        test_type=config.test_type,
        target_url=config.target_url,
        virtual_users=config.virtual_users,
        duration=config.duration,
        avg_response_time=int(real_avg_response), # แปลงเป็น int ตามตาราง DB
        error_rate=int(real_error_rate)
    )
    db.add(new_test)
    db.commit()
    db.refresh(new_test)

    return {
        "id": new_test.id,
        "test_type": new_test.test_type,
        "target_url": new_test.target_url,
        "status": status_msg,
        "avg_response_time": new_test.avg_response_time,
        "error_rate": new_test.error_rate
    }

@app.get("/test/history", response_model=list[schemas.TestResultOut])
def get_test_history(
    target_url: str = Query(None, description="Filter by target URL"),
    current_user: str = Depends(oauth2_scheme), 
    db: Session = Depends(get_db)
):
    # ดึงข้อมูลจาก DB เรียงจากใหม่ไปเก่า
    query = db.query(models.TestHistory)
    
    # กรองตาม URL ถ้ามีการระบุ
    if target_url:
        query = query.filter(models.TestHistory.target_url == target_url)
    
    history = query.order_by(models.TestHistory.created_at.desc()).all()
    
    # แปลงข้อมูลเล็กน้อยเพื่อให้ตรงกับ Schema (เติม status ให้)
    results = []
    for h in history:
        results.append({
            "id": h.id,
            "test_type": h.test_type,
            "target_url": h.target_url,
            "virtual_users": h.virtual_users,
            "duration": h.duration,
            "avg_response_time": h.avg_response_time,
            "error_rate": h.error_rate,
            "status": "Completed"
        })
    return results


# ================== SSE REAL-TIME PROGRESS ==================

@app.get("/test/start-stream")
async def start_load_test_stream(
    target_url: str = Query(...),
    virtual_users: int = Query(10),
    duration: int = Query(5),
    test_type: str = Query("load"),
    token: str = Query(...)
):
    """
    SSE Endpoint สำหรับ Load Test แบบ Real-time
    ส่ง progress ทุกวินาทีจนกว่าจะเสร็จ
    """
    
    async def event_generator():
        # หา path ของ backend directory
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        
        output_filename = "test_result"
        # ใช้ absolute path สำหรับ CSV files
        history_csv = os.path.join(backend_dir, f"{output_filename}_stats_history.csv")
        stats_csv = os.path.join(backend_dir, f"{output_filename}_stats.csv")
        
        # ลบไฟล์เก่า
        for f in [stats_csv, history_csv, 
                  os.path.join(backend_dir, f"{output_filename}_failures.csv"), 
                  os.path.join(backend_dir, f"{output_filename}_exceptions.csv")]:
            if os.path.exists(f):
                os.remove(f)
        
        # สร้างคำสั่ง Locust
        command = [
            "locust",
            "-f", "locustfile.py",
            "--headless",
            "-u", str(virtual_users),
            "-r", str(virtual_users),
            "-t", f"{duration}s",
            "--host", target_url,
            "--csv", output_filename
        ]
        
        print(f"🚀 Starting Real-time Load Test on: {target_url}")
        print(f"📂 Working directory: {backend_dir}")
        print(f"📊 History CSV: {history_csv}")
        
        # รัน Locust แบบ non-blocking (ใช้ DEVNULL เพื่อไม่ให้ hang)
        process = subprocess.Popen(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=backend_dir
        )
        
        start_time = time.time()
        
        try:
            while process.poll() is None:  # ขณะที่ยังทำงานอยู่
                elapsed = int(time.time() - start_time)
                
                # อ่านข้อมูลจาก history CSV (ถ้ามี)
                current_rps = 0
                current_response = 0
                current_error = 0
                current_users = 0
                
                if os.path.exists(history_csv):
                    try:
                        df = pd.read_csv(history_csv)
                        if not df.empty:
                            last_row = df.iloc[-1]
                            current_users = int(last_row.get("User Count", 0))
                            current_rps = round(float(last_row.get("Requests/s", 0)), 2)
                            current_response = int(last_row.get("Total Average Response Time", 0))
                            total_req = int(last_row.get("Total Request Count", 0))
                            total_fail = int(last_row.get("Total Failure Count", 0))
                            if total_req > 0:
                                current_error = round((total_fail / total_req) * 100, 1)
                    except Exception as e:
                        print(f"Error reading history: {e}")
                
                # ส่ง progress event
                progress_data = {
                    "type": "progress",
                    "elapsed": elapsed,
                    "total": duration,
                    "percent": min(100, int((elapsed / duration) * 100)),
                    "current_users": current_users,
                    "requests_per_sec": current_rps,
                    "current_response_time": current_response,
                    "current_error_rate": current_error
                }
                
                yield f"data: {json.dumps(progress_data)}\n\n"
                await asyncio.sleep(1)
            
            # ทดสอบเสร็จแล้ว - อ่านผลสุดท้าย
            await asyncio.sleep(0.5)  # รอให้ไฟล์เขียนเสร็จ
            
            real_avg_response = 0
            real_error_rate = 0
            status_msg = "Completed"
            
            if os.path.exists(stats_csv):
                try:
                    df = pd.read_csv(stats_csv)
                    total_row = df[df["Name"] == "Aggregated"].iloc[0]
                    req_count = float(total_row["Request Count"])
                    fail_count = float(total_row["Failure Count"])
                    
                    if req_count > 0:
                        real_avg_response = float(total_row["Average Response Time"])
                        real_error_rate = (fail_count / req_count) * 100
                    else:
                        real_error_rate = 100
                        status_msg = "Failed: Connection Error"
                except Exception as e:
                    print(f"Error reading final stats: {e}")
                    real_error_rate = 100
                    status_msg = "Failed: Parse Error"
            else:
                real_error_rate = 100
                status_msg = "Error: Report file not found"
            
            # บันทึกลง DB
            db = SessionLocal()
            try:
                new_test = models.TestHistory(
                    user_id=1,
                    test_type=test_type,
                    target_url=target_url,
                    virtual_users=virtual_users,
                    duration=duration,
                    avg_response_time=int(real_avg_response),
                    error_rate=int(real_error_rate)
                )
                db.add(new_test)
                db.commit()
                db.refresh(new_test)
                test_id = new_test.id
            finally:
                db.close()
            
            # ส่ง final result
            final_data = {
                "type": "complete",
                "id": test_id,
                "test_type": test_type,
                "target_url": target_url,
                "status": status_msg,
                "avg_response_time": int(real_avg_response),
                "error_rate": int(real_error_rate)
            }
            
            yield f"data: {json.dumps(final_data)}\n\n"
            
        except Exception as e:
            print(f"SSE Error: {e}")
            error_data = {"type": "error", "message": str(e)}
            yield f"data: {json.dumps(error_data)}\n\n"
        
        finally:
            if process.poll() is None:
                process.terminate()
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*"
        }
    )