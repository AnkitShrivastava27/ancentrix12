"""
Database models — v2 White-Label Edition
Removed: User (replaced by AdminUser), EmailLog, UserPlan
Added:   AdminUser, LicenseInfo
Extended: Company with API key fields + webhook_base_url
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, Float, Integer, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


def _uuid():
    return str(uuid.uuid4())


# ── Admin User (single admin per deployment) ──────────────────────────────────

class AdminUser(Base):
    """Single administrator account per deployment.
    Created via the first-run setup wizard at /setup.
    """
    __tablename__ = "admin_users"
    id              = Column(String, primary_key=True, default=_uuid)
    email           = Column(String, unique=True, index=True, nullable=False)
    full_name       = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── License ───────────────────────────────────────────────────────────────────

class LicenseInfo(Base):
    """Single row — license status for this deployment.
    Validated against the remote license server on startup and every 24h.
    """
    __tablename__ = "license_info"
    id               = Column(Integer, primary_key=True, default=1)
    license_key      = Column(String, nullable=False)
    client_name      = Column(String)
    tier             = Column(String, default="pro")       # starter | pro | enterprise
    activated_at     = Column(DateTime)
    expires_at       = Column(DateTime)
    max_leads        = Column(Integer, default=10000)
    max_calls_month  = Column(Integer, default=5000)
    last_verified_at = Column(DateTime)                    # last successful server check
    is_valid         = Column(Boolean, default=False)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Company ───────────────────────────────────────────────────────────────────

class Company(Base):
    """Single company per deployment (no owner_id — single tenant)."""
    __tablename__ = "companies"
    id = Column(String, primary_key=True, default=_uuid)

    # Identity
    name           = Column(String, nullable=False)
    industry       = Column(String)
    description    = Column(Text)
    website        = Column(String)
    location       = Column(String)
    contact_number = Column(String)

    # Knowledge
    services       = Column(Text)
    faqs           = Column(Text)
    business_hours = Column(JSON)

    # Products
    products       = Column(JSON, default=list)
    active_product = Column(String)

    # AI Agent
    agent_name     = Column(String, default="Aria")
    voice_language = Column(String, default="en-IN")
    voice_gender   = Column(String, default="female")
    tts_provider   = Column(String, default="telnyx")

    # Prompts
    inbound_system_prompt  = Column(Text)
    outbound_sales_prompt  = Column(Text)
    greeting_inbound       = Column(Text)
    greeting_outbound      = Column(Text)

    # Transfer
    forward_number = Column(String)

    # ── Telnyx (stored in DB, loaded into runtime settings) ──────────────────
    telnyx_phone_number  = Column(String)   # DID in E.164
    telnyx_connection_id = Column(String)   # TeXML App ID
    telnyx_api_key       = Column(String)   # encrypted at rest
    webhook_base_url     = Column(String)   # https://yourdomain.com

    # ── Other API keys (encrypted at rest) ───────────────────────────────────
    deepgram_api_key = Column(String)
    groq_api_key     = Column(String)

    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    leads               = relationship("Lead",              back_populates="company")
    call_logs           = relationship("CallLog",           back_populates="company")
    batches             = relationship("Batch",             back_populates="company")
    schedules           = relationship("Schedule",          back_populates="company")
    knowledge_documents = relationship("KnowledgeDocument", back_populates="company")


# ── Lead ──────────────────────────────────────────────────────────────────────

class Lead(Base):
    __tablename__ = "leads"
    id         = Column(String, primary_key=True, default=_uuid)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)

    name  = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    email = Column(String)

    status         = Column(String, default="new")
    interest_level = Column(Float, default=0.0)
    source         = Column(String, default="manual")

    key_info  = Column(JSON, default=dict)
    notes     = Column(Text)
    language  = Column(String, default="hinglish")
    timezone  = Column(String, default="Asia/Kolkata")

    call_attempts     = Column(Integer, default=0)
    last_called_at    = Column(DateTime)
    scheduled_call_at = Column(DateTime)

    campaign_name = Column(String)
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company     = relationship("Company",   back_populates="leads")
    call_logs   = relationship("CallLog",   back_populates="lead")
    batch_leads = relationship("BatchLead", back_populates="lead")


# ── Call Log ──────────────────────────────────────────────────────────────────

class CallLog(Base):
    __tablename__ = "call_logs"
    id         = Column(String, primary_key=True, default=_uuid)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    lead_id    = Column(String, ForeignKey("leads.id"), nullable=True)

    direction = Column(String, default="inbound")
    status    = Column(String, default="queued")
    mode      = Column(String, default="support")

    from_number     = Column(String)
    to_number       = Column(String)
    call_control_id = Column(String, unique=True, index=True)

    started_at       = Column(DateTime)
    ended_at         = Column(DateTime)
    duration_seconds = Column(Integer, default=0)

    conversation_history = Column(JSON, default=list)
    transcript           = Column(Text)
    summary              = Column(Text)
    sentiment            = Column(String)
    intent               = Column(String)
    lead_status_after    = Column(String)
    recording_url        = Column(String)
    transferred_to_human = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="call_logs")
    lead    = relationship("Lead",    back_populates="call_logs")


# ── Batch & Schedule ──────────────────────────────────────────────────────────

class Batch(Base):
    __tablename__ = "batches"
    id         = Column(String, primary_key=True, default=_uuid)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)

    name            = Column(String, nullable=False)
    description     = Column(Text)
    batch_type      = Column(String, nullable=False)   # voice
    filter_criteria = Column(JSON, default=dict)
    lead_count      = Column(Integer, default=0)

    status          = Column(String, default="draft")
    leads_processed = Column(Integer, default=0)
    leads_succeeded = Column(Integer, default=0)
    leads_failed    = Column(Integer, default=0)

    campaign_name = Column(String)
    product_focus = Column(String)
    call_mode     = Column(String, default="sales")

    started_at   = Column(DateTime)
    completed_at = Column(DateTime)
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company     = relationship("Company",   back_populates="batches")
    schedules   = relationship("Schedule",  back_populates="batch")
    batch_leads = relationship("BatchLead", back_populates="batch")


class BatchLead(Base):
    __tablename__ = "batch_leads"
    id       = Column(String, primary_key=True, default=_uuid)
    batch_id = Column(String, ForeignKey("batches.id"), nullable=False)
    lead_id  = Column(String, ForeignKey("leads.id"),   nullable=False)

    processed    = Column(Boolean, default=False)
    processed_at = Column(DateTime)
    result       = Column(String)

    batch = relationship("Batch", back_populates="batch_leads")
    lead  = relationship("Lead",  back_populates="batch_leads")


class Schedule(Base):
    __tablename__ = "schedules"
    id         = Column(String, primary_key=True, default=_uuid)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    batch_id   = Column(String, ForeignKey("batches.id"),   nullable=False)

    start_datetime    = Column(DateTime, nullable=False)
    end_datetime      = Column(DateTime)
    window_start_time = Column(String, default="09:00")
    window_end_time   = Column(String, default="18:00")
    base_timezone     = Column(String, default="Asia/Kolkata")
    use_lead_timezone = Column(Boolean, default=True)
    allowed_days      = Column(JSON, default=lambda: ["Monday","Tuesday","Wednesday","Thursday","Friday"])
    max_per_hour          = Column(Integer, default=10)
    delay_between_seconds = Column(Integer, default=30)
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company",  back_populates="schedules")
    batch   = relationship("Batch",    back_populates="schedules")


# ── Knowledge Base ────────────────────────────────────────────────────────────

class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"
    id         = Column(String, primary_key=True, default=_uuid)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)

    filename    = Column(String, nullable=False)
    file_type   = Column(String)
    file_path   = Column(String)
    file_size   = Column(Integer)
    status      = Column(String, default="pending")
    chunks_count = Column(Integer, default=0)
    error_msg   = Column(String)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="knowledge_documents")
