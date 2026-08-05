import base64
import json
import re

from google import genai
from google.genai import types

from config import settings

MODEL = "gemini-2.5-flash"


def analyse_screenshots(
    desktop_bytes: bytes,
    mobile_bytes: bytes,
    suchbegriff: str,
    tech_info: str,
) -> dict:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

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

    response = client.models.generate_content(
        model=MODEL,
        contents=[
            types.Part.from_bytes(data=desktop_bytes, mime_type="image/png"),
            types.Part.from_bytes(data=mobile_bytes, mime_type="image/png"),
            prompt,
        ],
    )

    text = response.text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        text = match.group(1)

    return json.loads(text)
