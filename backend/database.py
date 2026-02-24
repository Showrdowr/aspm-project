from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# เชื่อมต่อ MySQL ของ XAMPP (User: root, Password: ว่าง, Port: 3306)
URL_DATABASE = "mysql+pymysql://root:@localhost:3306/performance_test_db"

engine = create_engine(URL_DATABASE)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()