from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, and_, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.models import Batch, BatchLead, Company, Lead

router = APIRouter()


class FilterCriteria(BaseModel):
    status: Optional[List[str]] = None
    source: Optional[str] = None
    lead_ids: Optional[List[str]] = None
    language: Optional[str] = None
    exclude_statuses: Optional[List[str]] = ["do_not_call", "closed_won", "closed_lost"]
    limit: Optional[int] = None


class BatchCreate(BaseModel):
    name: str
    description: Optional[str] = None
    batch_type: str                       # voice
    call_mode: str = "sales"             # sales | support
    filter_criteria: FilterCriteria
    campaign_name: Optional[str] = None
    product_focus: Optional[str] = None


def _dict(b: Batch) -> dict:
    return {
        "id": b.id, "name": b.name, "description": b.description,
        "batch_type": b.batch_type, "call_mode": b.call_mode,
        "status": b.status, "lead_count": b.lead_count,
        "leads_processed": b.leads_processed, "leads_succeeded": b.leads_succeeded,
        "leads_failed": b.leads_failed, "campaign_name": b.campaign_name,
        "product_focus": b.product_focus, "filter_criteria": b.filter_criteria,
        "started_at": b.started_at, "completed_at": b.completed_at,
        "created_at": b.created_at,
    }


async def _company(user_id: str, db: AsyncSession) -> Company:
    # v2 single-tenant: ignore user_id, just get the one company
    r = await db.execute(select(Company).limit(1))
    c = r.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Company not found. Please complete setup in Settings.")
    return c


async def _select_leads(company_id: str, f: FilterCriteria, db: AsyncSession) -> List[Lead]:
    conds = [Lead.company_id == company_id, Lead.is_active == True]
    if f.lead_ids:
        conds.append(Lead.id.in_(f.lead_ids))
    else:
        if f.status:
            conds.append(Lead.status.in_(f.status))
        if f.exclude_statuses:
            conds.append(Lead.status.notin_(f.exclude_statuses))
        if f.source:
            conds.append(Lead.source == f.source)
        if f.language:
            conds.append(Lead.language == f.language)
    q = select(Lead).where(and_(*conds))
    if f.limit:
        q = q.limit(f.limit)
    r = await db.execute(q)
    return r.scalars().all()


@router.get("/preview")
async def preview(
    status: Optional[str] = None,
    limit: int = 200,
    current_user=Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    company = await _company(current_user.id, db)
    f = FilterCriteria(
        status=[s.strip() for s in status.split(",")] if status else None,
        limit=limit,
    )
    leads = await _select_leads(company.id, f, db)
    return {
        "total_matching": len(leads),
        "sample": [{"id": l.id, "name": l.name, "phone": l.phone, "status": l.status} for l in leads[:10]],
    }


@router.post("/")
async def create_batch(
    data: BatchCreate,
    current_user=Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    company = await _company(current_user.id, db)
    leads = await _select_leads(company.id, data.filter_criteria, db)
    if not leads:
        raise HTTPException(400, "No leads match the filter criteria.")

    batch = Batch(
        company_id=company.id,
        name=data.name, description=data.description,
        batch_type=data.batch_type, call_mode=data.call_mode,
        filter_criteria=data.filter_criteria.model_dump(),
        lead_count=len(leads),
        campaign_name=data.campaign_name,
        product_focus=data.product_focus,
        status="draft",
    )
    db.add(batch)
    await db.flush()

    for lead in leads:
        db.add(BatchLead(batch_id=batch.id, lead_id=lead.id))

    await db.commit()
    return {**_dict(batch), "lead_count": len(leads)}


@router.get("/")
async def list_batches(
    batch_type: Optional[str] = None,
    current_user=Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    company = await _company(current_user.id, db)
    conds = [Batch.company_id == company.id]
    if batch_type:
        conds.append(Batch.batch_type == batch_type)
    r = await db.execute(select(Batch).where(and_(*conds)).order_by(Batch.created_at.desc()))
    return [_dict(b) for b in r.scalars().all()]


@router.get("/{batch_id}")
async def get_batch(
    batch_id: str,
    current_user=Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    company = await _company(current_user.id, db)
    r = await db.execute(select(Batch).where(Batch.id == batch_id, Batch.company_id == company.id))
    batch = r.scalar_one_or_none()
    if not batch:
        raise HTTPException(404, "Batch not found")

    leads_r = await db.execute(
        select(BatchLead, Lead).join(Lead, BatchLead.lead_id == Lead.id)
        .where(BatchLead.batch_id == batch_id).limit(500)
    )
    leads = [
        {"id": row.Lead.id, "name": row.Lead.name, "phone": row.Lead.phone,
         "status": row.Lead.status, "processed": row.BatchLead.processed}
        for row in leads_r.all()
    ]
    return {**_dict(batch), "leads": leads}


@router.delete("/{batch_id}")
async def delete_batch(
    batch_id: str,
    current_user=Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    company = await _company(current_user.id, db)
    r = await db.execute(select(Batch).where(Batch.id == batch_id, Batch.company_id == company.id))
    batch = r.scalar_one_or_none()
    if not batch:
        raise HTTPException(404, "Batch not found")
   # if batch.status == "running":
      #  raise HTTPException(400, "Cannot delete a running batch. Pause it first.")

    # Explicitly delete child BatchLead rows first — SQLite does not support
    # ON DELETE CASCADE unless PRAGMA foreign_keys=ON, so we do it manually.
    await db.execute(delete(BatchLead).where(BatchLead.batch_id == batch_id))
    await db.delete(batch)
    await db.commit()
    return {"deleted": True}