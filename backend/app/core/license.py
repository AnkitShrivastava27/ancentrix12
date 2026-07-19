"""
License Manager — validates deployment license against remote license server.

Flow:
  Startup → load LicenseInfo from SQLite → call license server
  Every 24h → background re-validation
  Every call dispatch → license_manager.is_active() check

Grace period: if license server is unreachable, allow up to 7 days
since last successful verification before blocking.

License server response:
  {valid: bool, expires_at: ISO, tier: str, client_name: str,
   max_leads: int, max_calls_month: int, message: str}
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

GRACE_DAYS = 7


class LicenseManager:
    def __init__(self):
        self._valid:         bool             = False
        self._expires_at:    Optional[datetime] = None
        self._tier:          str              = "unknown"
        self._client_name:   str              = ""
        self._max_leads:     int              = 0
        self._max_calls:     int              = 0
        self._last_verified: Optional[datetime] = None
        self._message:       str              = "Not validated yet"

    # ── Public API ────────────────────────────────────────────────────────────

    def is_active(self) -> bool:
        """Called before every outbound call dispatch."""
        if self._valid and self._expires_at and datetime.utcnow() < self._expires_at:
            return True
        # Grace period — allow if last verified within 7 days
        if self._last_verified:
            grace_until = self._last_verified + timedelta(days=GRACE_DAYS)
            if datetime.utcnow() < grace_until:
                logger.warning("License server unreachable — operating in grace period")
                return True
        return False

    def status(self) -> dict:
        now = datetime.utcnow()
        days_left = None
        if self._expires_at:
            days_left = max(0, (self._expires_at - now).days)
        grace_until = None
        if not self._valid and self._last_verified:
            grace_until = (self._last_verified + timedelta(days=GRACE_DAYS)).isoformat()

        return {
            "valid":          self._valid,
            "active":         self.is_active(),
            "tier":           self._tier,
            "client_name":    self._client_name,
            "expires_at":     self._expires_at.isoformat() if self._expires_at else None,
            "days_remaining": days_left,
            "max_leads":      self._max_leads,
            "max_calls_month": self._max_calls,
            "last_verified":  self._last_verified.isoformat() if self._last_verified else None,
            "grace_until":    grace_until,
            "message":        self._message,
        }

    # ── Validation ────────────────────────────────────────────────────────────

    async def validate(self, license_key: str, server_url: str, domain: str) -> bool:
        """Call license server and update local state. Returns True if valid."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.post(f"{server_url}/validate", json={
                    "license_key": license_key,
                    "domain":      domain,
                    "version":     "2.0",
                })
            if r.status_code != 200:
                logger.warning(f"License server returned {r.status_code}")
                self._message = f"Server error: {r.status_code}"
                return False

            data = r.json()
            self._valid         = data.get("valid", False)
            self._tier          = data.get("tier", "unknown")
            self._client_name   = data.get("client_name", "")
            self._max_leads     = data.get("max_leads", 0)
            self._max_calls     = data.get("max_calls_month", 0)
            self._message       = data.get("message", "")
            exp = data.get("expires_at")
            if exp:
                self._expires_at = datetime.fromisoformat(exp.replace("Z", "+00:00")).replace(tzinfo=None)

            if self._valid:
                self._last_verified = datetime.utcnow()
                logger.info(f"License valid | tier={self._tier} | expires={self._expires_at} | client={self._client_name}")
            else:
                logger.warning(f"License invalid | message={self._message}")

            return self._valid

        except httpx.TimeoutException:
            logger.warning("License server timeout — using grace period")
            self._message = "License server unreachable (timeout)"
            return self.is_active()  # grace period
        except Exception as e:
            logger.warning(f"License validation error: {e} — using grace period")
            self._message = f"Validation error: {e}"
            return self.is_active()

    async def load_from_db(self) -> Optional["LicenseInfo"]:
        """Load persisted license info from SQLite on startup."""
        try:
            from app.core.database import AsyncSessionLocal
            from app.models.models import LicenseInfo
            from sqlalchemy import select
            async with AsyncSessionLocal() as db:
                r = await db.execute(select(LicenseInfo).where(LicenseInfo.id == 1))
                lic = r.scalar_one_or_none()
                if lic:
                    self._expires_at    = lic.expires_at
                    self._tier          = lic.tier or "unknown"
                    self._client_name   = lic.client_name or ""
                    self._max_leads     = lic.max_leads or 0
                    self._max_calls     = lic.max_calls_month or 0
                    self._last_verified = lic.last_verified_at
                    self._valid         = lic.is_valid or False
                    logger.info(f"License loaded from DB | expires={self._expires_at}")
                return lic
        except Exception as e:
            logger.warning(f"Could not load license from DB: {e}")
            return None

    async def save_to_db(self, license_key: str):
        """Persist validated license state to SQLite."""
        try:
            from app.core.database import AsyncSessionLocal
            from app.models.models import LicenseInfo
            from sqlalchemy import select
            async with AsyncSessionLocal() as db:
                r   = await db.execute(select(LicenseInfo).where(LicenseInfo.id == 1))
                lic = r.scalar_one_or_none()
                if not lic:
                    lic = LicenseInfo(id=1)
                    db.add(lic)
                lic.license_key      = license_key
                lic.client_name      = self._client_name
                lic.tier             = self._tier
                lic.expires_at       = self._expires_at
                lic.max_leads        = self._max_leads
                lic.max_calls_month  = self._max_calls
                lic.last_verified_at = self._last_verified
                lic.is_valid         = self._valid
                lic.updated_at       = datetime.utcnow()
                await db.commit()
        except Exception as e:
            logger.warning(f"Could not save license to DB: {e}")


# Singleton — imported everywhere
license_manager = LicenseManager()
