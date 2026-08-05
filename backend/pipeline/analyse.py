import asyncio
import logging
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup
from sqlalchemy import select

from database import AsyncSessionLocal
from models import Lead, LeadJob
from services.gemini_client import analyse_screenshots
from services.r2_client import upload_bytes
from services.screenshot_client import take_screenshots
from utils import detect_baukasten, extract_domain, is_modern_server

logger = logging.getLogger(__name__)

SOCIAL_DOMAINS = ("facebook.com", "instagram.com", "twitter.com", "linkedin.com", "youtube.com")


def _http_check(url: str) -> dict:
    result = {
        "website_erreichbar": False,
        "hat_ssl": url.startswith("https://"),
        "ladezeit_s": None,
        "server_header": "",
        "html": "",
        "final_url": url,
    }
    try:
        r = requests.get(url, timeout=15, allow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
        result["website_erreichbar"] = True
        result["ladezeit_s"] = round(r.elapsed.total_seconds(), 2)
        result["server_header"] = r.headers.get("Server", "")
        result["html"] = r.text
        result["final_url"] = r.url
        result["hat_ssl"] = r.url.startswith("https://")
    except Exception as e:
        logger.debug(f"HTTP check failed for {url}: {e}")
    return result


def _parse_html(html: str, url: str) -> dict:
    soup = BeautifulSoup(html, "lxml")
    text_lower = html.lower()

    hat_viewport = bool(soup.find("meta", attrs={"name": "viewport"}))
    moderner_doctype = html.strip().lower().startswith("<!doctype html>")
    hat_og_image = bool(soup.find("meta", property="og:image"))
    hat_meta_desc = bool(soup.find("meta", attrs={"name": "description"}))
    hat_favicon = bool(
        soup.find("link", rel=lambda x: x and ("icon" in " ".join(x).lower() if isinstance(x, list) else "icon" in x.lower()))
    )
    tabellen_layout = bool(soup.find("table"))
    hat_whatsapp = "whatsapp" in text_lower or "wa.me" in text_lower
    hat_chat = any(s in text_lower for s in ["livechat", "tawk.to", "intercom", "crisp", "freshchat", "hubspot"])
    hat_terminbuchung = any(
        s in text_lower
        for s in ["calendly", "termin buchen", "termin vereinbaren", "online-termin", "doctolib", "buchung"]
    )
    baukasten = detect_baukasten(html, url)

    return {
        "hat_viewport": hat_viewport,
        "moderner_doctype": moderner_doctype,
        "hat_og_image": hat_og_image,
        "hat_meta_desc": hat_meta_desc,
        "hat_favicon": hat_favicon,
        "tabellen_layout": tabellen_layout,
        "hat_whatsapp": hat_whatsapp,
        "hat_chat": hat_chat,
        "hat_terminbuchung": hat_terminbuchung,
        "baukasten_domain": baukasten,
    }


async def run_analyse(job_id: int, limit: int | None = None):
    async with AsyncSessionLocal() as db:
        try:
            # Fetch unanalysed leads with website
            q = (
                select(Lead)
                .where(
                    Lead.status == "entdeckt",
                    Lead.website_url.isnot(None),
                    Lead.website_url.notlike("%facebook%"),
                    Lead.website_url.notlike("%instagram%"),
                )
                .order_by(Lead.entdeckt_am)
            )
            if limit:
                q = q.limit(limit)

            result = await db.execute(q)
            leads = result.scalars().all()

            job = await db.get(LeadJob, job_id)
            job.total = len(leads)
            await db.commit()

            for lead in leads:
                try:
                    await _analyse_lead(lead.place_id)
                    async with AsyncSessionLocal() as db2:
                        j = await db2.get(LeadJob, job_id)
                        if j:
                            j.verarbeitet += 1
                            await db2.commit()
                except Exception as e:
                    logger.error(f"Analyse failed for {lead.place_id}: {e}")
                    async with AsyncSessionLocal() as db2:
                        l = await db2.get(Lead, lead.place_id)
                        if l:
                            l.status = "fehler"
                            l.fehler_log = str(e)
                            await db2.commit()
                        j = await db2.get(LeadJob, job_id)
                        if j:
                            j.fehler += 1
                            j.verarbeitet += 1
                            await db2.commit()

            async with AsyncSessionLocal() as db3:
                job = await db3.get(LeadJob, job_id)
                job.status = "abgeschlossen"
                job.abgeschlossen_am = datetime.now(timezone.utc)
                await db3.commit()

        except Exception as e:
            logger.error(f"Analyse job {job_id} failed: {e}")
            async with AsyncSessionLocal() as db4:
                job = await db4.get(LeadJob, job_id)
                if job:
                    job.status = "fehler"
                    job.abgeschlossen_am = datetime.now(timezone.utc)
                    job.log = str(e)
                    await db4.commit()


async def _analyse_lead(place_id: str):
    async with AsyncSessionLocal() as db:
        lead = await db.get(Lead, place_id)
        url = lead.website_url
        suchbegriff = lead.suchbegriff or ""

    # 1. HTTP check (sync → thread)
    http = await asyncio.to_thread(_http_check, url)

    if not http["website_erreichbar"]:
        async with AsyncSessionLocal() as db:
            lead = await db.get(Lead, place_id)
            lead.website_erreichbar = False
            lead.status = "analysiert"
            lead.analysiert_am = datetime.now(timezone.utc)
            await db.commit()
        return

    html = http["html"]

    # 2. Parse HTML (sync, fast → thread not needed)
    html_data = _parse_html(html, url)

    tech_info = (
        f"SSL: {http['hat_ssl']}, Ladezeit: {http['ladezeit_s']}s, "
        f"Viewport: {html_data['hat_viewport']}, "
        f"Moderner Doctype: {html_data['moderner_doctype']}, "
        f"Tabellenlayout: {html_data['tabellen_layout']}, "
        f"Baukasten: {html_data['baukasten_domain']}, "
        f"OG Image: {html_data['hat_og_image']}, "
        f"Meta Description: {html_data['hat_meta_desc']}"
    )

    # 3. Screenshots (sync Playwright → thread)
    screenshot_desktop_url = None
    screenshot_mobile_url = None
    desktop_bytes = None
    mobile_bytes = None

    try:
        desktop_bytes, mobile_bytes = await asyncio.to_thread(take_screenshots, url)
        # 4. Upload to R2 (sync → thread)
        screenshot_desktop_url = await asyncio.to_thread(
            upload_bytes, desktop_bytes, f"leads/{place_id}/desktop.png"
        )
        screenshot_mobile_url = await asyncio.to_thread(
            upload_bytes, mobile_bytes, f"leads/{place_id}/mobile.png"
        )
    except Exception as e:
        logger.warning(f"Screenshot failed for {place_id}: {e}")

    # 5. Gemini analysis (sync → thread)
    ki_data = {}
    if desktop_bytes and mobile_bytes:
        try:
            ki_data = await asyncio.to_thread(
                analyse_screenshots, desktop_bytes, mobile_bytes, suchbegriff, tech_info
            )
        except Exception as e:
            logger.warning(f"Gemini failed for {place_id}: {e}")

    # 6. Save to DB
    async with AsyncSessionLocal() as db:
        lead = await db.get(Lead, place_id)

        lead.website_erreichbar = True
        lead.hat_ssl = http["hat_ssl"]
        lead.ladezeit_s = http["ladezeit_s"]
        lead.moderner_server = is_modern_server(http["server_header"])

        lead.hat_viewport = html_data["hat_viewport"]
        lead.moderner_doctype = html_data["moderner_doctype"]
        lead.hat_og_image = html_data["hat_og_image"]
        lead.hat_meta_desc = html_data["hat_meta_desc"]
        lead.hat_favicon = html_data["hat_favicon"]
        lead.tabellen_layout = html_data["tabellen_layout"]
        lead.baukasten_domain = html_data["baukasten_domain"]
        lead.hat_whatsapp = ki_data.get("hat_whatsapp", html_data["hat_whatsapp"])
        lead.hat_chat = ki_data.get("hat_chat", html_data["hat_chat"])
        lead.hat_terminbuchung = ki_data.get("hat_terminbuchung", html_data["hat_terminbuchung"])

        lead.screenshot_desktop = screenshot_desktop_url
        lead.screenshot_mobile = screenshot_mobile_url

        lead.parking_seite = ki_data.get("parking_seite", False)
        lead.ki_empfehlung = ki_data.get("ki_empfehlung", False)
        lead.ki_begruendung = ki_data.get("ki_begruendung")
        lead.ki_prioritaet_hoch = ki_data.get("ki_prioritaet_hoch", False)

        # Set outreach status if AI recommends contacting
        if lead.ki_empfehlung and not lead.parking_seite:
            lead.outreach_status = "in_kampagne"
            lead.connect_status = "nicht_angerufen"

        lead.status = "analysiert"
        lead.analysiert_am = datetime.now(timezone.utc)
        await db.commit()

