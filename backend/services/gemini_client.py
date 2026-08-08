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

SCHRITT 2 — Hat dieses Unternehmen eine verbesserungswürdige Website?
Berücksichtige: visuelles Design, Mobile-Darstellung, technischer Zustand.
empfehlung=false NUR wenn die Website KLAR modern und professionell ist:
- Zeitgemässes Design (2018 oder neuer)
- Einwandfreies responsives Mobile-Layout
- Professionelles Bildmaterial
- Klare Struktur und Call-to-Action

Ansonsten: empfehlung=true. Im Zweifel: empfehlung=true.
prioritaet_hoch=true wenn das Design erkennbar veraltet ist oder mehrere Mängel gleichzeitig vorliegen.

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
