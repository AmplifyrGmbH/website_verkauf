import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert

from database import AsyncSessionLocal
from models import Lead, LeadJob
from services.apify_client import run_google_maps
from utils import extract_domain

logger = logging.getLogger(__name__)


async def run_discovery(job_id: int, suchbegriffe: list[str], limit: int):
    async with AsyncSessionLocal() as db:
        try:
            job = await db.get(LeadJob, job_id)
            job.total = 0
            job.log = f"Suchbegriffe: {', '.join(suchbegriffe)}"
            await db.commit()

            neu_gesamt = 0
            fehler_gesamt = 0
            total_gesamt = 0

            for suchbegriff in suchbegriffe:
                logger.info(f"Discovery: '{suchbegriff}' (limit={limit})")
                try:
                    items = await asyncio.to_thread(run_google_maps, suchbegriff, limit)
                except Exception as e:
                    logger.error(f"Apify failed for '{suchbegriff}': {e}")
                    async with AsyncSessionLocal() as db2:
                        j = await db2.get(LeadJob, job_id)
                        j.fehler += 1
                        j.log = (j.log or "") + f" | Fehler '{suchbegriff}': {e}"
                        await db2.commit()
                    continue

                total_gesamt += len(items)
                async with AsyncSessionLocal() as db2:
                    j = await db2.get(LeadJob, job_id)
                    j.total = total_gesamt
                    await db2.commit()

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
                            if location else None
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
                            "outreach_status": None,
                            "connect_status": None,
                        }

                        async with AsyncSessionLocal() as db3:
                            stmt = insert(Lead).values(**data).on_conflict_do_nothing(index_elements=["place_id"])
                            result = await db3.execute(stmt)
                            if result.rowcount > 0:
                                neu += 1
                            j = await db3.get(LeadJob, job_id)
                            j.verarbeitet += 1
                            await db3.commit()

                    except Exception as e:
                        logger.error(f"Discovery item error: {e}")
                        fehler += 1
                        async with AsyncSessionLocal() as db3:
                            j = await db3.get(LeadJob, job_id)
                            j.fehler += 1
                            await db3.commit()

                neu_gesamt += neu
                fehler_gesamt += fehler

            async with AsyncSessionLocal() as db2:
                j = await db2.get(LeadJob, job_id)
                j.status = "abgeschlossen"
                j.abgeschlossen_am = datetime.now(timezone.utc)
                j.log = (
                    f"Suchbegriffe: {', '.join(suchbegriffe)} | "
                    f"Neu: {neu_gesamt}, Übersprungen: {total_gesamt - neu_gesamt - fehler_gesamt}, Fehler: {fehler_gesamt}"
                )
                await db2.commit()

        except Exception as e:
            logger.error(f"Discovery job {job_id} failed: {e}")
            async with AsyncSessionLocal() as db2:
                j = await db2.get(LeadJob, job_id)
                if j:
                    j.status = "fehler"
                    j.abgeschlossen_am = datetime.now(timezone.utc)
                    j.log = str(e)
                    await db2.commit()
