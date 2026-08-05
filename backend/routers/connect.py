from datetime import datetime, timezone, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, case, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Lead, LeadNotiz, LeadAnruf
from utils import normalize_phone

router = APIRouter(prefix="/api/v1/connect", tags=["connect"])

PERSONEN = ["david", "sinan", "timo"]

TERMINAL_STATUS = {"kein_interesse", "verkauft", "website_zu_gut"}
ZAEHL_STATUS = {"nicht_erreicht", "callback", "demo_gewuenscht", "kein_interesse", "verkauft", "website_zu_gut"}

STATUS_SORT = case(
    (Lead.connect_status.is_(None), 1),
    (Lead.connect_status == "nicht_angerufen", 1),
    (Lead.connect_status == "nicht_erreicht", 2),
    (Lead.connect_status == "callback", 3),
    (Lead.connect_status == "demo_gewuenscht", 4),
    (Lead.connect_status == "kein_interesse", 5),
    (Lead.connect_status == "verkauft", 6),
    (Lead.connect_status == "website_zu_gut", 7),
    else_=8,
)


class StatusRequest(BaseModel):
    person: str
    status: str
    notiz: Optional[str] = None


class NotizRequest(BaseModel):
    autor: str
    text: str


class BulkZuteilenRequest(BaseModel):
    kampagne: Optional[str] = None


@router.get("/")
async def list_connect_leads(
    kampagne: Optional[str] = None,
    person: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Lead)
        .where(Lead.outreach_status == "in_kampagne")
        .order_by(STATUS_SORT, Lead.ki_prioritaet_hoch.desc(), Lead.entdeckt_am)
    )

    if kampagne:
        q = q.where(Lead.kampagne == kampagne)
    if person:
        q = q.where(Lead.connect_zugewiesen == person)
    if status:
        q = q.where(Lead.connect_status == status)
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

    result = await db.execute(q)
    leads = result.scalars().all()

    lead_dicts = []
    for lead in leads:
        # Fetch latest note
        notiz_result = await db.execute(
            select(LeadNotiz)
            .where(LeadNotiz.place_id == lead.place_id)
            .order_by(LeadNotiz.erstellt_am.desc())
            .limit(1)
        )
        letzte_notiz = notiz_result.scalar_one_or_none()

        d = _connect_lead_dict(lead)
        d["letzte_notiz"] = (
            {
                "text": letzte_notiz.text,
                "autor": letzte_notiz.autor,
                "erstellt_am": letzte_notiz.erstellt_am.isoformat(),
            }
            if letzte_notiz
            else None
        )
        lead_dicts.append(d)

    return lead_dicts


@router.get("/tages-stats")
async def tages_stats(db: AsyncSession = Depends(get_db)):
    today = date.today()
    result = {}
    for person in PERSONEN:
        r = await db.execute(
            select(func.count(LeadAnruf.id)).where(
                LeadAnruf.person == person,
                func.date(LeadAnruf.erstellt_am) == today,
            )
        )
        result[person] = r.scalar() or 0
    return result


@router.get("/total-stats")
async def total_stats(db: AsyncSession = Depends(get_db)):
    result = {}
    for person in PERSONEN:
        r = await db.execute(
            select(func.count(LeadAnruf.id)).where(LeadAnruf.person == person)
        )
        result[person] = r.scalar() or 0
    return result


@router.post("/bulk-zuteilen")
async def bulk_zuteilen(req: BulkZuteilenRequest = BulkZuteilenRequest(), db: AsyncSession = Depends(get_db)):
    q = select(Lead).where(
        Lead.outreach_status == "in_kampagne",
        Lead.connect_zugewiesen.is_(None),
    )
    if req.kampagne:
        q = q.where(Lead.kampagne == req.kampagne)

    result = await db.execute(q)
    leads = result.scalars().all()

    for i, lead in enumerate(leads):
        lead.connect_zugewiesen = PERSONEN[i % len(PERSONEN)]

    await db.commit()
    return {"zugeteilt": len(leads)}


@router.patch("/{place_id}/zuweisen")
async def zuweisen(place_id: str, body: dict, db: AsyncSession = Depends(get_db)):
    lead = await db.get(Lead, place_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead nicht gefunden")
    lead.connect_zugewiesen = body.get("person") or None
    await db.commit()
    return {"ok": True}


@router.patch("/{place_id}/status")
async def set_status(place_id: str, req: StatusRequest, db: AsyncSession = Depends(get_db)):
    lead = await db.get(Lead, place_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead nicht gefunden")

    if lead.connect_status in TERMINAL_STATUS:
        raise HTTPException(status_code=400, detail="Lead hat bereits einen finalen Status")

    lead.connect_status = req.status
    lead.connect_letzter_versuch_am = datetime.now(timezone.utc)

    if req.status in ZAEHL_STATUS:
        lead.connect_versuche = (lead.connect_versuche or 0) + 1
        # Log call for stats
        anruf = LeadAnruf(place_id=place_id, person=req.person, aktion=req.status)
        db.add(anruf)

    if req.notiz:
        notiz = LeadNotiz(place_id=place_id, autor=req.person, text=req.notiz)
        db.add(notiz)

    await db.commit()
    return {"ok": True, "status": lead.connect_status}


@router.patch("/{place_id}/demo-verschickt")
async def demo_verschickt(place_id: str, db: AsyncSession = Depends(get_db)):
    lead = await db.get(Lead, place_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead nicht gefunden")
    lead.demo_verschickt_am = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "demo_verschickt_am": lead.demo_verschickt_am.isoformat()}


@router.post("/{place_id}/notiz")
async def add_notiz(place_id: str, req: NotizRequest, db: AsyncSession = Depends(get_db)):
    lead = await db.get(Lead, place_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead nicht gefunden")
    notiz = LeadNotiz(place_id=place_id, autor=req.autor, text=req.text)
    db.add(notiz)
    await db.commit()
    await db.refresh(notiz)
    return {"id": notiz.id, "erstellt_am": notiz.erstellt_am.isoformat()}


@router.get("/{place_id}/notizen")
async def get_notizen(place_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LeadNotiz)
        .where(LeadNotiz.place_id == place_id)
        .order_by(LeadNotiz.erstellt_am.desc())
    )
    notizen = result.scalars().all()
    return [
        {
            "id": n.id,
            "autor": n.autor,
            "text": n.text,
            "erstellt_am": n.erstellt_am.isoformat(),
        }
        for n in notizen
    ]


def _connect_lead_dict(l: Lead) -> dict:
    return {
        "place_id": l.place_id,
        "name": l.name_anzeige or l.name,
        "telefon": l.telefon,
        "website_url": l.website_url,
        "screenshot_desktop": l.screenshot_desktop,
        "kampagne": l.kampagne,
        "suchbegriff": l.suchbegriff,
        "branche": l.branche,
        "ki_begruendung": l.ki_begruendung,
        "ki_prioritaet_hoch": l.ki_prioritaet_hoch,
        "connect_status": l.connect_status,
        "connect_zugewiesen": l.connect_zugewiesen,
        "connect_versuche": l.connect_versuche,
        "connect_letzter_versuch_am": (
            l.connect_letzter_versuch_am.isoformat() if l.connect_letzter_versuch_am else None
        ),
        "demo_verschickt_am": l.demo_verschickt_am.isoformat() if l.demo_verschickt_am else None,
        "entdeckt_am": l.entdeckt_am.isoformat() if l.entdeckt_am else None,
        "analysiert_am": l.analysiert_am.isoformat() if l.analysiert_am else None,
    }
