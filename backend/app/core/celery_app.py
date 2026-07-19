import sys
import logging
from celery import Celery
from celery.signals import worker_process_init
from app.core.config import settings 
logger = logging.getLogger(__name__)

celery_app = Celery(
    "callcenter",
    broker=settings.REDIS_URL,#broker="redis://localhost:6379/0",
    backend=settings.REDIS_URL,#backend="redis://localhost:6379/0",
    include=["app.tasks.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    worker_prefetch_multiplier=1,
    task_acks_late=False,
    worker_pool="solo",
    broker_connection_retry_on_startup=True,
    task_default_queue="default",
    task_default_exchange="default",
    task_default_routing_key="default",
    task_max_retries=0,
    beat_schedule={
        "check-schedules": {
            "task":     "app.tasks.schedule_tasks.check_and_dispatch",
            "schedule": 60.0,
            "options":  {"queue": "default"},
        },
    },
)

if sys.platform == "win32":
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


@worker_process_init.connect
def _validate_license_on_worker_start(**kwargs):
    """
    Celery worker is a SEPARATE process from FastAPI/uvicorn — it never runs
    main.py's lifespan() startup code, so license_manager is empty by default
    ("Not validated yet"). This signal runs once when the worker process boots
    and validates the license so run_outbound_call's license gate actually works.
    """
    import asyncio
    from app.core.license import license_manager
    from app.core.config import settings

    async def _validate():
        await license_manager.load_from_db()
        if settings.LICENSE_KEY:
            valid = await license_manager.validate(
                settings.LICENSE_KEY,
                settings.LICENSE_SERVER_URL,
                settings.DEPLOYMENT_DOMAIN,
            )
            await license_manager.save_to_db(settings.LICENSE_KEY)
            if valid:
                logger.info(f"[Celery] License validated | tier={license_manager.status()['tier']}")
            else:
                logger.warning(f"[Celery] License validation failed — {license_manager.status()['message']}")
        else:
            logger.warning("[Celery] No LICENSE_KEY set in .env — calls will be blocked")

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_validate())
    except Exception as e:
        logger.error(f"[Celery] License validation at worker startup failed: {e}")