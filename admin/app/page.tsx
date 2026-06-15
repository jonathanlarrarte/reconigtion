'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, ShieldCheck, UserPlus, TrendingUp, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import type { Tenant } from '@/lib/types'

function UsageBar({ value, max, color = 'bg-indigo-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : color
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{value.toLocaleString()} / {max.toLocaleString()}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const PLAN_BADGE: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600',
  business: 'bg-indigo-100 text-indigo-700',
  enterprise: 'bg-purple-100 text-purple-700',
}

export default function Dashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listTenants()
      .then(setTenants)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const active = tenants.filter((t) => t.is_active)
  const totalAuths = tenants.reduce((s, t) => s + (t.current_month_auths ?? 0), 0)
  const totalEnrolls = tenants.reduce((s, t) => s + (t.current_month_enrollments ?? 0), 0)

  const stats = [
    { label: 'Tenants activos', value: active.length, icon: Users, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Auths este mes', value: totalAuths.toLocaleString(), icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Enrolamientos', value: totalEnrolls.toLocaleString(), icon: UserPlus, color: 'text-sky-600 bg-sky-50' },
    { label: 'Total tenants', value: tenants.length, icon: TrendingUp, color: 'text-violet-600 bg-violet-50' },
  ]

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Resumen del mes en curso</p>
        </div>
        <Link href="/tenants/new" className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> Nuevo Tenant
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-5">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color} mb-3`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{value}</div>
            <div className="text-xs text-slate-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-700 text-sm">Tenants</h2>
          <Link href="/tenants" className="text-xs text-indigo-600 hover:underline">Ver todos →</Link>
        </div>

        {loading && <div className="p-12 text-center text-sm text-slate-400">Cargando...</div>}
        {error && <div className="p-6 text-center text-sm text-red-500">No se pudo conectar con la API: {error}</div>}
        {!loading && !error && tenants.length === 0 && (
          <div className="p-12 text-center text-sm text-slate-400">
            No hay tenants todavía.{' '}
            <Link href="/tenants/new" className="text-indigo-600 hover:underline">Crea el primero</Link>
          </div>
        )}

        {!loading && tenants.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left">Nombre</th>
                <th className="px-6 py-3 text-left">Plan</th>
                <th className="px-6 py-3 text-left w-48">Auths</th>
                <th className="px-6 py-3 text-left w-48">Enrolamientos</th>
                <th className="px-6 py-3 text-left">Estado</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((t) => (
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
                  <td className="px-6 py-4"><UsageBar value={t.current_month_auths ?? 0} max={t.monthly_auth_limit} /></td>
                  <td className="px-6 py-4"><UsageBar value={t.current_month_enrollments ?? 0} max={t.monthly_enroll_limit} color="bg-sky-500" /></td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${t.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {t.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
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
