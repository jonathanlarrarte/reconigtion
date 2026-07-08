import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone="UTC")


async def reset_monthly_counters() -> None:
    """
    Reinicia los contadores de billing de todos los tenants.
    Corre el día 1 de cada mes a medianoche UTC.
    """
    from sqlalchemy import update
    from app.db.base import AsyncSessionLocal
    from app.models.tenant import Tenant

    period_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            update(Tenant)
            .values(
                current_month_auths=0,
                current_month_enrollments=0,
                billing_period_start=period_start,
            )
            .returning(Tenant.id)
        )
        count = len(result.fetchall())
        await db.commit()

    logger.info(f"Monthly billing reset: {count} tenants reset — period_start={period_start.date()}")


def start_scheduler() -> None:
    scheduler.add_job(
        reset_monthly_counters,
        CronTrigger(day=1, hour=0, minute=0),
        id="monthly_billing_reset",
        replace_existing=True,
        misfire_grace_time=3600,   # si el server estuvo caído, ejecuta dentro de 1h
    )
    scheduler.start()
    logger.info("Scheduler started — monthly billing reset scheduled for day=1 hour=0 UTC")
