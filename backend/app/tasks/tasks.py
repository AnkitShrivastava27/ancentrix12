"""
Celery Tasks — v2 White-Label Edition
- License gate replaces Firestore plan gate
- Email tasks removed
- retry_failed_calls_task removed
- Single-tenant: company lookup by first()
"""
import asyncio
import logging
from datetime import datetime, time as dtime

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


def run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


@celery_app.task(name="app.tasks.call_tasks.run_outbound_call")
def run_outbound_call(lead_id: str, company_id: str, call_mode: str = "sales"):
    return run_async(_async_outbound_call(lead_id, company_id, call_mode))


async def _async_outbound_call(lead_id: str, company_id: str, call_mode: str):
    from app.core.database import AsyncSessionLocal
    from app.models.models import Company, Lead
    from app.services.telephony.telnyx_service import telnyx_service
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        r       = await db.execute(select(Company).where(Company.id == company_id))
        company = r.scalar_one_or_none()
        if not company:
            logger.error(f"Company {company_id} not found")
            return {"error": "company not found"}

        r    = await db.execute(select(Lead).where(Lead.id == lead_id))
        lead = r.scalar_one_or_none()
        if not lead:
            logger.error(f"Lead {lead_id} not found")
            return {"error": "lead not found"}

        if not lead.is_active or lead.status == "do_not_call":
            return {"skipped": "inactive or do_not_call"}
        if not lead.phone:
            return {"skipped": "no phone number"}

    # License gate
    try:
        from app.core.license import license_manager
        if not license_manager.is_active():
            status = license_manager.status()
            logger.warning(f"Call BLOCKED — license not active | {status['message']}")
            return {"skipped": f"license inactive: {status['message']}"}
    except Exception as e:
        logger.warning(f"License gate error (allowing call): {e}")

    logger.info(f"Outbound call | to={lead.phone} | company={company_id[:8]}")
    cid = await telnyx_service.make_outbound_call(
        to_number=lead.phone,
        company_id=company_id,
        lead_id=lead_id,
        call_mode=call_mode,
    )
    if not cid:
        return {"error": "telnyx call failed"}
    logger.info(f"Outbound call dispatched → {lead.phone} | cid={cid[:12]}")
    return {"call_control_id": cid, "lead_id": lead_id}


@celery_app.task(name="app.tasks.schedule_tasks.check_and_dispatch")
def check_and_dispatch():
    return run_async(_async_check_and_dispatch())


async def _async_check_and_dispatch():
    from app.core.database import AsyncSessionLocal
    from app.models.models import Batch, Schedule
    from sqlalchemy import select, and_
    import pytz

    now_utc = datetime.utcnow()
    logger.info(f"check_and_dispatch running | now_utc={now_utc.strftime('%Y-%m-%d %H:%M:%S')}")

    async with AsyncSessionLocal() as db:
        r = await db.execute(
            select(Schedule, Batch)
            .join(Batch, Schedule.batch_id == Batch.id)
            .where(and_(
                Schedule.is_active == True,
                Batch.status.in_(["scheduled", "running"]),
                Schedule.start_datetime <= now_utc,
            ))
        )
        rows = r.all()

    if not rows:
        logger.info("Active schedules found: 0")
        return {"dispatched": 0, "skipped": 0}

    logger.info(f"Active schedules found: {len(rows)}")
    dispatched = skipped = 0

    for schedule, batch in rows:
        tz        = pytz.timezone(schedule.base_timezone or "Asia/Kolkata")
        now_local = datetime.now(tz)
        day_name  = now_local.strftime("%A")
        allowed   = schedule.allowed_days or ["Monday","Tuesday","Wednesday","Thursday","Friday"]
        if day_name not in allowed:
            skipped += 1; continue
        try:
            ws_h, ws_m = map(int, (schedule.window_start_time or "09:00").split(":"))
            we_h, we_m = map(int, (schedule.window_end_time   or "18:00").split(":"))
        except Exception:
            skipped += 1; continue
        if not (dtime(ws_h, ws_m) <= now_local.time() <= dtime(we_h, we_m)):
            skipped += 1; continue

        logger.info(f"Dispatching schedule {schedule.id} (batch={batch.name}, type={batch.batch_type})")
        _dispatch_voice_batch.delay(batch.id, schedule.id)
        dispatched += 1

    logger.info(f"check_and_dispatch done | dispatched={dispatched} skipped={skipped}")
    return {"dispatched": dispatched, "skipped": skipped}


@celery_app.task(name="app.tasks.schedule_tasks._dispatch_voice_batch")
def _dispatch_voice_batch(batch_id: str, schedule_id: str):
    return run_async(_async_dispatch_voice(batch_id, schedule_id))


async def _async_dispatch_voice(batch_id: str, schedule_id: str):
    from app.core.database import AsyncSessionLocal
    from app.models.models import Batch, BatchLead, Lead, Schedule
    from sqlalchemy import select, and_
    import redis as redis_sync
    from app.core.config import settings as _s

    try:
        _r = redis_sync.from_url(getattr(_s, "REDIS_URL", "redis://localhost:6379"), decode_responses=True)
        lock_key = f"batch_call_active:{batch_id}"
        if _r.get(lock_key):
            logger.info(f"_dispatch_voice_batch | batch={batch_id[:8]} | skipping — call still active")
            return {"skipped": "call in progress"}
        if _r.get(f"batch_call_cooldown:{batch_id}"):
            return {"skipped": "cooldown"}
    except Exception as e:
        logger.warning(f"Redis check failed: {e}")
        _r = None

    async with AsyncSessionLocal() as db:
        rs       = await db.execute(select(Schedule).where(Schedule.id == schedule_id))
        schedule = rs.scalar_one_or_none()
        delay    = schedule.delay_between_seconds if schedule else 30

        rb    = await db.execute(select(Batch).where(Batch.id == batch_id))
        batch = rb.scalar_one_or_none()
        if not batch:
            return {"error": "batch not found"}

        rl = await db.execute(
            select(BatchLead, Lead)
            .join(Lead, BatchLead.lead_id == Lead.id)
            .where(and_(
                BatchLead.batch_id == batch_id,
                BatchLead.processed == False,
                Lead.is_active == True,
                Lead.status != "do_not_call",
            ))
            .limit(1)
        )
        row = rl.first()
        if not row:
            batch.status = "completed"; batch.completed_at = datetime.utcnow()
            await db.commit()
            logger.info(f"Batch {batch_id[:8]} completed")
            return {"completed": True}

        bl, lead = row.BatchLead, row.Lead
        bl.processed = True; bl.processed_at = datetime.utcnow(); bl.result = "dispatched"
        batch.status = "running"; batch.leads_processed = (batch.leads_processed or 0) + 1
        await db.commit()
        company_id = batch.company_id

    logger.info(f"_dispatch_voice_batch | batch={batch.name} | dispatched → {lead.phone}")

    if _r:
        try:
            _r.setex(lock_key, 300, "pending")
            _r.set(f"lead_batch:{lead.id}", batch_id, ex=3600)
        except Exception as e:
            logger.warning(f"Redis lock failed: {e}")

    run_outbound_call.delay(lead.id, company_id, batch.call_mode or "sales")

    if _r and delay > 0:
        try: _r.setex(f"batch_call_cooldown:{batch_id}", delay, "1")
        except: pass

    try:
        await _preload_next_call_cache(company_id, lead.id)
    except Exception as e:
        logger.debug(f"Cache preload error: {e}")

    return {"dispatched": 1, "lead": lead.phone}


async def _preload_next_call_cache(company_id: str, lead_id: str):
    from app.core.database import AsyncSessionLocal
    from app.models.models import Company, Lead
    from app.core.redis_client import redis_client
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        rc = await db.execute(select(Company).where(Company.id == company_id))
        company = rc.scalar_one_or_none()
        rl = await db.execute(select(Lead).where(Lead.id == lead_id))
        lead = rl.scalar_one_or_none()
    if not company or not lead:
        return
    cache = {
        "company": {
            "id": company.id, "name": company.name,
            "description": company.description or "", "services": company.services or "",
            "faqs": company.faqs or "", "products": company.products or [],
            "active_product": company.active_product, "agent_name": company.agent_name or "Aria",
            "voice_language": company.voice_language or "en-US", "voice_gender": company.voice_gender or "female",
            "forward_number": company.forward_number,
            "inbound_system_prompt": company.inbound_system_prompt,
            "outbound_sales_prompt": company.outbound_sales_prompt,
            "greeting_inbound": company.greeting_inbound, "greeting_outbound": company.greeting_outbound,
            "telnyx_phone_number": company.telnyx_phone_number,
        },
        "lead": {
            "id": lead.id, "name": lead.name, "phone": lead.phone, "email": lead.email,
            "status": lead.status, "notes": lead.notes or "", "key_info": lead.key_info or {},
            "call_attempts": lead.call_attempts or 0, "language": lead.language or "english",
            "timezone": lead.timezone or "Asia/Kolkata",
        },
    }
    await redis_client.set(f"call_cache:preload:{lead_id}", cache, expire=600)
    logger.info(f"Pre-loaded call cache for lead={lead_id[:8]}")
