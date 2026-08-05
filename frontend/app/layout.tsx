import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Leads Agent',
  description: 'Sales Automation Dashboard',
}

const NAV = [
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/leads', label: 'Leads' },
  { href: '/connect', label: 'Connect' },
  { href: '/', label: 'Dashboard' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <div className="min-h-screen flex flex-col">
          <nav className="bg-gray-900 text-white px-6 py-3 flex items-center gap-6">
            <span className="font-bold text-lg tracking-tight">Leads Agent</span>
            <div className="flex gap-4 ml-4">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="text-sm text-gray-300 hover:text-white transition-colors"
                >
                  {n.label}
                </Link>
              ))}
            </div>
          </nav>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  )
}
