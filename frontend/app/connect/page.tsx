'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  getConnectLeads,
  getTagesStats,
  getTotalStats,
  setStatus,
  setDemoVerschickt,
  addNotiz,
  getNotizen,
  bulkZuteilen,
  type ConnectLead,
} from '@/lib/api'

const PERSONEN = ['david', 'sinan', 'timo']
const GOAL = 5

const STATUS_OPTIONS = [
  { value: 'nicht_angerufen', label: 'Nicht angerufen' },
  { value: 'nicht_erreicht', label: 'Nicht erreicht' },
  { value: 'callback', label: 'Callback' },
  { value: 'demo_gewuenscht', label: 'Demo gewuenscht' },
  { value: 'kein_interesse', label: 'Kein Interesse' },
  { value: 'verkauft', label: 'Verkauft' },
  { value: 'website_zu_gut', label: 'Website zu gut' },
]

const TERMINAL = new Set(['kein_interesse', 'verkauft', 'website_zu_gut'])

const STATUS_COLOR: Record<string, string> = {
  nicht_angerufen: 'bg-gray-100 text-gray-600',
  nicht_erreicht: 'bg-yellow-100 text-yellow-700',
  callback: 'bg-orange-100 text-orange-700',
  demo_gewuenscht: 'bg-blue-100 text-blue-700',
  kein_interesse: 'bg-red-100 text-red-600',
  verkauft: 'bg-green-100 text-green-700',
  website_zu_gut: 'bg-purple-100 text-purple-700',
}

export default function ConnectPage() {
  const [leads, setLeads] = useState<ConnectLead[]>([])
  const [loading, setLoading] = useState(true)
  const [tages, setTages] = useState<Record<string, number>>({})
  const [totalStats, setTotalStats] = useState<Record<string, number>>({})
  const [filterKampagne, setFilterKampagne] = useState('')
  const [filterPerson, setFilterPerson] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [activePerson, setActivePerson] = useState('david')
  const [notizModal, setNotizModal] = useState<{ place_id: string; name: string } | null>(null)
  const [notizText, setNotizText] = useState('')
  const [notizHistory, setNotizHistory] = useState<Array<{ id: number; autor: string; text: string; erstellt_am: string }>>([])
  const [notizLoading, setNotizLoading] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const [ls, t, tot] = await Promise.all([
        getConnectLeads({
          kampagne: filterKampagne || undefined,
          person: filterPerson || undefined,
          status: filterStatus || undefined,
          search: filterSearch || undefined,
        }),
        getTagesStats(),
        getTotalStats(),
      ])
      setLeads(ls)
      setTages(t)
      setTotalStats(tot)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filterKampagne, filterPerson, filterStatus, filterSearch])

  useEffect(() => {
    load()
  }, [load])

  async function handleStatusChange(place_id: string, newStatus: string) {
    setPendingStatus((p) => ({ ...p, [place_id]: newStatus }))
    try {
      await setStatus(place_id, activePerson, newStatus)
      await load()
    } catch (e) {
      console.error(e)
    } finally {
      setPendingStatus((p) => { const n = { ...p }; delete n[place_id]; return n })
    }
  }

  async function handleDemoVerschickt(place_id: string) {
    try {
      await setDemoVerschickt(place_id)
      await load()
    } catch (e) {
      console.error(e)
    }
  }

  async function openNotizModal(lead: ConnectLead) {
    setNotizModal({ place_id: lead.place_id, name: lead.name })
    setNotizText('')
    setNotizLoading(true)
    try {
      const h = await getNotizen(lead.place_id)
      setNotizHistory(h)
    } catch (e) {
      console.error(e)
    } finally {
      setNotizLoading(false)
    }
  }

  async function handleNotizSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!notizModal || !notizText.trim()) return
    try {
      await addNotiz(notizModal.place_id, activePerson, notizText.trim())
      setNotizText('')
      const h = await getNotizen(notizModal.place_id)
      setNotizHistory(h)
      await load()
    } catch (e) {
      console.error(e)
    }
  }

  async function handleBulkZuteilen() {
    try {
      const r = await bulkZuteilen(filterKampagne || undefined)
      alert(`${r.zugeteilt} Leads zugeteilt.`)
      await load()
    } catch (e) {
      console.error(e)
    }
  }

  // Unique campaigns for filter
  const kampagnen = Array.from(new Set(leads.map((l) => l.kampagne).filter(Boolean))) as string[]

  return (
    <div className="max-w-full space-y-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Connect</h1>
        <div className="flex gap-4">
          {PERSONEN.map((p) => {
            const h = tages[p] ?? 0
            const reached = h >= GOAL
            return (
              <div key={p} className="text-center">
                <div className="text-xs text-gray-500 capitalize">{p}</div>
                <div className={`text-lg font-bold ${reached ? 'text-green-600' : 'text-gray-800'}`}>
                  {h}<span className="text-xs text-gray-400">/{GOAL}</span>
                </div>
                <div className="text-xs text-gray-400">{totalStats[p] ?? 0} ges.</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Active person selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Ich bin:</span>
        {PERSONEN.map((p) => (
          <button
            key={p}
            onClick={() => setActivePerson(p)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              activePerson === p
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none"
          value={filterKampagne}
          onChange={(e) => setFilterKampagne(e.target.value)}
        >
          <option value="">Alle Kampagnen</option>
          {kampagnen.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none"
          value={filterPerson}
          onChange={(e) => setFilterPerson(e.target.value)}
        >
          <option value="">Alle Personen</option>
          {PERSONEN.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
        </select>
        <select
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">Alle Status</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <input
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Name oder Telefon..."
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
        />
        <button
          onClick={handleBulkZuteilen}
          className="ml-auto text-xs border border-gray-200 rounded px-3 py-2 hover:bg-gray-50 text-gray-600"
        >
          Bulk zuteilen
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 py-8 text-center">Lade...</div>
      ) : leads.length === 0 ? (
        <div className="text-gray-400 py-8 text-center">Keine Leads im Connect.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-3 text-left w-12">Prio</th>
                <th className="px-3 py-3 text-left">Name</th>
                <th className="px-3 py-3 text-left">Telefon</th>
                <th className="px-3 py-3 text-left">Website</th>
                <th className="px-3 py-3 text-left w-28">Screenshot</th>
                <th className="px-3 py-3 text-left">KI-Begründung</th>
                <th className="px-3 py-3 text-left">Zugewiesen</th>
                <th className="px-3 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-left">Versuche</th>
                <th className="px-3 py-3 text-left">Letzte Notiz</th>
                <th className="px-3 py-3 text-left">Aktionen</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {leads.map((lead) => (
                <ConnectRow
                  key={lead.place_id}
                  lead={lead}
                  activePerson={activePerson}
                  pendingStatus={pendingStatus[lead.place_id]}
                  onStatusChange={handleStatusChange}
                  onDemoVerschickt={handleDemoVerschickt}
                  onOpenNotiz={openNotizModal}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notiz Modal */}
      {notizModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Notizen — {notizModal.name}</h2>
              <button
                onClick={() => setNotizModal(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleNotizSubmit} className="space-y-2">
              <textarea
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
                placeholder="Neue Notiz..."
                value={notizText}
                onChange={(e) => setNotizText(e.target.value)}
                required
              />
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
              >
                Speichern
              </button>
            </form>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {notizLoading ? (
                <div className="text-gray-400 text-sm">Lade...</div>
              ) : notizHistory.length === 0 ? (
                <div className="text-gray-400 text-sm">Keine Notizen.</div>
              ) : (
                notizHistory.map((n) => (
                  <div key={n.id} className="bg-gray-50 rounded p-3 text-sm">
                    <div className="text-xs text-gray-400 mb-1">
                      {n.autor} · {new Date(n.erstellt_am).toLocaleString('de-CH')}
                    </div>
                    <div className="text-gray-700">{n.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ConnectRow({
  lead,
  activePerson,
  pendingStatus,
  onStatusChange,
  onDemoVerschickt,
  onOpenNotiz,
}: {
  lead: ConnectLead
  activePerson: string
  pendingStatus?: string
  onStatusChange: (place_id: string, status: string) => void
  onDemoVerschickt: (place_id: string) => void
  onOpenNotiz: (lead: ConnectLead) => void
}) {
  const isTerminal = TERMINAL.has(lead.connect_status ?? '')
  const currentStatus = pendingStatus ?? lead.connect_status ?? 'nicht_angerufen'

  return (
    <tr className={`hover:bg-gray-50 ${lead.ki_prioritaet_hoch ? 'bg-amber-50' : ''}`}>
      <td className="px-3 py-3">
        {lead.ki_prioritaet_hoch && (
          <span className="text-amber-500 font-bold text-base" title="Hohe Priorität">★</span>
        )}
      </td>
      <td className="px-3 py-3 font-medium text-gray-900 max-w-[160px]">
        <div className="truncate">{lead.name}</div>
        {lead.connect_zugewiesen && (
          <div className="text-xs text-gray-400 capitalize">{lead.connect_zugewiesen}</div>
        )}
      </td>
      <td className="px-3 py-3">
        {lead.telefon ? (
          <a href={`tel:${lead.telefon}`} className="text-blue-600 hover:underline text-sm">
            {lead.telefon}
          </a>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        {lead.website_url ? (
          <a
            href={lead.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-xs truncate block max-w-[140px]"
          >
            {lead.website_url.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        {lead.screenshot_desktop ? (
          <a href={lead.screenshot_desktop} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lead.screenshot_desktop}
              alt="Screenshot"
              className="w-24 h-16 object-cover rounded border border-gray-200 hover:opacity-80 transition"
            />
          </a>
        ) : (
          <span className="text-gray-300 text-xs">kein Screenshot</span>
        )}
      </td>
      <td className="px-3 py-3 text-xs text-gray-500 max-w-[200px]">
        <span className="line-clamp-2">{lead.ki_begruendung || '—'}</span>
      </td>
      <td className="px-3 py-3 text-sm capitalize text-gray-600">
        {lead.connect_zugewiesen || <span className="text-gray-300">—</span>}
      </td>
      <td className="px-3 py-3">
        <select
          className={`border rounded px-2 py-1 text-xs focus:outline-none ${STATUS_COLOR[currentStatus] ?? 'bg-gray-100 text-gray-600'} ${isTerminal ? 'opacity-60 cursor-not-allowed' : ''}`}
          value={currentStatus}
          disabled={isTerminal}
          onChange={(e) => onStatusChange(lead.place_id, e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3 text-center text-sm text-gray-600">
        {lead.connect_versuche ?? 0}
      </td>
      <td className="px-3 py-3 text-xs text-gray-500 max-w-[160px]">
        {lead.letzte_notiz ? (
          <div>
            <div className="font-medium text-gray-700 truncate">{lead.letzte_notiz.text}</div>
            <div className="text-gray-400">{lead.letzte_notiz.autor}</div>
          </div>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onOpenNotiz(lead)}
            className="text-xs border border-gray-200 rounded px-2 py-1 hover:bg-gray-100 text-gray-600"
            title="Notiz hinzufügen"
          >
            Notiz
          </button>
          {lead.connect_status === 'demo_gewuenscht' && !lead.demo_verschickt_am && (
            <button
              onClick={() => onDemoVerschickt(lead.place_id)}
              className="text-xs bg-green-600 text-white rounded px-2 py-1 hover:bg-green-700"
            >
              Demo ✓
            </button>
          )}
          {lead.demo_verschickt_am && (
            <span className="text-xs text-green-600 font-medium">Demo verschickt</span>
          )}
        </div>
      </td>
    </tr>
  )
}
