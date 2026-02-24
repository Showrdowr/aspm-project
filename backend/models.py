from sqlalchemy import Column, Integer, String, DateTime
from database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    email = Column(String(100), unique=True, index=True)
    password_hash = Column(String(255)) # เก็บ password ที่เข้ารหัสแล้ว
    role = Column(String(20), default="user") # user หรือ admin
    created_at = Column(DateTime, default=datetime.utcnow)

class TestHistory(Base):
    __tablename__ = "test_histories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    test_type = Column(String(50))
    target_url = Column(String(255))
    virtual_users = Column(Integer)
    duration = Column(Integer)
    avg_response_time = Column(Integer, nullable=True)
    error_rate = Column(Integer, nullable=True)

    cpu_usage = Column(Integer, nullable=True)    # เก็บ % CPU
    memory_usage = Column(Integer, nullable=True) # เก็บ % Memory
    
    created_at = Column(DateTime, default=datetime.utcnow)