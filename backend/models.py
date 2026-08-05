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

    notizen: Mapped[list["LeadNotiz"]] = relationship(
        "LeadNotiz", back_populates="lead", cascade="all, delete"
    )
    anrufe: Mapped[list["LeadAnruf"]] = relationship(
        "LeadAnruf", back_populates="lead", cascade="all, delete"
    )


class LeadNotiz(Base):
    __tablename__ = "leads_notizen"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    place_id: Mapped[str] = mapped_column(
        String, ForeignKey("leads.place_id", ondelete="CASCADE")
    )
    autor: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    erstellt_am: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    lead: Mapped["Lead"] = relationship("Lead", back_populates="notizen")


class LeadAnruf(Base):
    __tablename__ = "leads_anrufe"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    place_id: Mapped[str] = mapped_column(
        String, ForeignKey("leads.place_id", ondelete="CASCADE")
    )
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
