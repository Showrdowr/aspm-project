from pydantic import BaseModel
from typing import Optional

# ข้อมูลที่รับมาตอนสมัครสมาชิก
class UserCreate(BaseModel):
    username: str
    email: str
    password: str

# ข้อมูลผู้ใช้ที่จะส่งกลับไปให้ Frontend (ไม่ส่ง password กลับไป)
class UserOut(BaseModel):
    id: int
    username: str
    email: str
    role: str

    class Config:
        orm_mode = True

# ข้อมูลตอน Login
class UserLogin(BaseModel):
    username: str
    password: str

class TestConfigCreate(BaseModel):
    test_type: str
    target_url: str
    virtual_users: int
    duration: int

class TestResultOut(BaseModel):
    id: int
    test_type: str
    target_url: str
    status: str
    avg_response_time: Optional[float] = 0
    error_rate: Optional[float] = 0

    cpu_usage: Optional[float] = 0
    memory_usage: Optional[float] = 0

