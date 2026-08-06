'use client'

import { useEffect, useState, useCallback } from 'react'
import { startDiscovery, startAnalyse, getJobs, type Job } from '@/lib/api'

export default function PipelinePage() {
  const [suchbegriff, setSuchbegriff] = useState('')
  const [limit, setLimit] = useState<number | ''>('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const loadJobs = useCallback(async () => {
    try {
      const j = await getJobs()
      setJobs(j)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    loadJobs()
    const interval = setInterval(loadJobs, 5000)
    return () => clearInterval(interval)
  }, [loadJobs])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!suchbegriff.trim()) return
    setLoading(true)
    setMsg('')
    try {
      const r1 = await startDiscovery(suchbegriff.trim(), limit === '' ? 100 : limit)
      setMsg(`Discovery gestartet (Job #${r1.job_id}) — Analyse startet danach automatisch`)
      setSuchbegriff('')
      loadJobs()
      // Poll until discovery job is done, then start analyse
      const pollAndAnalyse = async () => {
        for (let i = 0; i < 120; i++) {
          await new Promise((res) => setTimeout(res, 5000))
          const jobs = await getJobs()
          const dJob = jobs.find((j) => j.id === r1.job_id)
          if (dJob?.status === 'abgeschlossen' || dJob?.status === 'fehler') {
            const r2 = await startAnalyse()
            setMsg(`Discovery abgeschlossen — Analyse gestartet (Job #${r2.job_id})`)
            loadJobs()
            return
          }
        }
      }
      pollAndAnalyse()
    } catch (e: unknown) {
      setMsg(`Fehler: ${e instanceof Error ? e.message : 'Unbekannt'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Pipeline</h1>

      {msg && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-3 text-sm">
          {msg}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-lg">Discovery + Analyse starten</h2>
        <p className="text-sm text-gray-500">
          Discovery läuft zuerst, Analyse startet automatisch danach.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Suchbegriffe
              <span className="ml-2 text-xs text-gray-400 font-normal">kommagetrennt — pro Begriff werden {limit || 100} Leads geholt</span>
            </label>
            <textarea
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
              placeholder="z.B. Zahnarzt Zürich, Restaurant Bern, Fitnessstudio Basel"
              value={suchbegriff}
              onChange={(e) => setSuchbegriff(e.target.value)}
              required
            />
            {suchbegriff.trim() && (
              <div className="mt-1 flex flex-wrap gap-1">
                {suchbegriff.split(',').map(s => s.trim()).filter(Boolean).map((s, i) => (
                  <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Limit</label>
            <input
              type="number"
              className="w-32 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={limit}
              placeholder="100"
              min={1}
              max={500}
              onChange={(e) => setLimit(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Startet...' : 'Starten'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Jobs</h2>
          <button
            onClick={loadJobs}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1"
          >
            Aktualisieren
          </button>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm text-gray-400">Noch keine Jobs.</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function JobRow({ job }: { job: Job }) {
  const statusColor: Record<string, string> = {
    laufend: 'bg-yellow-100 text-yellow-800',
    abgeschlossen: 'bg-green-100 text-green-800',
    fehler: 'bg-red-100 text-red-800',
  }
  const pct =
    job.total && job.total > 0 ? Math.round(((job.verarbeitet ?? 0) / job.total) * 100) : null

  return (
    <div className="border border-gray-100 rounded-lg p-3 text-sm">
      <div className="flex items-center gap-3">
        <span className="font-medium text-gray-700">#{job.id}</span>
        <span className="capitalize text-gray-600">{job.typ}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[job.status] ?? 'bg-gray-100 text-gray-700'}`}>
          {job.status}
        </span>
        {pct !== null && (
          <span className="text-gray-500">
            {job.verarbeitet}/{job.total} ({pct}%)
          </span>
        )}
        {job.fehler ? <span className="text-red-500">{job.fehler} Fehler</span> : null}
      </div>
      {job.log && <div className="text-xs text-gray-400 mt-1">{job.log}</div>}
      {job.gestartet_am && (
        <div className="text-xs text-gray-400">
          {new Date(job.gestartet_am).toLocaleString('de-CH')}
        </div>
      )}
    </div>
  )
}
