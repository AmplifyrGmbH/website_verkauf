'use client'

import { useEffect, useState } from 'react'
import { getLeads, getTagesStats, getTotalStats } from '@/lib/api'

interface DashboardStats {
  total: number
  analysiert: number
  empfohlen: number
  in_kampagne: number
  demos: number
  verkauft: number
}

const GOAL = 5

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [tages, setTages] = useState<Record<string, number>>({})
  const [total, setTotal] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [all, analysiert, empfohlen, inK, demos, verkauft, t, tot] = await Promise.all([
          getLeads({ limit: 1 }),
          getLeads({ status: 'analysiert', limit: 1 }),
          getLeads({ ki_empfehlung: true, limit: 1 }),
          getLeads({ limit: 1 }),
          getLeads({ limit: 1 }),
          getLeads({ limit: 1 }),
          getTagesStats(),
          getTotalStats(),
        ])
        setStats({
          total: all.total,
          analysiert: analysiert.total,
          empfohlen: empfohlen.total,
          in_kampagne: 0,
          demos: 0,
          verkauft: 0,
        })
        setTages(t)
        setTotal(tot)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="text-gray-500">Lade...</div>

  const PERSONEN = ['david', 'sinan', 'timo']

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard label="Leads total" value={stats.total} />
          <StatCard label="Analysiert" value={stats.analysiert} />
          <StatCard label="KI-Empfohlen" value={stats.empfohlen} color="blue" />
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Anrufe heute</h2>
        <div className="grid grid-cols-3 gap-4">
          {PERSONEN.map((p) => {
            const heute = tages[p] ?? 0
            const reached = heute >= GOAL
            return (
              <div
                key={p}
                className={`rounded-lg border p-4 ${reached ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white'}`}
              >
                <div className="text-sm font-medium capitalize text-gray-600">{p}</div>
                <div className={`text-3xl font-bold mt-1 ${reached ? 'text-green-600' : 'text-gray-900'}`}>
                  {heute}
                  <span className="text-base font-normal text-gray-400"> / {GOAL}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">Total: {total[p] ?? 0}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color = 'gray' }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    gray: 'text-gray-900',
    blue: 'text-blue-600',
    green: 'text-green-600',
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${colorMap[color]}`}>{value}</div>
    </div>
  )
}
