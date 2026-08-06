'use client'

import { useEffect, useState } from 'react'
import { getLeads, getConnectLeads, type ConnectLead } from '@/lib/api'

const STATUS_LABELS: Record<string, string> = {
  nicht_angerufen: 'Nicht angerufen',
  nicht_erreicht: 'Nicht erreicht',
  callback: 'Callback',
  demo_gewuenscht: 'Demo gewünscht',
  kein_interesse: 'Kein Interesse',
  website_zu_gut: 'Website zu gut',
}

const STATUS_COLORS: Record<string, string> = {
  nicht_angerufen: 'text-gray-700',
  nicht_erreicht: 'text-yellow-600',
  callback: 'text-orange-600',
  demo_gewuenscht: 'text-blue-600',
  kein_interesse: 'text-red-500',
  website_zu_gut: 'text-purple-600',
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [totalLeads, setTotalLeads] = useState(0)
  const [analysiert, setAnalysiert] = useState(0)
  const [kiEmpfohlen, setKiEmpfohlen] = useState(0)
  const [fehler, setFehler] = useState(0)
  const [entdeckt, setEntdeckt] = useState(0)
  const [connectLeads, setConnectLeads] = useState<ConnectLead[]>([])
  const [demos, setDemos] = useState(0)

  useEffect(() => {
    async function load() {
      try {
        const [all, ana, ki, err, disc, connect] = await Promise.all([
          getLeads({ limit: 1 }),
          getLeads({ status: 'analysiert', limit: 1 }),
          getLeads({ ki_empfehlung: true, limit: 1 }),
          getLeads({ status: 'fehler', limit: 1 }),
          getLeads({ status: 'entdeckt', limit: 1 }),
          getConnectLeads(),
        ])
        setTotalLeads(all.total)
        setAnalysiert(ana.total)
        setKiEmpfohlen(ki.total)
        setFehler(err.total)
        setEntdeckt(disc.total)
        setConnectLeads(connect)
        setDemos(connect.filter(l => l.demo_verschickt_am).length)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const statusCounts = Object.keys(STATUS_LABELS).reduce((acc, key) => {
    acc[key] = connectLeads.filter(l => l.connect_status === key).length
    return acc
  }, {} as Record<string, number>)

  const verkauft = statusCounts['verkauft'] ?? 0
  const inCalling = connectLeads.length

  if (loading) return <div className="text-gray-400 p-8">Lade...</div>

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Pipeline */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Pipeline</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Leads total" value={totalLeads} />
          <Stat label="Ausstehend" value={entdeckt} />
          <Stat label="Analysiert" value={analysiert} />
          <Stat label="Fehler" value={fehler} color="red" />
        </div>
      </div>

      {/* Cold Calling */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Cold Calling</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Stat label="KI-Empfohlen" value={kiEmpfohlen} color="blue" />
          <Stat label="Im Calling" value={inCalling} />
          <Stat label="Demos verschickt" value={demos} color="blue" />
          <Stat label="Verkauft" value={verkauft} color="green" />
        </div>

        {/* Status breakdown */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-gray-400 mb-3">Status-Verteilung</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <div key={key} className="flex justify-between items-center">
                <span className="text-sm text-gray-500">{label}</span>
                <span className={`text-sm font-semibold ${STATUS_COLORS[key]}`}>
                  {statusCounts[key] ?? 0}
                </span>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {inCalling > 0 && (
            <div className="mt-4 flex h-2 rounded-full overflow-hidden gap-px">
              {Object.entries(STATUS_LABELS).map(([key]) => {
                const count = statusCounts[key] ?? 0
                const pct = (count / inCalling) * 100
                if (pct === 0) return null
                const bgMap: Record<string, string> = {
                  nicht_angerufen: 'bg-gray-300',
                  nicht_erreicht: 'bg-yellow-400',
                  callback: 'bg-orange-400',
                  demo_gewuenscht: 'bg-blue-400',
                  kein_interesse: 'bg-red-400',
                  website_zu_gut: 'bg-purple-400',
                }
                return (
                  <div
                    key={key}
                    className={`${bgMap[key]} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${STATUS_LABELS[key]}: ${count}`}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color = 'default' }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    default: 'text-gray-900',
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-500',
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${colorMap[color]}`}>{value}</div>
    </div>
  )
}
