from db import Base
from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import relationship


class Problem(Base):
    __tablename__ = "problems"
    id = Column(Integer, primary_key=True)
    title = Column(String(250))
    description = Column(String(1000))
    date_created = Column(DateTime(timezone=True), server_default=func.now())
    image_url = Column(String(250), nullable=True)
    status = Column(String(250), default="В обробці")

    user_id = Column(Integer, ForeignKey("users.id"))
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # адміністратор, що взяв у роботу

    user = relationship("User", foreign_keys=[user_id], back_populates="problems")
    admin = relationship("User", foreign_keys=[admin_id],back_populates="assigned_problems")

    response = relationship("AdminResponse", back_populates="problem", uselist=False)
    service_record = relationship("ServiceRecord", back_populates="problem", uselist=False)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, index=True)
    password = Column(String(255))
    email = Column(String(100), unique=True, index=True)
    is_admin = Column(Boolean, default=False)
    is_verified = Column(Boolean, default=False)
    telegram_id = Column(BigInteger, unique=True, index=True, nullable=True)

    problems = relationship("Problem", foreign_keys=[Problem.user_id],back_populates="user")
    assigned_problems = relationship("Problem", foreign_keys=[Problem.admin_id], back_populates="admin")
    responses = relationship("AdminResponse", back_populates="admin")
    service_record = relationship("ServiceRecord", back_populates="user")

class AdminResponse(Base):
    __tablename__ = "admin_responses"
    id = Column(Integer, primary_key=True)
    message = Column(String(1000))
    date_responded = Column(DateTime(timezone=True), server_default=func.now())

    admin_id = Column(Integer, ForeignKey("users.id"))
    problem_id = Column(Integer, ForeignKey("problems.id"))

    admin = relationship("User", back_populates="responses")
    problem = relationship("Problem", back_populates="response")

class ServiceRecord(Base):
    __tablename__ = "service_records"
    id = Column(Integer, primary_key=True)
    work_done = Column(String(1000))
    date_completed = Column(DateTime(timezone=True), server_default=func.now())
    used_parts = Column(JSON)
    warranty_info = Column(String(1000))

    problem_id = Column(Integer, ForeignKey("problems.id"))
    user_id = Column(Integer, ForeignKey("users.id"))

    problem = relationship("Problem", back_populates="service_record")
    user = relationship("User", back_populates="service_record")
