# Agent: All-Industry Website Sales Automation

## Ziel
Ein Sales-Automation-System das Unternehmen **jeder Branche** mit wirklich schlechten Websites identifiziert, per Telefon qualifiziert und erst nach positivem Gespräch eine manuell erstellte Demo verschickt. Der Erstkontakt ist immer ein Anruf — kein automatisierter E-Mail-Versand.

---

## Architektur-Übersicht

```
Google Maps (Apify)
       ↓
  Discovery (Suchbegriff-basiert)
       ↓
  Website-Analyse (Screenshots + technische Signale + KI-Filter)
       ↓
  Connect-Dashboard (Anruf-Tracking)
       ↓
  Demo verschickt (manuell, getrackt im System)
```

**Stack:**
- Backend: FastAPI (Python 3.11+), SQLAlchemy async, PostgreSQL
- Frontend: Next.js 16 (App Router, Turbopack), Tailwind CSS
- KI: Gemini 2.5 Flash (Screenshots + Analyse), Claude (Texte)
- Scraping: Apify Google Maps Scraper
- Screenshots: Playwright (Headless Chromium)
- Datei-Storage: Cloudflare R2 (S3-kompatibel, für Screenshots)
- Deployment: Hetzner VPS, Nginx Reverse Proxy, systemd Services

---

## Server-Setup

### Kontext: Bestehende Services auf demselben Server
Dieser Agent läuft auf dem **gleichen Hetzner-Server** wie das bestehende website-agent System.
Bereits belegte Ports: 3000, 3001, 8001, 8002, 8003.

```
Server IP: 167.233.25.202
OS: Ubuntu 22.04 LTS
```

### Ports dieses Agents
```
Frontend:  Port 3002  → leads.amplifyr-digital.ch
Backend:   Port 8004  → leads-api.amplifyr-digital.ch
```

### Gesamtübersicht aller Services auf dem Server
```
Internet (443/80)
    ↓
  Nginx
    ├── agent.amplifyr-digital.ch       → Port 3000  (website-agent frontend)
    ├── api.amplifyr-digital.ch         → Port 8001  (website-agent backend)
    ├── leads.amplifyr-digital.ch       → Port 3002  (dieser Agent, frontend)  ← NEU
    ├── leads-api.amplifyr-digital.ch   → Port 8004  (dieser Agent, backend)   ← NEU
    ├── handwerker frontend             → Port 3001
    └── handwerker backend              → Port 8003

PostgreSQL                              → Port 5432  (lokal, gemeinsame DB: agentdb)
```

### Nginx-Konfiguration (hinzufügen zu bestehendem nginx config)
Datei: `/etc/nginx/sites-available/leads-agent` (neu erstellen)

```nginx
server {
    server_name leads.amplifyr-digital.ch;
    auth_basic "Restricted";
    auth_basic_user_file /etc/nginx/.htpasswd;
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/agent.amplifyr-digital.ch/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/agent.amplifyr-digital.ch/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    server_name leads-api.amplifyr-digital.ch;
    location / {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 50M;
    }
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/agent.amplifyr-digital.ch/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/agent.amplifyr-digital.ch/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = leads.amplifyr-digital.ch) { return 301 https://$host$request_uri; }
    listen 80; server_name leads.amplifyr-digital.ch; return 404;
}
server {
    if ($host = leads-api.amplifyr-digital.ch) { return 301 https://$host$request_uri; }
    listen 80; server_name leads-api.amplifyr-digital.ch; return 404;
}
```

Aktivieren:
```bash
ln -s /etc/nginx/sites-available/leads-agent /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
# SSL für neue Subdomains (falls noch nicht vorhanden):
certbot --nginx -d leads.amplifyr-digital.ch -d leads-api.amplifyr-digital.ch
```

### systemd Services

**Backend** `/etc/systemd/system/leads-agent-backend.service`:
```ini
[Unit]
Description=Leads Agent Backend
After=network.target postgresql.service

[Service]
User=root
WorkingDirectory=/opt/leads-agent/backend
EnvironmentFile=/opt/leads-agent/.env
ExecStart=/opt/leads-agent/backend/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8004
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Frontend** `/etc/systemd/system/leads-agent-frontend.service`:
```ini
[Unit]
Description=Leads Agent Frontend
After=network.target

[Service]
User=root
WorkingDirectory=/opt/leads-agent/frontend/.next/standalone
Environment=NODE_ENV=production
Environment=PORT=3002
Environment=NEXT_PUBLIC_BACKEND_URL=https://leads-api.amplifyr-digital.ch
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Services aktivieren:
```bash
systemctl daemon-reload
systemctl enable leads-agent-backend leads-agent-frontend
systemctl start leads-agent-backend leads-agent-frontend
```

### Datenbank
```
DB-Name:  agentdb          (gleiche Instanz wie website-agent!)
User:     agentuser
Password: (in .env)
```

Tabellen dieses Agents haben eigene Namen (`leads`, `leads_notizen`, `leads_anrufe`, `leads_jobs`)
→ kein Konflikt mit bestehenden Tabellen (`praxen`, `connect_notizen`, `connect_anrufe`, etc.)

Verbinden: `sudo -u postgres psql agentdb`

### Dateipfade auf Server
```
/opt/leads-agent/             ← separates Verzeichnis vom website-agent (/opt/website-agent/)
├── .env                      # Alle API-Keys (einzige Quelle)
├── backend/
│   ├── .env                  # Kopie der Root-.env
│   ├── .venv/                # Python-Virtualenv
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── models.py
│   ├── pipeline/
│   ├── routers/
│   └── services/
└── frontend/
    ├── .next/
    └── app/
```

### Deploy-Prozess
```bash
# Lokal:
git add . && git commit -m "..." && git push

# Auf Server (Backend geändert):
ssh root@167.233.25.202
cd /opt/leads-agent && git pull
systemctl restart leads-agent-backend

# Auf Server (Frontend geändert):
ssh root@167.233.25.202
cd /opt/leads-agent && git pull
cd frontend && NEXT_PUBLIC_BACKEND_URL=https://leads-api.amplifyr-digital.ch npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
systemctl restart leads-agent-frontend
```

### Erstes Setup auf Server
```bash
ssh root@167.233.25.202
cd /opt
# Repo-Name anpassen, sobald Repo erstellt ist:
git clone https://github.com/AmplifyrGmbH/leads-agent.git leads-agent
cd leads-agent

# .env anlegen
cp .env.example .env
nano .env   # API-Keys eintragen

# Python-Umgebung
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install-deps chromium   # Ubuntu-Systemabhängigkeiten
.venv/bin/playwright install chromium

# Frontend
cd ../frontend
npm install
NEXT_PUBLIC_BACKEND_URL=https://leads-api.amplifyr-digital.ch npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

# Services starten (siehe oben)
```

---

## Umgebungsvariablen (`.env`)

```env
DATABASE_URL=postgresql+asyncpg://agentuser:PASS@localhost:5432/agentdb

# Apify (Google Maps Discovery)
APIFY_API_TOKEN=

# KI
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

# Cloudflare R2 (Screenshot-Storage)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=agent-screenshots
R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

---

## Datenmodell

### Tabelle: `leads`

```sql
CREATE TABLE leads (
    place_id        VARCHAR PRIMARY KEY,       -- Google Maps Place ID
    name            VARCHAR NOT NULL,
    name_anzeige    VARCHAR,                   -- Bereinigter Anzeigename
    adresse         VARCHAR,
    plz             VARCHAR,
    ort             VARCHAR,
    kanton          VARCHAR,
    telefon         VARCHAR,
    email           VARCHAR,
    website_url     VARCHAR,
    website_domain  VARCHAR,                   -- z.B. "beispiel.ch"
    keine_website   BOOLEAN DEFAULT FALSE,

    -- Google-Daten
    google_rating   NUMERIC(3,1),
    google_anzahl   INTEGER,
    oeffnungszeiten JSONB,
    koordinaten     JSONB,

    -- Discovery
    suchbegriff     VARCHAR,                   -- z.B. "Zahnarzt Zürich"
    branche         VARCHAR,                   -- z.B. "zahnarzt", "fitnessstudio"
    kampagne        VARCHAR,                   -- z.B. "version 1"

    -- Analyse (Phase 2)
    website_erreichbar  BOOLEAN,
    hat_ssl             BOOLEAN,
    ladezeit_s          NUMERIC(5,2),
    screenshot_desktop  VARCHAR,               -- R2-URL
    screenshot_mobile   VARCHAR,               -- R2-URL
    hat_viewport        BOOLEAN,
    moderner_doctype    BOOLEAN,
    tabellen_layout     BOOLEAN,
    hat_og_image        BOOLEAN,
    hat_meta_desc       BOOLEAN,
    hat_favicon         BOOLEAN,
    hat_whatsapp        BOOLEAN,
    hat_chat            BOOLEAN,
    moderner_server     BOOLEAN,
    baukasten_domain    VARCHAR,
    hat_terminbuchung   BOOLEAN,
    parking_seite       BOOLEAN,

    -- KI-Entscheid
    ki_empfehlung       BOOLEAN,               -- true = schlechte Website → kontaktieren
    ki_begruendung      TEXT,
    ki_prioritaet_hoch  BOOLEAN,

    -- Connect (Anruf-Tracking)
    connect_status          VARCHAR,           -- Constraint: s.u.
    connect_zugewiesen      VARCHAR,           -- "david" | "sinan" | "timo"
    connect_versuche        INTEGER DEFAULT 0,
    connect_letzter_versuch_am TIMESTAMPTZ,

    -- Demo
    demo_verschickt_am  TIMESTAMPTZ,           -- NULL = noch nicht verschickt

    -- Pipeline
    status              VARCHAR DEFAULT 'entdeckt',  -- Constraint: s.u.
    outreach_status     VARCHAR,
    fehler_log          TEXT,
    entdeckt_am         TIMESTAMPTZ DEFAULT NOW(),
    analysiert_am       TIMESTAMPTZ,

    CONSTRAINT chk_status CHECK (
        status IN ('entdeckt','analysiert','fehler')
    ),
    CONSTRAINT chk_connect_status CHECK (
        connect_status IS NULL OR connect_status IN (
            'nicht_angerufen','nicht_erreicht','callback',
            'demo_gewuenscht','kein_interesse','verkauft','website_zu_gut'
        )
    ),
    CONSTRAINT chk_outreach_status CHECK (
        outreach_status IS NULL OR outreach_status IN ('bereit','in_kampagne')
    )
);
```

### Tabelle: `leads_notizen`
```sql
CREATE TABLE leads_notizen (
    id          SERIAL PRIMARY KEY,
    place_id    VARCHAR REFERENCES leads(place_id) ON DELETE CASCADE,
    autor       VARCHAR NOT NULL,
    text        TEXT NOT NULL,
    erstellt_am TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabelle: `leads_anrufe`
```sql
CREATE TABLE leads_anrufe (
    id          SERIAL PRIMARY KEY,
    place_id    VARCHAR REFERENCES leads(place_id) ON DELETE CASCADE,
    person      VARCHAR NOT NULL,
    aktion      VARCHAR NOT NULL,              -- "nicht_erreicht" | "callback" | etc.
    erstellt_am TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabelle: `leads_jobs`
```sql
CREATE TABLE leads_jobs (
    id              SERIAL PRIMARY KEY,
    typ             VARCHAR NOT NULL,          -- "discovery" | "analyse"
    gestartet_am    TIMESTAMPTZ DEFAULT NOW(),
    abgeschlossen_am TIMESTAMPTZ,
    status          VARCHAR DEFAULT 'laufend', -- "laufend" | "abgeschlossen" | "fehler"
    total           INTEGER,
    verarbeitet     INTEGER DEFAULT 0,
    fehler          INTEGER DEFAULT 0,
    log             TEXT
);
```

---

## Backend-Struktur

```
backend/
├── main.py               # FastAPI App, CORS, Router-Registrierung, lifespan
├── config.py             # pydantic-settings, liest .env
├── database.py           # AsyncEngine, AsyncSessionLocal, create_tables()
├── models.py             # SQLAlchemy ORM-Models
├── utils.py              # Hilfsfunktionen (Slug-Generator etc.)
├── pipeline/
│   ├── discovery.py      # Apify Google Maps Scraper
│   └── analyse.py        # HTTP-Check, Playwright, BeautifulSoup, Gemini
├── routers/
│   ├── pipeline.py       # POST /api/v1/pipeline/*/start, GET /jobs
│   ├── leads.py          # GET/PATCH /api/v1/leads
│   └── connect.py        # Connect-Dashboard API
└── services/
    ├── apify_client.py   # Apify API Wrapper
    ├── gemini_client.py  # Gemini 2.5 Flash (Screenshots)
    ├── r2_client.py      # Cloudflare R2 Upload
    └── screenshot_client.py  # Playwright Screenshots
```

### `main.py` Muster
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import create_tables
from routers import pipeline, leads, connect

@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield

app = FastAPI(title="Agent API", version="1.0.0", lifespan=lifespan)

app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:3002", "https://leads.amplifyr-digital.ch"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

app.include_router(pipeline.router)
app.include_router(leads.router)
app.include_router(connect.router)
```

### `requirements.txt`
```
fastapi
uvicorn[standard]
sqlalchemy[asyncio]
asyncpg
pydantic-settings
requests
beautifulsoup4
playwright
apify-client
google-generativeai
boto3
anthropic
```

### `config.py` Muster
```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=["../.env", ".env"], env_file_encoding="utf-8", extra="ignore"
    )
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/agentdb"
    APIFY_API_TOKEN: str = ""
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "agent-screenshots"
    R2_PUBLIC_URL: str = ""

settings = Settings()
```

### `database.py` Muster
```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

### `models.py` Muster
```python
from datetime import datetime, timezone
from sqlalchemy import Boolean, Integer, Numeric, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

def now_utc():
    return datetime.now(timezone.utc)

class Lead(Base):
    __tablename__ = "leads"

    place_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    name_anzeige: Mapped[str | None] = mapped_column(String)
    adresse: Mapped[str | None] = mapped_column(String)
    plz: Mapped[str | None] = mapped_column(String)
    ort: Mapped[str | None] = mapped_column(String)
    kanton: Mapped[str | None] = mapped_column(String)
    telefon: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    website_url: Mapped[str | None] = mapped_column(String)
    website_domain: Mapped[str | None] = mapped_column(String)
    keine_website: Mapped[bool] = mapped_column(Boolean, default=False)
    google_rating: Mapped[float | None] = mapped_column(Numeric(3, 1))
    google_anzahl: Mapped[int | None] = mapped_column(Integer)
    oeffnungszeiten: Mapped[dict | None] = mapped_column(JSONB)
    koordinaten: Mapped[dict | None] = mapped_column(JSONB)
    suchbegriff: Mapped[str | None] = mapped_column(String)
    branche: Mapped[str | None] = mapped_column(String)
    kampagne: Mapped[str | None] = mapped_column(String)
    website_erreichbar: Mapped[bool | None] = mapped_column(Boolean)
    hat_ssl: Mapped[bool | None] = mapped_column(Boolean)
    ladezeit_s: Mapped[float | None] = mapped_column(Numeric(5, 2))
    screenshot_desktop: Mapped[str | None] = mapped_column(String)
    screenshot_mobile: Mapped[str | None] = mapped_column(String)
    hat_viewport: Mapped[bool | None] = mapped_column(Boolean)
    moderner_doctype: Mapped[bool | None] = mapped_column(Boolean)
    tabellen_layout: Mapped[bool | None] = mapped_column(Boolean)
    hat_og_image: Mapped[bool | None] = mapped_column(Boolean)
    hat_meta_desc: Mapped[bool | None] = mapped_column(Boolean)
    hat_favicon: Mapped[bool | None] = mapped_column(Boolean)
    hat_whatsapp: Mapped[bool | None] = mapped_column(Boolean)
    hat_chat: Mapped[bool | None] = mapped_column(Boolean)
    moderner_server: Mapped[bool | None] = mapped_column(Boolean)
    baukasten_domain: Mapped[str | None] = mapped_column(String)
    hat_terminbuchung: Mapped[bool | None] = mapped_column(Boolean)
    parking_seite: Mapped[bool | None] = mapped_column(Boolean)
    ki_empfehlung: Mapped[bool | None] = mapped_column(Boolean)
    ki_begruendung: Mapped[str | None] = mapped_column(Text)
    ki_prioritaet_hoch: Mapped[bool | None] = mapped_column(Boolean)
    connect_status: Mapped[str | None] = mapped_column(String)
    connect_zugewiesen: Mapped[str | None] = mapped_column(String)
    connect_versuche: Mapped[int] = mapped_column(Integer, default=0)
    connect_letzter_versuch_am: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    demo_verschickt_am: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String, default="entdeckt")
    outreach_status: Mapped[str | None] = mapped_column(String)
    fehler_log: Mapped[str | None] = mapped_column(Text)
    entdeckt_am: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    analysiert_am: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    notizen: Mapped[list["LeadNotiz"]] = relationship("LeadNotiz", back_populates="lead", cascade="all, delete")
    anrufe: Mapped[list["LeadAnruf"]] = relationship("LeadAnruf", back_populates="lead", cascade="all, delete")


class LeadNotiz(Base):
    __tablename__ = "leads_notizen"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    place_id: Mapped[str] = mapped_column(String, ForeignKey("leads.place_id", ondelete="CASCADE"))
    autor: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    erstellt_am: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    lead: Mapped["Lead"] = relationship("Lead", back_populates="notizen")


class LeadAnruf(Base):
    __tablename__ = "leads_anrufe"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    place_id: Mapped[str] = mapped_column(String, ForeignKey("leads.place_id", ondelete="CASCADE"))
    person: Mapped[str] = mapped_column(String, nullable=False)
    aktion: Mapped[str] = mapped_column(String, nullable=False)
    erstellt_am: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    lead: Mapped["Lead"] = relationship("Lead", back_populates="anrufe")


class LeadJob(Base):
    __tablename__ = "leads_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    typ: Mapped[str] = mapped_column(String, nullable=False)
    gestartet_am: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    abgeschlossen_am: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String, default="laufend")
    total: Mapped[int | None] = mapped_column(Integer)
    verarbeitet: Mapped[int] = mapped_column(Integer, default=0)
    fehler: Mapped[int] = mapped_column(Integer, default=0)
    log: Mapped[str | None] = mapped_column(Text)
```

---

## Pipeline

### Phase 1 — Discovery

**Trigger:** POST `/api/v1/pipeline/discovery/start` mit Body `{"suchbegriff": "Zahnarzt Zürich", "limit": 100}`

**Apify Actor:** `compass/crawler-google-places`

**Apify Input:**
```json
{
  "searchStringsArray": ["Zahnarzt Zürich"],
  "maxCrawledPlacesPerSearch": 100,
  "language": "de",
  "countryCode": "ch"
}
```

**Apify Mapping → DB:**
```python
{
    "place_id": item.get("placeId"),
    "name": item.get("title"),
    "adresse": item.get("address"),
    "ort": item.get("city"),
    "telefon": item.get("phone"),
    "website_url": item.get("website"),
    "google_rating": item.get("totalScore"),
    "google_anzahl": item.get("reviewsCount"),
    "oeffnungszeiten": item.get("openingHours"),
    "koordinaten": {"lat": item.get("location", {}).get("lat"), "lng": item.get("location", {}).get("lng")},
    "suchbegriff": suchbegriff,
    "status": "entdeckt",
}
```

**Deduplication:** `INSERT ... ON CONFLICT (place_id) DO NOTHING`

**Filterung vor Analyse:**
- `website_url IS NOT NULL`
- `website_url NOT LIKE '%facebook%'`
- `website_url NOT LIKE '%instagram%'`

---

### Phase 2 — Website-Analyse

**Trigger:** POST `/api/v1/pipeline/analyse/start` (verarbeitet alle `status = 'entdeckt'` mit Website)

**Schritte pro Lead:**
1. HTTP-Check (requests): Erreichbarkeit, SSL, Ladezeit, Server-Header
2. BeautifulSoup: Viewport, Doctype, OG-Image, Meta-Description, Favicon, Tabellenlayout, Baukasten-Domain
3. Playwright: Desktop-Screenshot (1280×800), Mobile-Screenshot (390×844)
4. Upload Screenshots zu R2
5. Gemini-Analyse (Screenshot + technische Daten → KI-Entscheid)
6. `status = 'analysiert'` setzen

**Gemini-Prompt (branchenunabhängig):**
```python
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
```

**Ergebnis-Filterung:**
- `ki_empfehlung = true` → Lead geht ins Connect-Dashboard (`outreach_status = 'in_kampagne'`)
- `ki_empfehlung = false` → Lead wird gespeichert aber nicht kontaktiert
- `parking_seite = true` → Lead wird verworfen

---

## Connect-Dashboard API

Basis-URL: `/api/v1/connect`

### Endpoints

```
GET    /                          → Lead-Liste (Filter: kampagne, person, status, search)
GET    /tages-stats               → Anrufzähler heute pro Person
GET    /total-stats               → Anrufzähler gesamt pro Person
POST   /bulk-zuteilen             → Leads gleichmässig auf Personen verteilen
PATCH  /{place_id}/status         → Status setzen (nicht_erreicht, callback, etc.)
PATCH  /{place_id}/demo-verschickt → demo_verschickt_am = NOW() setzen
POST   /{place_id}/notiz          → Notiz hinzufügen
GET    /{place_id}/notizen        → Alle Notizen abrufen
```

### Status-Flow
```
nicht_angerufen
    ↓
nicht_erreicht  ←→  callback
    ↓
demo_gewuenscht
    ↓
kein_interesse | verkauft | website_zu_gut  (terminal)
```

### Status-Sortierung (Anzeige-Reihenfolge)
```python
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
```

### PATCH /{place_id}/status — Body
```json
{
  "person": "david",
  "status": "nicht_erreicht | callback | demo_gewuenscht | kein_interesse | verkauft | website_zu_gut",
  "notiz": "optional"
}
```

Logik:
- `connect_versuche += 1` bei nicht_erreicht, callback, demo_gewuenscht, kein_interesse, verkauft
- Eintrag in `connect_anrufe` für Tages-/Total-Counter
- Terminal-Status (`kein_interesse`, `verkauft`, `website_zu_gut`) → keine weiteren Status-Änderungen möglich
- Notiz wird optional gespeichert

### PATCH /{place_id}/demo-verschickt
Setzt `demo_verschickt_am = NOW()`. Kein Body nötig.

### Lead-Serialisierung (GET /)
```python
{
    "place_id": str,
    "name": str,
    "telefon": str,
    "website_url": str,
    "screenshot_desktop": str,         # R2-URL
    "kampagne": str,
    "suchbegriff": str,
    "ki_begruendung": str,             # Kurze KI-Begründung anzeigen
    "connect_status": str,
    "connect_zugewiesen": str,
    "connect_versuche": int,
    "connect_letzter_versuch_am": str,
    "demo_verschickt_am": str | None,
    "letzte_notiz": {
        "text": str,
        "autor": str,
        "erstellt_am": str,
    } | None,
}
```

---

## Frontend-Struktur

```
frontend/
├── app/
│   ├── layout.tsx          # Root Layout, Navigation
│   ├── page.tsx            # Dashboard / Übersicht
│   ├── leads/
│   │   └── page.tsx        # Lead-Liste mit Filtern
│   ├── connect/
│   │   └── page.tsx        # Anruf-Dashboard
│   └── pipeline/
│       └── page.tsx        # Pipeline-Steuerung (Discovery starten, Analyse starten)
├── lib/
│   └── api.ts              # Alle API-Calls, TypeScript-Interfaces
└── next.config.js
```

### `next.config.js`
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
}
module.exports = nextConfig
```

### Connect-Dashboard — Key Features
- **Filter:** Kampagne, Person, Status, Freitext-Suche (Name + Telefon, normalisiert)
- **Filter-State:** `useState` initialisiert aus URL, treibt Data-Loading lokal (kein URL-re-fetch)
- **Status-Dropdown:** Direkt in Tabellen-Zelle, kein Modal nötig
- **Demo-verschickt Button:** Einmaliger Klick setzt Timestamp
- **Stift-Button:** Öffnet immer neue Notiz-Eingabe
- **Tages- und Total-Counter:** Pro Person oben rechts (heute / total)
- **Personen:** david, sinan, timo (konfigurierbar)
- **Ziel pro Tag:** 5 Anrufe (GOAL = 5, Counter wird grün wenn erreicht)

### Telefon-Suche (normalisiert)
```python
# Backend: Spaces/+/-/() vor Vergleich entfernen
from sqlalchemy import func
import re
digits_only = re.sub(r"[\s\-\+\(\)]", "", search)
normalized_tel = func.regexp_replace(Praxis.telefon, r"[\s\-\+\(\)]", "", "g")
q = q.where(or_(
    Lead.name.ilike(f"%{search}%"),
    Lead.name_anzeige.ilike(f"%{search}%"),
    normalized_tel.ilike(f"%{digits_only}%"),
))
```

---

## Pipeline-Steuerung (Admin)

### POST /api/v1/pipeline/discovery/start
```json
{ "suchbegriff": "Zahnarzt Zürich", "limit": 100 }
```
- Startet Apify-Job, schreibt Leads in DB
- Gibt `job_id` zurück
- Verarbeitung im Hintergrund (asyncio Task)

### POST /api/v1/pipeline/analyse/start
```json
{ "limit": 50 }   // optional: nur N Leads verarbeiten
```
- Verarbeitet alle `status = 'entdeckt'` Leads mit Website

### GET /api/v1/pipeline/jobs
- Liste aller Jobs mit Status, Fortschritt, Fehleranzahl

### GET /api/v1/pipeline/jobs/{job_id}
```json
{
  "id": 1,
  "typ": "discovery",
  "status": "abgeschlossen",
  "total": 100,
  "verarbeitet": 98,
  "fehler": 2,
  "gestartet_am": "...",
  "abgeschlossen_am": "..."
}
```

---

## Apify-Client Muster

```python
from apify_client import ApifyClient
from config import settings

def run_google_maps(suchbegriff: str, limit: int) -> list[dict]:
    client = ApifyClient(settings.APIFY_API_TOKEN)
    run = client.actor("compass/crawler-google-places").call(run_input={
        "searchStringsArray": [suchbegriff],
        "maxCrawledPlacesPerSearch": limit,
        "language": "de",
        "countryCode": "ch",
    })
    return list(client.dataset(run["defaultDatasetId"]).iterate_items())
```

---

## Gemini-Client Muster

```python
import google.generativeai as genai
from config import settings

MODEL = "gemini-2.5-flash"

def analyse_screenshots(desktop_bytes: bytes, mobile_bytes: bytes, tech_data: dict) -> dict:
    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(MODEL)
    # ... prompt aufbauen, Bilder als base64 übergeben
    # ... JSON aus Antwort parsen
```

---

## R2-Client Muster (Screenshots speichern)

```python
import boto3
from config import settings

def upload_bytes(data: bytes, key: str, content_type: str = "image/png") -> str:
    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
    )
    s3.put_object(Bucket=settings.R2_BUCKET_NAME, Key=key, Body=data, ContentType=content_type)
    return f"{settings.R2_PUBLIC_URL}/{key}"
```

---

## Screenshot-Client Muster (Playwright)

```python
from playwright.sync_api import sync_playwright

def take_screenshots(url: str) -> tuple[bytes, bytes]:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # Desktop
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(url, timeout=15000, wait_until="networkidle")
        desktop = page.screenshot(full_page=False)
        # Mobile
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.goto(url, timeout=15000, wait_until="networkidle")
        mobile = page.screenshot(full_page=False)
        browser.close()
    return desktop, mobile
```

---

## Was dieses System NICHT macht
- Keine automatische Demo-Generierung
- Kein automatisierter E-Mail-Versand (kein Instantly)
- Keine KI-Extraktion von Website-Daten
- Keine branchenspezifischen Templates

---

## Erweiterungsideen (für später)
- Branche automatisch aus Suchbegriff ableiten
- Lead-Detailseite mit Screenshot-Vorschau und KI-Begründung
- CSV-Export der qualifizierten Leads
- Automatische Demo-Generierung nach `demo_gewuenscht`-Status (Phase 2 dieses Systems)
