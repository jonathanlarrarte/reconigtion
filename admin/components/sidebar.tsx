'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Users, FlaskConical, Activity, Settings, LogOut, Building2, BookOpen } from 'lucide-react'

const nav = [
  { href: '/',         label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/tenants',  label: 'Tenants',      icon: Users },
  { href: '/lab',      label: 'Face Lab',     icon: FlaskConical },
  { href: '/settings', label: 'Configuración', icon: Settings },
  { href: '/docs',     label: 'Documentación', icon: BookOpen },
]

const API_DOCS = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000') + '/api-docs'

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()

  async function handleLogout() {
    if (!confirm('¿Cerrar sesión del panel admin?')) return
    try {
      await fetch('/api/admin/logout', { method: 'POST' })
    } finally {
      router.push('/login')
    }
  }

  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 bg-white flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-600" />
          <span className="font-semibold text-slate-800 text-sm">FaceID Admin</span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 space-y-1">
        <a
          href="/portal"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
        >
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          Portal Empresa →
        </a>
        <a
          href={API_DOCS}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
        >
          API Docs →
        </a>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
