import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert

from database import AsyncSessionLocal
from models import Lead, LeadJob
from services.apify_client import run_google_maps
from utils import extract_domain

logger = logging.getLogger(__name__)


async def run_discovery(job_id: int, suchbegriff: str, limit: int):
    async with AsyncSessionLocal() as db:
        try:
            # Run Apify in thread (sync SDK)
            items = await asyncio.to_thread(run_google_maps, suchbegriff, limit)

            job = await db.get(LeadJob, job_id)
            job.total = len(items)
            await db.commit()

            neu = 0
            fehler = 0

            for item in items:
                try:
                    place_id = item.get("placeId")
                    if not place_id:
                        continue

                    website_url = item.get("website")
                    domain = extract_domain(website_url) if website_url else None

                    location = item.get("location") or {}
                    koordinaten = (
                        {"lat": location.get("lat"), "lng": location.get("lng")}
                        if location
                        else None
                    )

                    data = {
                        "place_id": place_id,
                        "name": item.get("title") or "Unbekannt",
                        "adresse": item.get("address"),
                        "ort": item.get("city"),
                        "telefon": item.get("phone"),
                        "website_url": website_url,
                        "website_domain": domain,
                        "google_rating": item.get("totalScore"),
                        "google_anzahl": item.get("reviewsCount"),
                        "oeffnungszeiten": item.get("openingHours"),
                        "koordinaten": koordinaten,
                        "suchbegriff": suchbegriff,
                        "status": "entdeckt",
                        "outreach_status": "in_kampagne" if website_url else None,
                        "connect_status": "nicht_angerufen" if website_url else None,
                    }

                    stmt = insert(Lead).values(**data).on_conflict_do_nothing(index_elements=["place_id"])
                    result = await db.execute(stmt)
                    if result.rowcount > 0:
                        neu += 1

                    job = await db.get(LeadJob, job_id)
                    job.verarbeitet += 1
                    await db.commit()

                except Exception as e:
                    logger.error(f"Discovery item error: {e}")
                    fehler += 1
                    job = await db.get(LeadJob, job_id)
                    job.fehler += 1
                    await db.commit()

            job = await db.get(LeadJob, job_id)
            job.status = "abgeschlossen"
            job.abgeschlossen_am = datetime.now(timezone.utc)
            job.log = f"Neu: {neu}, Übersprungen: {len(items) - neu - fehler}, Fehler: {fehler}"
            await db.commit()

        except Exception as e:
            logger.error(f"Discovery job {job_id} failed: {e}")
            async with AsyncSessionLocal() as db2:
                job = await db2.get(LeadJob, job_id)
                if job:
                    job.status = "fehler"
                    job.abgeschlossen_am = datetime.now(timezone.utc)
                    job.log = str(e)
                    await db2.commit()
