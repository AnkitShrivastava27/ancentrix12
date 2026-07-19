"""
Company routes — v2 single-tenant
No owner_id — there is exactly one company per deployment.

Endpoints:
  GET    /company/                    — get company
  POST   /company/                    — create company
  PATCH  /company/                    — update company
  GET    /company/integration-status  — which API keys are configured (masked)
  PATCH  /company/integrations        — save API keys (encrypted in DB + .env)
"""
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Company

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ProductItem(BaseModel):
    name:        str
    description: str
    price:       str = "Contact us"
    features:    List[str] = []


class CompanyCreate(BaseModel):
    name:           str
    industry:       Optional[str] = None
    description:    Optional[str] = None
    website:        Optional[str] = None
    location:       Optional[str] = None
    contact_number: Optional[str] = None
    services:       Optional[str] = None
    faqs:           Optional[str] = None
    business_hours: Optional[dict] = None
    products:       Optional[List[ProductItem]] = None
    active_product: Optional[str] = None
    agent_name:     str = "Aria"
    voice_language: str = "en-IN"
    voice_gender:   str = "female"
    tts_provider:   str = "telnyx"
    inbound_system_prompt: Optional[str] = None
    outbound_sales_prompt: Optional[str] = None
    greeting_inbound:      Optional[str] = None
    greeting_outbound:     Optional[str] = None
    forward_number:        Optional[str] = None
    telnyx_phone_number:   Optional[str] = None


class CompanyUpdate(CompanyCreate):
    name: Optional[str] = None


class IntegrationsUpdate(BaseModel):
    telnyx_api_key:       Optional[str] = None
    telnyx_connection_id: Optional[str] = None
    telnyx_phone_number:  Optional[str] = None
    webhook_base_url:     Optional[str] = None
    deepgram_api_key:     Optional[str] = None
    groq_api_key:         Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _dict(c: Company) -> dict:
    return {
        "id":             c.id,
        "name":           c.name,
        "industry":       c.industry,
        "description":    c.description,
        "website":        c.website,
        "location":       c.location,
        "contact_number": c.contact_number,
        "services":       c.services,
        "faqs":           c.faqs,
        "business_hours": c.business_hours,
        "products":       c.products,
        "active_product": c.active_product,
        "agent_name":     c.agent_name,
        "voice_language": c.voice_language,
        "voice_gender":   c.voice_gender,
        "tts_provider":   c.tts_provider,
        "inbound_system_prompt": c.inbound_system_prompt,
        "outbound_sales_prompt": c.outbound_sales_prompt,
        "greeting_inbound":      c.greeting_inbound,
        "greeting_outbound":     c.greeting_outbound,
        "forward_number":        c.forward_number,
        "telnyx_phone_number":   c.telnyx_phone_number,
        "webhook_base_url":      c.webhook_base_url,
        "created_at":     c.created_at,
        "updated_at":     c.updated_at,
    }


def _mask(value: Optional[str]) -> str:
    """Return masked status — never send actual key to browser."""
    if not value or value.strip() == "":
        return "missing"
    return "set"


def _encrypt(value: str) -> str:
    """Simple XOR encryption — replace with Fernet in production if needed."""
    from app.core.config import settings
    key = settings.ENCRYPTION_KEY.encode()
    data = value.encode()
    encrypted = bytes(data[i] ^ key[i % len(key)] for i in range(len(data)))
    return encrypted.hex()


def _decrypt(hex_value: str) -> str:
    from app.core.config import settings
    key  = settings.ENCRYPTION_KEY.encode()
    data = bytes.fromhex(hex_value)
    return bytes(data[i] ^ key[i % len(key)] for i in range(len(data))).decode()


def _write_env_key(key: str, value: str):
    try:
        try:
            with open(".env", "r", encoding="utf-8") as f: lines = f.readlines()
        except FileNotFoundError:
            lines = []
        except UnicodeDecodeError:
            # Try reading with system encoding then convert
            with open(".env", "r", encoding="cp1252", errors="replace") as f: lines = f.readlines()
        found, new_lines = False, []
        for line in lines:
            if line.startswith(f"{key}="):
                new_lines.append(f"{key}={value}\n"); found = True
            else:
                new_lines.append(line)
        if not found:
            new_lines.append(f"{key}={value}\n")
        with open(".env", "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    except Exception as e:
        logger.warning(f"Could not write {key} to .env: {e}")


async def _get_company(db: AsyncSession) -> Optional[Company]:
    r = await db.execute(select(Company).limit(1))
    return r.scalar_one_or_none()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/")
async def get_company(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    company = await _get_company(db)
    if not company:
        return None
    return _dict(company)


@router.post("/")
async def create_company(
    data: CompanyCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if await _get_company(db):
        raise HTTPException(400, "Company already exists. Use PATCH to update.")

    products = [p.model_dump() for p in data.products] if data.products else []
    company  = Company(
        products=products,
        **{k: v for k, v in data.model_dump(exclude={"products"}).items() if v is not None},
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)
    logger.info(f"Company created | id={company.id} | name={company.name}")
    return _dict(company)


@router.patch("/")
async def update_company(
    data: CompanyUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    company = await _get_company(db)
    if not company:
        raise HTTPException(404, "Company not found. Create it first.")

    updates = data.model_dump(exclude_none=True, exclude={"products"})
    for k, v in updates.items():
        setattr(company, k, v)
    if data.products is not None:
        company.products = [p.model_dump() for p in data.products]
    company.updated_at = datetime.utcnow()
    await db.commit()
    return _dict(company)


@router.get("/integration-status")
async def integration_status(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns which API keys are configured — NEVER returns actual key values."""
    company = await _get_company(db)
    if not company:
        return {
            "telnyx_api_key":       "missing",
            "telnyx_connection_id": "missing",
            "telnyx_phone_number":  "missing",
            "webhook_base_url":     "missing",
            "deepgram_api_key":     "missing",
            "groq_api_key":         "missing",
        }
    return {
        "telnyx_api_key":       _mask(company.telnyx_api_key),
        "telnyx_connection_id": _mask(company.telnyx_connection_id),
        "telnyx_phone_number":  company.telnyx_phone_number or "",  # not secret
        "webhook_base_url":     company.webhook_base_url or "",     # not secret
        "deepgram_api_key":     _mask(company.deepgram_api_key),
        "groq_api_key":         _mask(company.groq_api_key),
    }


@router.patch("/integrations")
async def save_integrations(
    data: IntegrationsUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Save API keys to DB (encrypted) and .env file.
    Empty string = keep existing value. Non-empty = update.
    """
    company = await _get_company(db)
    if not company:
        raise HTTPException(404, "Create your company profile first.")

    updated = []

    # Telnyx API key (encrypted)
    if data.telnyx_api_key:
        company.telnyx_api_key = _encrypt(data.telnyx_api_key)
        _write_env_key("TELNYX_API_KEY", data.telnyx_api_key)
        updated.append("telnyx_api_key")

    # Telnyx connection ID
    if data.telnyx_connection_id:
        company.telnyx_connection_id = data.telnyx_connection_id
        _write_env_key("TELNYX_CONNECTION_ID", data.telnyx_connection_id)
        updated.append("telnyx_connection_id")

    # Telnyx phone number
    if data.telnyx_phone_number:
        company.telnyx_phone_number = data.telnyx_phone_number
        _write_env_key("TELNYX_PHONE_NUMBER", data.telnyx_phone_number)
        updated.append("telnyx_phone_number")

    # Webhook base URL
    if data.webhook_base_url:
        company.webhook_base_url = data.webhook_base_url.rstrip("/")
        _write_env_key("TELNYX_WEBHOOK_BASE_URL", company.webhook_base_url)
        updated.append("webhook_base_url")

    # Deepgram key (encrypted)
    if data.deepgram_api_key:
        company.deepgram_api_key = _encrypt(data.deepgram_api_key)
        _write_env_key("DEEPGRAM_API_KEY", data.deepgram_api_key)
        updated.append("deepgram_api_key")

    # Groq key (encrypted)
    if data.groq_api_key:
        company.groq_api_key = _encrypt(data.groq_api_key)
        _write_env_key("GROQ_API_KEY", data.groq_api_key)
        updated.append("groq_api_key")

    company.updated_at = datetime.utcnow()
    await db.commit()
    logger.info(f"Integrations updated: {updated}")

    return {
        "message": f"Saved: {', '.join(updated) if updated else 'nothing changed'}",
        "updated": updated,
        "status":  await integration_status(current_user, db),
    }