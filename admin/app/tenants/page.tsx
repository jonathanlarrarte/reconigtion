'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { api } from '@/lib/api'
import type { Tenant } from '@/lib/types'

const PLAN_BADGE: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600',
  business: 'bg-indigo-100 text-indigo-700',
  enterprise: 'bg-purple-100 text-purple-700',
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.listTenants()
      .then(setTenants)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tenants</h1>
          <p className="text-sm text-slate-500 mt-1">{tenants.length} tenant{tenants.length !== 1 ? 's' : ''} registrados</p>
        </div>
        <Link
          href="/tenants/new"
          className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuevo Tenant
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o slug..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading && <div className="p-12 text-center text-sm text-slate-400">Cargando...</div>}
        {error && <div className="p-6 text-center text-sm text-red-500">Error: {error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-slate-400">
            {search ? 'Sin resultados.' : 'No hay tenants.'}{' '}
            {!search && <Link href="/tenants/new" className="text-indigo-600 hover:underline">Crear uno</Link>}
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left">Nombre / Slug</th>
                <th className="px-6 py-3 text-left">Plan</th>
                <th className="px-6 py-3 text-left">Auths mes</th>
                <th className="px-6 py-3 text-left">Enrolamientos</th>
                <th className="px-6 py-3 text-left">Estado</th>
                <th className="px-6 py-3 text-left">Creado</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-800">{t.name}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">{t.slug}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${PLAN_BADGE[t.plan] ?? 'bg-slate-100 text-slate-600'}`}>
                      {t.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{t.current_month_auths} / {t.monthly_auth_limit}</td>
                  <td className="px-6 py-4 text-slate-600">{t.current_month_enrollments} / {t.monthly_enroll_limit}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${t.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {t.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">{new Date(t.created_at).toLocaleDateString('es-CO')}</td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/tenants/${t.id}`} className="text-xs text-indigo-600 hover:underline">Ver →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
