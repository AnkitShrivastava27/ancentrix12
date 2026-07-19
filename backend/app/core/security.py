"""
Security — JWT-only authentication (no Firebase, no Firestore)

Flow:
  POST /auth/login {email, password}
  → bcrypt verify → return JWT (24h)
  → all requests: Authorization: Bearer <token>
  → get_current_user: decode JWT → load AdminUser from SQLite
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Header
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM   = "HS256"
TOKEN_HOURS = 24 * 7  # 7 days


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub":   user_id,
        "email": email,
        "exp":   datetime.utcnow() + timedelta(hours=TOKEN_HOURS),
        "iat":   datetime.utcnow(),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


async def get_current_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    from app.models.models import AdminUser

    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authorization header must start with 'Bearer '")

    token   = authorization[7:]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(401, "Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Invalid token payload")

    r    = await db.execute(select(AdminUser).where(AdminUser.id == user_id))
    user = r.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or inactive")

    return user

get_current_active_user = get_current_user