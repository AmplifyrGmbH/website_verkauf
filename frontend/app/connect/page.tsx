'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  getConnectLeads,
  setStatus,
  setDemoVerschickt,
  addNotiz,
  getNotizen,
  type ConnectLead,
} from '@/lib/api'

const PERSONEN = ['david', 'timo', 'sinan']

const STATUS_OPTIONS = [
  { value: 'nicht_angerufen', label: 'Nicht angerufen' },
  { value: 'nicht_erreicht', label: 'Nicht erreicht' },
  { value: 'callback', label: 'Callback' },
  { value: 'demo_gewuenscht', label: 'Demo gewünscht' },
  { value: 'kein_interesse', label: 'Kein Interesse' },
  { value: 'website_zu_gut', label: 'Website zu gut' },
]

const TERMINAL = new Set(['kein_interesse', 'website_zu_gut'])


export default function ConnectPage() {
  const [allLeads, setAllLeads] = useState<ConnectLead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [personFilter, setPersonFilter] = useState('')

  const load = useCallback(async () => {
    try {
      const ls = await getConnectLeads()
      setAllLeads(ls)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Filter leads based on search + status + person
  const filtered = allLeads.filter((l) => {
    if (statusFilter && l.connect_status !== statusFilter) return false
    if (personFilter && l.connect_zugewiesen !== personFilter) return false
    if (search) {
      const digits = search.replace(/[\s\-\+\(\)]/g, '')
      const tel = (l.telefon || '').replace(/[\s\-\+\(\)]/g, '')
      if (!l.name.toLowerCase().includes(search.toLowerCase()) && !tel.includes(digits)) return false
    }
    return true
  })

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Cold Calling</h1>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          className="w-64 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
          placeholder="Name oder Telefonnummer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Alle Stati</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
          value={personFilter}
          onChange={(e) => setPersonFilter(e.target.value)}
        >
          <option value="">Alle Personen</option>
          {PERSONEN.map(p => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="text-gray-400 py-8 text-center">Lade...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400 py-8 text-center">Keine Leads.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((lead) => (
            <LeadCard key={lead.place_id} lead={lead} onReload={load} />
          ))}
        </div>
      )}
    </div>
  )
}

function LeadCard({ lead, onReload }: { lead: ConnectLead; onReload: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [notizen, setNotizen] = useState<Array<{ id: number; autor: string; text: string; erstellt_am: string }>>([])
  const [notizText, setNotizText] = useState('')
  const [notizLoading, setNotizLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isTerminal = TERMINAL.has(lead.connect_status ?? '')

  const loadNotizen = useCallback(async () => {
    setNotizLoading(true)
    try {
      const n = await getNotizen(lead.place_id)
      setNotizen(n)
    } catch (e) {
      console.error(e)
    } finally {
      setNotizLoading(false)
    }
  }, [lead.place_id])

  useEffect(() => {
    if (expanded) loadNotizen()
  }, [expanded, loadNotizen])

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value
    // Use the currently displayed person — derive from zugewiesen or default
    const person = lead.connect_zugewiesen || 'david'
    try {
      await setStatus(lead.place_id, person, newStatus)
      onReload()
    } catch (e) { console.error(e) }
  }

  async function handleAgentChange(e: React.ChangeEvent<HTMLSelectElement>) {
    // Patch via status endpoint with same status to update zugewiesen
    // We'll use the PATCH leads endpoint instead
    const agent = e.target.value
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8004'}/api/v1/connect/${lead.place_id}/zuweisen`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person: agent }),
      })
      onReload()
    } catch (e) { console.error(e) }
  }

  async function handleDemoVerschickt() {
    try {
      await setDemoVerschickt(lead.place_id)
      onReload()
    } catch (e) { console.error(e) }
  }

  async function handleNotizSave() {
    if (!notizText.trim()) return
    const person = lead.connect_zugewiesen || 'david'
    try {
      await addNotiz(lead.place_id, person, notizText.trim())
      setNotizText('')
      await loadNotizen()
      onReload()
    } catch (e) { console.error(e) }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleNotizSave()
    }
  }

  // Timeline events
  const timeline: { time: string; label: string }[] = []
  if (lead.entdeckt_am) timeline.push({ time: lead.entdeckt_am, label: 'Lead erstellt' })
  if (lead.analysiert_am) timeline.push({ time: lead.analysiert_am, label: 'Analysiert' })
  notizen.slice().reverse().forEach(n => timeline.push({ time: n.erstellt_am, label: n.text }))

  const notenPreview = lead.letzte_notiz?.text

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3">
        <div className="flex items-start gap-2">
          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-0.5 text-gray-400 hover:text-gray-600 shrink-0 w-4"
          >
            <span className={`inline-block transition-transform text-xs ${expanded ? '' : '-rotate-90'}`}>▼</span>
          </button>

          {/* Name + subtitle */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-semibold text-gray-900">{lead.name}</span>
              {!notenPreview && (
                <span className="text-sm text-gray-400 italic">Keine Notizen</span>
              )}
              {notenPreview && (
                <span className="text-sm text-gray-500 truncate max-w-xs">{notenPreview}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {lead.suchbegriff && (
                <span className="text-sm text-gray-500 capitalize">{lead.suchbegriff}</span>
              )}
              {lead.telefon && (
                <a href={`tel:${lead.telefon}`} className="text-sm text-blue-500 hover:underline">
                  {lead.telefon}
                </a>
              )}
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {/* Agent dropdown */}
            <select
              className="border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-600 bg-white focus:outline-none"
              value={lead.connect_zugewiesen || ''}
              onChange={handleAgentChange}
            >
              <option value="">— Kein Agent</option>
              {PERSONEN.map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>

            {/* Status dropdown */}
            <select
              className="border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-600 bg-white focus:outline-none disabled:opacity-50"
              value={lead.connect_status || 'nicht_angerufen'}
              disabled={isTerminal}
              onChange={handleStatusChange}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>

            {/* Demo */}
            {!lead.demo_verschickt_am ? (
              <button
                onClick={handleDemoVerschickt}
                className="text-sm text-purple-600 hover:text-purple-800 font-medium whitespace-nowrap"
              >
                Demo erstellen
              </button>
            ) : (
              <span className="text-sm text-green-600 font-medium whitespace-nowrap">Demo verschickt</span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-6 py-4 space-y-4">
          {/* Timeline */}
          {notizLoading ? (
            <div className="text-sm text-gray-400">Lade...</div>
          ) : (
            <div className="space-y-0">
              {timeline.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                    {i < timeline.length - 1 && <div className="w-px bg-gray-200 flex-1 my-0.5 h-5" />}
                  </div>
                  <div className="pb-1">
                    <span className="text-xs text-gray-400 mr-2">
                      {new Date(item.time).toLocaleString('de-CH')}
                    </span>
                    <span className="text-sm font-medium text-gray-700">{item.label}</span>
                  </div>
                </div>
              ))}
              {timeline.length === 0 && (
                <div className="text-sm text-gray-400">Noch keine Einträge.</div>
              )}
            </div>
          )}

          {/* Note input */}
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-300"
              rows={2}
              placeholder="Notiz... (⌘+Enter)"
              value={notizText}
              onChange={(e) => setNotizText(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              onClick={handleNotizSave}
              disabled={!notizText.trim()}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 self-end"
            >
              Speichern
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
