"""
Auth routes — JWT-only, no Firebase

Endpoints:
  POST /auth/setup        — first-run admin account creation (only if no users exist)
  POST /auth/login        — email + password → JWT token
  GET  /auth/me           — current user info
  POST /auth/change-password
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_token, get_current_user
from app.models.models import AdminUser

router = APIRouter()
logger = logging.getLogger(__name__)


class SetupRequest(BaseModel):
    email:      str
    password:   str
    full_name:  str
    license_key: str


class LoginRequest(BaseModel):
    email:    str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password:     str


# ── Setup (first run only) ────────────────────────────────────────────────────

@router.post("/setup")
async def setup(data: SetupRequest, db: AsyncSession = Depends(get_db)):
    """Create the first admin account. Blocked if any user already exists."""
    r     = await db.execute(select(func.count()).select_from(AdminUser))
    count = r.scalar()
    if count > 0:
        raise HTTPException(400, "Setup already completed. Use /auth/login.")

    if len(data.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")

    # Validate and activate license
    from app.core.license import license_manager
    from app.core.config import settings
    valid = await license_manager.validate(
        data.license_key,
        settings.LICENSE_SERVER_URL,
        settings.DEPLOYMENT_DOMAIN,
    )
    if not valid:
        status = license_manager.status()
        raise HTTPException(400, f"Invalid license key: {status.get('message', 'Validation failed')}")

    # Save license to DB
    await license_manager.save_to_db(data.license_key)

    # Write license key to .env
    _write_env_key("LICENSE_KEY", data.license_key)

    # Create admin user
    user = AdminUser(
        email           = data.email.lower().strip(),
        full_name       = data.full_name.strip(),
        hashed_password = hash_password(data.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_token(user.id, user.email)
    logger.info(f"Setup completed | admin={user.email}")
    return {
        "token":      token,
        "user":       _user_dict(user),
        "license":    license_manager.status(),
        "message":    "Setup complete! Welcome to AI Call Center.",
    }


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    r    = await db.execute(select(AdminUser).where(AdminUser.email == data.email.lower().strip()))
    user = r.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(401, "Invalid email or password.")
    if not user.is_active:
        raise HTTPException(401, "Account is disabled.")

    token = create_token(user.id, user.email)
    logger.info(f"Login OK | {user.email}")
    return {"token": token, "user": _user_dict(user)}


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me")
async def me(current_user=Depends(get_current_user)):
    from app.core.license import license_manager
    return {
        "user":    _user_dict(current_user),
        "license": license_manager.status(),
    }


# ── Change Password ───────────────────────────────────────────────────────────

@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(400, "Current password is incorrect.")
    if len(data.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters.")

    r    = await db.execute(select(AdminUser).where(AdminUser.id == current_user.id))
    user = r.scalar_one_or_none()
    user.hashed_password = hash_password(data.new_password)
    await db.commit()
    return {"message": "Password changed successfully."}


# ── Setup status (for frontend to check on load) ──────────────────────────────

@router.get("/setup-status")
async def setup_status(db: AsyncSession = Depends(get_db)):
    """Returns whether first-run setup has been completed."""
    r     = await db.execute(select(func.count()).select_from(AdminUser))
    count = r.scalar()
    return {"setup_complete": count > 0}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_dict(user: AdminUser) -> dict:
    return {
        "id":         user.id,
        "email":      user.email,
        "full_name":  user.full_name,
        "is_active":  user.is_active,
        "created_at": user.created_at,
    }


def _write_env_key(key: str, value: str):
    """Write/update a key in the .env file."""
    try:
        try:
            with open(".env", "r") as f:
                lines = f.readlines()
        except FileNotFoundError:
            lines = []

        found = False
        new_lines = []
        for line in lines:
            if line.startswith(f"{key}="):
                new_lines.append(f"{key}={value}\n")
                found = True
            else:
                new_lines.append(line)
        if not found:
            new_lines.append(f"{key}={value}\n")

        with open(".env", "w") as f:
            f.writelines(new_lines)
    except Exception as e:
        logger.warning(f"Could not write {key} to .env: {e}")
