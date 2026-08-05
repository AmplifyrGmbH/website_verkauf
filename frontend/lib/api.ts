const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8004'

export interface Lead {
  place_id: string
  name: string
  name_anzeige?: string
  adresse?: string
  ort?: string
  telefon?: string
  email?: string
  website_url?: string
  website_domain?: string
  google_rating?: number
  google_anzahl?: number
  suchbegriff?: string
  branche?: string
  kampagne?: string
  status: string
  website_erreichbar?: boolean
  hat_ssl?: boolean
  ladezeit_s?: number
  screenshot_desktop?: string
  screenshot_mobile?: string
  hat_viewport?: boolean
  moderner_doctype?: boolean
  tabellen_layout?: boolean
  hat_og_image?: boolean
  hat_meta_desc?: boolean
  hat_favicon?: boolean
  hat_whatsapp?: boolean
  hat_chat?: boolean
  hat_terminbuchung?: boolean
  baukasten_domain?: string
  parking_seite?: boolean
  ki_empfehlung?: boolean
  ki_begruendung?: string
  ki_prioritaet_hoch?: boolean
  connect_status?: string
  connect_zugewiesen?: string
  connect_versuche?: number
  connect_letzter_versuch_am?: string
  outreach_status?: string
  demo_verschickt_am?: string
  entdeckt_am?: string
  analysiert_am?: string
}

export interface ConnectLead {
  place_id: string
  name: string
  telefon?: string
  website_url?: string
  screenshot_desktop?: string
  kampagne?: string
  suchbegriff?: string
  ki_begruendung?: string
  ki_prioritaet_hoch?: boolean
  connect_status?: string
  connect_zugewiesen?: string
  connect_versuche?: number
  connect_letzter_versuch_am?: string
  demo_verschickt_am?: string
  letzte_notiz?: {
    text: string
    autor: string
    erstellt_am: string
  } | null
}

export interface Job {
  id: number
  typ: string
  status: string
  total?: number
  verarbeitet?: number
  fehler?: number
  log?: string
  gestartet_am?: string
  abgeschlossen_am?: string
}

export interface Stats {
  david: number
  sinan: number
  timo: number
}

// --- Pipeline ---

export async function startDiscovery(suchbegriff: string, limit: number): Promise<{ job_id: number }> {
  const r = await fetch(`${BASE}/api/v1/pipeline/discovery/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suchbegriff, limit }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function startAnalyse(limit?: number): Promise<{ job_id: number }> {
  const r = await fetch(`${BASE}/api/v1/pipeline/analyse/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: limit ?? null }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getJobs(): Promise<Job[]> {
  const r = await fetch(`${BASE}/api/v1/pipeline/jobs`, { cache: 'no-store' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getJob(id: number): Promise<Job> {
  const r = await fetch(`${BASE}/api/v1/pipeline/jobs/${id}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

// --- Leads ---

export async function getLeads(params?: {
  status?: string
  ki_empfehlung?: boolean
  search?: string
  limit?: number
  offset?: number
}): Promise<{ total: number; leads: Lead[] }> {
  const q = new URLSearchParams()
  if (params?.status) q.set('status', params.status)
  if (params?.ki_empfehlung !== undefined) q.set('ki_empfehlung', String(params.ki_empfehlung))
  if (params?.search) q.set('search', params.search)
  if (params?.limit !== undefined) q.set('limit', String(params.limit))
  if (params?.offset !== undefined) q.set('offset', String(params.offset))
  const r = await fetch(`${BASE}/api/v1/leads/?${q}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

// --- Connect ---

export async function getConnectLeads(params?: {
  kampagne?: string
  person?: string
  status?: string
  search?: string
}): Promise<ConnectLead[]> {
  const q = new URLSearchParams()
  if (params?.kampagne) q.set('kampagne', params.kampagne)
  if (params?.person) q.set('person', params.person)
  if (params?.status) q.set('status', params.status)
  if (params?.search) q.set('search', params.search)
  const r = await fetch(`${BASE}/api/v1/connect/?${q}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getTagesStats(): Promise<Stats> {
  const r = await fetch(`${BASE}/api/v1/connect/tages-stats`, { cache: 'no-store' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getTotalStats(): Promise<Stats> {
  const r = await fetch(`${BASE}/api/v1/connect/total-stats`, { cache: 'no-store' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function bulkZuteilen(kampagne?: string): Promise<{ zugeteilt: number }> {
  const r = await fetch(`${BASE}/api/v1/connect/bulk-zuteilen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kampagne: kampagne ?? null }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function setStatus(
  place_id: string,
  person: string,
  status: string,
  notiz?: string,
): Promise<void> {
  const r = await fetch(`${BASE}/api/v1/connect/${place_id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person, status, notiz }),
  })
  if (!r.ok) throw new Error(await r.text())
}

export async function setDemoVerschickt(place_id: string): Promise<void> {
  const r = await fetch(`${BASE}/api/v1/connect/${place_id}/demo-verschickt`, {
    method: 'PATCH',
  })
  if (!r.ok) throw new Error(await r.text())
}

export async function addNotiz(place_id: string, autor: string, text: string): Promise<void> {
  const r = await fetch(`${BASE}/api/v1/connect/${place_id}/notiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autor, text }),
  })
  if (!r.ok) throw new Error(await r.text())
}

export async function getNotizen(place_id: string): Promise<Array<{ id: number; autor: string; text: string; erstellt_am: string }>> {
  const r = await fetch(`${BASE}/api/v1/connect/${place_id}/notizen`, { cache: 'no-store' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}
