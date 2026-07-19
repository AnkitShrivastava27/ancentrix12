"""
AI Call Center v2 — White-Label Edition
No Firebase. No Firestore. JWT auth. License server validation.
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import create_tables

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.CHROMADB_LOCAL_PATH, exist_ok=True)

    await create_tables()
    logger.info("Database tables ready")

    # ── License validation ────────────────────────────────────────────────────
    from app.core.license import license_manager
    await license_manager.load_from_db()

    if settings.LICENSE_KEY:
        valid = await license_manager.validate(
            settings.LICENSE_KEY,
            settings.LICENSE_SERVER_URL,
            settings.DEPLOYMENT_DOMAIN,
        )
        if valid:
            await license_manager.save_to_db(settings.LICENSE_KEY)
            logger.info(f"License validated | tier={license_manager.status()['tier']} | expires={license_manager.status()['expires_at']}")
        else:
            logger.warning(f"License validation failed — {license_manager.status()['message']}")
            if license_manager.is_active():
                logger.warning("Operating in grace period")
            else:
                logger.error("LICENSE INVALID — call dispatch will be blocked")
    else:
        logger.warning("No LICENSE_KEY set — run /setup to activate")

    # ── Schedule 24h license re-check ────────────────────────────────────────
    async def _license_background():
        while True:
            await asyncio.sleep(86400)  # 24 hours
            if settings.LICENSE_KEY:
                await license_manager.validate(
                    settings.LICENSE_KEY,
                    settings.LICENSE_SERVER_URL,
                    settings.DEPLOYMENT_DOMAIN,
                )
                await license_manager.save_to_db(settings.LICENSE_KEY)

    asyncio.create_task(_license_background())

    # ── RAG warmup ────────────────────────────────────────────────────────────
    try:
        from app.services.llm.rag_service import rag_service
        await asyncio.get_event_loop().run_in_executor(None, rag_service.warmup)
        logger.info("RAG service ready")
    except Exception as e:
        logger.warning(f"RAG warmup failed (non-fatal): {e}")

    logger.info("Startup complete")
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    from app.services.telephony.telnyx_service import telnyx_service
    from app.services.llm.llm_service import llm_service
    await telnyx_service.close()
    await llm_service.close()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
from app.api.routes import company, leads, telephony, batches, schedules, calls, knowledge
from app.api.routes.auth import router as auth_router

# License route
from fastapi import APIRouter
license_router = APIRouter()

@license_router.get("/license")
async def get_license():
    from app.core.license import license_manager
    return license_manager.status()

@license_router.post("/license/refresh")
async def refresh_license():
    from app.core.license import license_manager
    from app.core.security import get_current_user
    if settings.LICENSE_KEY:
        await license_manager.validate(
            settings.LICENSE_KEY,
            settings.LICENSE_SERVER_URL,
            settings.DEPLOYMENT_DOMAIN,
        )
        await license_manager.save_to_db(settings.LICENSE_KEY)
    return license_manager.status()

app.include_router(auth_router,       prefix="/api/v1/auth",      tags=["Auth"])
app.include_router(license_router,    prefix="/api/v1",            tags=["License"])
app.include_router(company.router,    prefix="/api/v1/company",   tags=["Company"])
app.include_router(leads.router,      prefix="/api/v1/leads",     tags=["Leads"])
app.include_router(telephony.router,  prefix="/api/v1/telephony", tags=["Telephony"])
app.include_router(batches.router,    prefix="/api/v1/batches",   tags=["Batches"])
app.include_router(schedules.router,  prefix="/api/v1/schedules", tags=["Schedules"])
app.include_router(calls.router,      prefix="/api/v1/calls",     tags=["Calls"])
app.include_router(knowledge.router,  prefix="/api/v1/knowledge", tags=["Knowledge"])


@app.get("/api/health")
async def health():
    from app.core.license import license_manager
    return {
        "status":  "ok",
        "version": settings.APP_VERSION,
        "license": license_manager.is_active(),
    }


@app.get("/")
async def root():
    return {"message": f"{settings.APP_NAME} v{settings.APP_VERSION}"}
