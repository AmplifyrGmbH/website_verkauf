'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { getLeads, type Lead } from '@/lib/api'

const STATUS_OPTIONS = ['', 'entdeckt', 'analysiert', 'fehler']
export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getLeads({
        search: search || undefined,
        status: status || undefined,

        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      setLeads(r.leads)
      setTotal(r.total)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [search, status, page])

  useEffect(() => {
    load()
  }, [load])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(0)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Leads</h1>
        <span className="text-sm text-gray-500">{total} total</span>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-end">
        <input
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Name oder Telefon..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
        />
        <select
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0) }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s || 'Alle Status'}</option>
          ))}
        </select>

      </form>

      {loading ? (
        <div className="text-gray-400 py-8 text-center">Lade...</div>
      ) : leads.length === 0 ? (
        <div className="text-gray-400 py-8 text-center">Keine Leads gefunden.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Ort</th>
                <th className="px-4 py-3 text-left">Telefon</th>
                <th className="px-4 py-3 text-left">Website</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">KI</th>
                <th className="px-4 py-3 text-left">Suchbegriff</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {leads.map((l) => (
                <tr key={l.place_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/leads/${encodeURIComponent(l.place_id)}`} className="hover:text-blue-600 hover:underline">
                      {l.name_anzeige || l.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{l.ort || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{l.telefon || '—'}</td>
                  <td className="px-4 py-3">
                    {l.website_url ? (
                      <a
                        href={l.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline truncate block max-w-[180px]"
                      >
                        {l.website_domain || l.website_url}
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="px-4 py-3">
                    {l.ki_empfehlung === true && (
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">Ja</span>
                    )}
                    {l.ki_empfehlung === false && (
                      <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs">Nein</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{l.suchbegriff || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-3 py-1 text-sm border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
        >
          Zurück
        </button>
        <span className="px-3 py-1 text-sm text-gray-500">Seite {page + 1}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={(page + 1) * PAGE_SIZE >= total}
          className="px-3 py-1 text-sm border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
        >
          Weiter
        </button>
      </div>
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
