import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import LeadJob
from pipeline.discovery import run_discovery
from pipeline.analyse import run_analyse

router = APIRouter(prefix="/api/v1/pipeline", tags=["pipeline"])


class DiscoveryRequest(BaseModel):
    suchbegriff: str
    limit: int = 100


class AnalyseRequest(BaseModel):
    limit: Optional[int] = None


@router.post("/discovery/start")
async def start_discovery(req: DiscoveryRequest, db: AsyncSession = Depends(get_db)):
    job = LeadJob(typ="discovery")
    db.add(job)
    await db.commit()
    await db.refresh(job)

    asyncio.create_task(run_discovery(job.id, req.suchbegriff, req.limit))

    return {"job_id": job.id, "status": "gestartet"}


@router.post("/analyse/start")
async def start_analyse(req: AnalyseRequest = AnalyseRequest(), db: AsyncSession = Depends(get_db)):
    job = LeadJob(typ="analyse")
    db.add(job)
    await db.commit()
    await db.refresh(job)

    asyncio.create_task(run_analyse(job.id, req.limit))

    return {"job_id": job.id, "status": "gestartet"}


@router.get("/jobs")
async def list_jobs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LeadJob).order_by(LeadJob.gestartet_am.desc()).limit(50))
    jobs = result.scalars().all()
    return [_job_dict(j) for j in jobs]


@router.get("/jobs/{job_id}")
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
    job = await db.get(LeadJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job nicht gefunden")
    return _job_dict(job)


def _job_dict(j: LeadJob) -> dict:
    return {
        "id": j.id,
        "typ": j.typ,
        "status": j.status,
        "total": j.total,
        "verarbeitet": j.verarbeitet,
        "fehler": j.fehler,
        "log": j.log,
        "gestartet_am": j.gestartet_am.isoformat() if j.gestartet_am else None,
        "abgeschlossen_am": j.abgeschlossen_am.isoformat() if j.abgeschlossen_am else None,
    }
