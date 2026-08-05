'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { type Lead } from '@/lib/api'

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8004'

export default function LeadDetailPage() {
  const { place_id } = useParams<{ place_id: string }>()
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${BASE}/api/v1/leads/${encodeURIComponent(place_id)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setLead)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [place_id])

  if (loading) return <div className="text-gray-400 p-8">Lade...</div>
  if (!lead) return <div className="text-gray-400 p-8">Lead nicht gefunden.</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/leads" className="text-sm text-gray-400 hover:text-gray-600">← Leads</Link>
        <h1 className="text-2xl font-bold">{lead.name_anzeige || lead.name}</h1>
        <StatusBadge status={lead.status} />
      </div>

      {/* Stammdaten */}
      <Section title="Stammdaten">
        <Row label="Name" value={lead.name} />
        <Row label="Anzeigename" value={lead.name_anzeige} />
        <Row label="Adresse" value={lead.adresse} />
        <Row label="Ort" value={lead.ort} />
        <Row label="Telefon" value={lead.telefon} link={lead.telefon ? `tel:${lead.telefon}` : undefined} />
        <Row label="E-Mail" value={lead.email} link={lead.email ? `mailto:${lead.email}` : undefined} />
        <Row label="Website" value={lead.website_url} link={lead.website_url} />
        <Row label="Domain" value={lead.website_domain} />
        <Row label="Suchbegriff" value={lead.suchbegriff} />
        <Row label="Branche" value={lead.branche} />
        <Row label="Kampagne" value={lead.kampagne} />
        <Row label="Google Bewertung" value={lead.google_rating ? `${lead.google_rating} ★ (${lead.google_anzahl} Bewertungen)` : undefined} />
        <Row label="Entdeckt am" value={lead.entdeckt_am ? new Date(lead.entdeckt_am).toLocaleString('de-CH') : undefined} />
        <Row label="Analysiert am" value={lead.analysiert_am ? new Date(lead.analysiert_am).toLocaleString('de-CH') : undefined} />
      </Section>

      {/* Screenshots */}
      {(lead.screenshot_desktop || lead.screenshot_mobile) && (
        <Section title="Screenshots">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {lead.screenshot_desktop && (
              <div>
                <div className="text-xs text-gray-400 mb-1">Desktop</div>
                <a href={lead.screenshot_desktop} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={lead.screenshot_desktop} alt="Desktop Screenshot" className="rounded border border-gray-200 w-full hover:opacity-90 transition" />
                </a>
              </div>
            )}
            {lead.screenshot_mobile && (
              <div>
                <div className="text-xs text-gray-400 mb-1">Mobile</div>
                <a href={lead.screenshot_mobile} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={lead.screenshot_mobile} alt="Mobile Screenshot" className="rounded border border-gray-200 w-full hover:opacity-90 transition" />
                </a>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* KI-Analyse */}
      <Section title="KI-Analyse">
        <Row label="Empfehlung" value={lead.ki_empfehlung === true ? 'Ja — kontaktieren' : lead.ki_empfehlung === false ? 'Nein' : undefined} highlight={lead.ki_empfehlung === true} />
        <Row label="Priorität hoch" value={lead.ki_prioritaet_hoch === true ? 'Ja' : lead.ki_prioritaet_hoch === false ? 'Nein' : undefined} />
        <Row label="Begründung" value={lead.ki_begruendung} />
        <Row label="Parking-Seite" value={lead.parking_seite === true ? 'Ja' : lead.parking_seite === false ? 'Nein' : undefined} />
      </Section>

      {/* Technische Analyse */}
      <Section title="Technische Analyse">
        <Row label="Website erreichbar" value={boolVal(lead.website_erreichbar)} />
        <Row label="SSL" value={boolVal(lead.hat_ssl)} />
        <Row label="Ladezeit" value={lead.ladezeit_s != null ? `${lead.ladezeit_s}s` : undefined} />
        <Row label="Viewport (Responsive)" value={boolVal(lead.hat_viewport)} />
        <Row label="Moderner Doctype" value={boolVal(lead.moderner_doctype)} />
        <Row label="Tabellenlayout" value={boolVal(lead.tabellen_layout)} />
        <Row label="OG Image" value={boolVal(lead.hat_og_image)} />
        <Row label="Meta Description" value={boolVal(lead.hat_meta_desc)} />
        <Row label="Favicon" value={boolVal(lead.hat_favicon)} />
        <Row label="WhatsApp" value={boolVal(lead.hat_whatsapp)} />
        <Row label="Live Chat" value={boolVal(lead.hat_chat)} />
        <Row label="Terminbuchung" value={boolVal(lead.hat_terminbuchung)} />
        <Row label="Baukasten" value={lead.baukasten_domain} />
      </Section>

      {/* Connect */}
      <Section title="Connect">
        <Row label="Connect Status" value={lead.connect_status} />
        <Row label="Zugewiesen" value={lead.connect_zugewiesen} />
        <Row label="Anrufversuche" value={lead.connect_versuche != null ? String(lead.connect_versuche) : undefined} />
        <Row label="Letzter Versuch" value={lead.connect_letzter_versuch_am ? new Date(lead.connect_letzter_versuch_am).toLocaleString('de-CH') : undefined} />
        <Row label="Demo verschickt" value={lead.demo_verschickt_am ? new Date(lead.demo_verschickt_am).toLocaleString('de-CH') : undefined} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-700 mb-3">{title}</h2>
      <div className="divide-y divide-gray-50">{children}</div>
    </div>
  )
}

function Row({ label, value, link, highlight }: { label: string; value?: string | null; link?: string; highlight?: boolean }) {
  if (value == null || value === '') return null
  return (
    <div className="flex py-2 text-sm gap-4">
      <span className="text-gray-400 w-44 shrink-0">{label}</span>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
          {value}
        </a>
      ) : (
        <span className={highlight ? 'text-green-600 font-medium' : 'text-gray-800'}>{value}</span>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    entdeckt: 'bg-gray-100 text-gray-600',
    analysiert: 'bg-blue-100 text-blue-700',
    fehler: 'bg-red-100 text-red-600',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

function boolVal(v?: boolean | null): string | undefined {
  if (v === true) return 'Ja'
  if (v === false) return 'Nein'
  return undefined
}
