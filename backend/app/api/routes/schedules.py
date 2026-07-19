"""Schedules routes"""
from datetime import datetime
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.models import Batch, Company, Schedule

router = APIRouter()

DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]


class ScheduleCreate(BaseModel):
    batch_id: str
    start_datetime: datetime
    end_datetime: Optional[datetime] = None
    window_start_time: str = "09:00"
    window_end_time: str = "18:00"
    base_timezone: str = "Asia/Kolkata"
    use_lead_timezone: bool = True
    allowed_days: List[str] = ["Monday","Tuesday","Wednesday","Thursday","Friday"]
    max_per_hour: int = 10
    delay_between_seconds: int = 30


# Explicit update schema so FastAPI can parse the body correctly.
# All fields optional — only provided fields are updated (partial update).
class ScheduleUpdate(BaseModel):
    start_datetime: Optional[datetime]    = None
    end_datetime: Optional[datetime]      = None
    window_start_time: Optional[str]      = None
    window_end_time: Optional[str]        = None
    base_timezone: Optional[str]          = None
    use_lead_timezone: Optional[bool]     = None
    allowed_days: Optional[List[str]]     = None
    max_per_hour: Optional[int]           = None
    delay_between_seconds: Optional[int]  = None
    is_active: Optional[bool]             = None


def _dict(s: Schedule) -> dict:
    return {
        "id": s.id, "batch_id": s.batch_id,
        "start_datetime": s.start_datetime, "end_datetime": s.end_datetime,
        "window_start_time": s.window_start_time, "window_end_time": s.window_end_time,
        "base_timezone": s.base_timezone, "use_lead_timezone": s.use_lead_timezone,
        "allowed_days": s.allowed_days, "max_per_hour": s.max_per_hour,
        "delay_between_seconds": s.delay_between_seconds,
        "is_active": s.is_active, "created_at": s.created_at,
    }


async def _company(user_id: str, db: AsyncSession) -> Company:
    # v2 single-tenant: ignore user_id, just get the one company
    r = await db.execute(select(Company).limit(1))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Company not found. Please complete setup in Settings.")
    return c


@router.post("/")
async def create_schedule(
    data: ScheduleCreate,
    current_user=Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    company = await _company(current_user.id, db)
    r = await db.execute(select(Batch).where(Batch.id == data.batch_id, Batch.company_id == company.id))
    batch = r.scalar_one_or_none()
    if not batch:
        raise HTTPException(404, "Batch not found")

    sched = Schedule(
        company_id=company.id,
        **data.model_dump(),
        is_active=True,
    )
    db.add(sched)
    batch.status = "scheduled"
    await db.commit()
    await db.refresh(sched)
    return _dict(sched)


@router.get("/")
async def list_schedules(
    batch_id: Optional[str] = None,
    current_user=Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    company = await _company(current_user.id, db)
    conds = [Schedule.company_id == company.id]
    if batch_id:
        conds.append(Schedule.batch_id == batch_id)
    r = await db.execute(select(Schedule).where(and_(*conds)).order_by(Schedule.created_at.desc()))
    return [_dict(s) for s in r.scalars().all()]


@router.patch("/{schedule_id}")
async def update_schedule(
    schedule_id: str,
    data: ScheduleUpdate,          # ← explicit Pydantic model instead of raw dict
    current_user=Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    company = await _company(current_user.id, db)
    r = await db.execute(
        select(Schedule).where(Schedule.id == schedule_id, Schedule.company_id == company.id)
    )
    sched = r.scalar_one_or_none()
    if not sched:
        raise HTTPException(404, "Schedule not found")

    # Only update fields that were actually provided (exclude_unset=True)
    updates = data.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(sched, k, v)
    sched.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(sched)
    return _dict(sched)


@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: str,
    current_user=Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    company = await _company(current_user.id, db)
    r = await db.execute(
        select(Schedule).where(Schedule.id == schedule_id, Schedule.company_id == company.id)
    )
    sched = r.scalar_one_or_none()
    if not sched:
        raise HTTPException(404, "Schedule not found")
    await db.delete(sched)
    await db.commit()
    return {"deleted": True}