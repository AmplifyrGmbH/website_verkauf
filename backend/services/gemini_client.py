import base64
import json
import re

import google.generativeai as genai

from config import settings

MODEL = "gemini-2.5-flash"


def analyse_screenshots(
    desktop_bytes: bytes,
    mobile_bytes: bytes,
    suchbegriff: str,
    tech_info: str,
) -> dict:
    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(MODEL)

    desktop_b64 = base64.b64encode(desktop_bytes).decode()
    mobile_b64 = base64.b64encode(mobile_bytes).decode()

    prompt = f"""Du bist Experte für Unternehmens-Websites.
Du siehst den Desktop- und Mobile-Screenshot einer Unternehmens-Website.
Branche/Suchbegriff: {suchbegriff}

Technische Daten:
{tech_info}

SCHRITT 1 — Ist dies eine echte Unternehmens-Website?
Falls Parking-Seite, "Domain geparkt", Coming-soon, Fehlerseite:
→ parking_seite=true, empfehlung=false, begruendung="Keine echte Website."

SCHRITT 2 — Hat dieses Unternehmen wirklich eine schlechte Website?
Berücksichtige: visuelles Design, Mobile-Darstellung, technischer Zustand.
NUR empfehlung=true wenn MINDESTENS EINES dieser Kriterien EINDEUTIG zutrifft:
- Design erkennbar aus den 2000er/frühen 2010er Jahren
- Kein responsives Design (Mobile sieht aus wie zusammengequetschter Desktop)
- Kein professionelles Bildmaterial, fast nur Text
- Erkennbar veralteter Baukasten

Im Zweifel: empfehlung=false.
prioritaet_hoch=true wenn mehrere Kriterien gleichzeitig zutreffen.

Antworte NUR mit JSON:
{{
  "parking_seite": bool,
  "ki_empfehlung": bool,
  "ki_begruendung": "1 Satz",
  "ki_prioritaet_hoch": bool,
  "hat_terminbuchung": bool,
  "hat_whatsapp": bool,
  "hat_chat": bool
}}"""

    response = model.generate_content(
        [
            {"inline_data": {"mime_type": "image/png", "data": desktop_b64}},
            {"inline_data": {"mime_type": "image/png", "data": mobile_b64}},
            prompt,
        ]
    )

    text = response.text.strip()
    # Extract JSON from potential markdown code block
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        text = match.group(1)

    return json.loads(text)
