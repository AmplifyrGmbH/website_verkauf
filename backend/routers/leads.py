from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Lead
from utils import normalize_phone

router = APIRouter(prefix="/api/v1/leads", tags=["leads"])


class LeadPatch(BaseModel):
    name_anzeige: Optional[str] = None
    telefon: Optional[str] = None
    email: Optional[str] = None


@router.get("/")
async def list_leads(
    status: Optional[str] = None,
    connect_status: Optional[str] = None,
    ki_empfehlung: Optional[bool] = None,
    branche: Optional[str] = None,
    suchbegriff: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    q = select(Lead).order_by(Lead.entdeckt_am.desc())

    if status:
        q = q.where(Lead.status == status)
    if connect_status:
        q = q.where(Lead.connect_status == connect_status)
    if ki_empfehlung is not None:
        q = q.where(Lead.ki_empfehlung == ki_empfehlung)
    if branche:
        q = q.where(Lead.branche == branche)
    if suchbegriff:
        q = q.where(Lead.suchbegriff.ilike(f"%{suchbegriff}%"))
    if search:
        digits = normalize_phone(search)
        normalized_tel = func.regexp_replace(Lead.telefon, r"[\s\-\+\(\)]", "", "g")
        q = q.where(
            or_(
                Lead.name.ilike(f"%{search}%"),
                Lead.name_anzeige.ilike(f"%{search}%"),
                normalized_tel.ilike(f"%{digits}%"),
            )
        )

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar()

    q = q.limit(limit).offset(offset)
    result = await db.execute(q)
    leads = result.scalars().all()

    return {"total": total, "leads": [_lead_dict(l) for l in leads]}


@router.get("/{place_id}")
async def get_lead(place_id: str, db: AsyncSession = Depends(get_db)):
    lead = await db.get(Lead, place_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead nicht gefunden")
    return _lead_dict(lead)


@router.patch("/{place_id}")
async def patch_lead(place_id: str, data: LeadPatch, db: AsyncSession = Depends(get_db)):
    lead = await db.get(Lead, place_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead nicht gefunden")

    if data.name_anzeige is not None:
        lead.name_anzeige = data.name_anzeige
    if data.telefon is not None:
        lead.telefon = data.telefon
    if data.email is not None:
        lead.email = data.email

    await db.commit()
    return _lead_dict(lead)


def _lead_dict(l: Lead) -> dict:
    return {
        "place_id": l.place_id,
        "name": l.name,
        "name_anzeige": l.name_anzeige,
        "adresse": l.adresse,
        "ort": l.ort,
        "telefon": l.telefon,
        "email": l.email,
        "website_url": l.website_url,
        "website_domain": l.website_domain,
        "google_rating": float(l.google_rating) if l.google_rating else None,
        "google_anzahl": l.google_anzahl,
        "suchbegriff": l.suchbegriff,
        "branche": l.branche,
        "kampagne": l.kampagne,
        "status": l.status,
        "website_erreichbar": l.website_erreichbar,
        "hat_ssl": l.hat_ssl,
        "ladezeit_s": float(l.ladezeit_s) if l.ladezeit_s else None,
        "screenshot_desktop": l.screenshot_desktop,
        "screenshot_mobile": l.screenshot_mobile,
        "hat_viewport": l.hat_viewport,
        "moderner_doctype": l.moderner_doctype,
        "tabellen_layout": l.tabellen_layout,
        "hat_og_image": l.hat_og_image,
        "hat_meta_desc": l.hat_meta_desc,
        "hat_favicon": l.hat_favicon,
        "hat_whatsapp": l.hat_whatsapp,
        "hat_chat": l.hat_chat,
        "hat_terminbuchung": l.hat_terminbuchung,
        "baukasten_domain": l.baukasten_domain,
        "parking_seite": l.parking_seite,
        "ki_empfehlung": l.ki_empfehlung,
        "ki_begruendung": l.ki_begruendung,
        "ki_prioritaet_hoch": l.ki_prioritaet_hoch,
        "connect_status": l.connect_status,
        "connect_zugewiesen": l.connect_zugewiesen,
        "connect_versuche": l.connect_versuche,
        "outreach_status": l.outreach_status,
        "demo_verschickt_am": l.demo_verschickt_am.isoformat() if l.demo_verschickt_am else None,
        "entdeckt_am": l.entdeckt_am.isoformat() if l.entdeckt_am else None,
        "analysiert_am": l.analysiert_am.isoformat() if l.analysiert_am else None,
    }
