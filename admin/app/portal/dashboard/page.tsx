'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { ShieldCheck, XCircle, Users, AlertTriangle, Activity, Wifi, WifiOff, LogOut, RefreshCw, DollarSign, Eye, List } from 'lucide-react'
import { api } from '@/lib/api'
import type { DetailedStats } from '@/lib/types'

function StatCard({ label, value, sub, icon: Icon, color = 'text-indigo-600 bg-indigo-50' }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color?: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color} mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}

function UsageBar({ label, value, max, color = 'bg-indigo-500' }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : color
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-800">{value.toLocaleString()} / {max.toLocaleString()} <span className="text-slate-400 text-xs">({pct}%)</span></span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const PLAN_COLOR: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600',
  business: 'bg-indigo-100 text-indigo-700',
  enterprise: 'bg-purple-100 text-purple-700',
}

export default function PortalDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<DetailedStats | null>(null)
  const [health, setHealth] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenant, setTenant] = useState<{ name: string; slug: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  function getToken() {
    if (typeof window === 'undefined') return null
    return sessionStorage.getItem('portal_token')
  }

  async function load(token: string) {
    const [s, h] = await Promise.all([
      api.portalStats(token),
      api.portalHealth(token).catch(() => ({ api: 'error', database: 'error' })),
    ])
    setStats(s)
    setHealth(h as Record<string, string>)
  }

  useEffect(() => {
    const token = getToken()
    if (!token) { router.push('/portal'); return }
    const t = sessionStorage.getItem('portal_tenant')
    if (t) setTenant(JSON.parse(t))
    load(token).catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [router])

  async function refresh() {
    const token = getToken()
    if (!token) return
    setRefreshing(true)
    await load(token).catch(() => {})
    setRefreshing(false)
  }

  function logout() {
    sessionStorage.removeItem('portal_token')
    sessionStorage.removeItem('portal_tenant')
    router.push('/portal')
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-500">Cargando estadísticas...</p>
      </div>
    </div>
  )

  if (error || !stats) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-sm text-red-500">{error ?? 'Error cargando datos'}</p>
        <button onClick={() => router.push('/portal')} className="text-sm text-indigo-600 hover:underline">Volver al login</button>
      </div>
    </div>
  )

  const pieData = [
    { name: 'Verificados', value: stats.successful_auths, color: '#10b981' },
    { name: 'Fallidos', value: stats.failed_auths, color: '#f59e0b' },
    { name: 'Fraude', value: stats.fraud_attempts, color: '#ef4444' },
    { name: 'Spoof', value: stats.spoof_attempts, color: '#8b5cf6' },
  ].filter(d => d.value > 0)

  const apiOnline = health?.api === 'online' && health?.database === 'ok'

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-indigo-600" />
            <span className="font-semibold text-slate-800 text-sm">FaceID Portal</span>
            {tenant && (
              <>
                <span className="text-slate-300">/</span>
                <span className="text-sm text-slate-600">{tenant.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${PLAN_COLOR[stats.plan] ?? 'bg-slate-100 text-slate-600'}`}>
                  {stats.plan}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${apiOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {apiOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              API {apiOnline ? 'Online' : 'Error'}
            </div>
            <button onClick={refresh} disabled={refreshing} className="text-slate-400 hover:text-slate-600 transition-colors">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => router.push('/portal/dashboard/logs')}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors border border-slate-200 px-2.5 py-1.5 rounded-lg hover:border-indigo-200 hover:bg-indigo-50"
            >
              <List className="w-3.5 h-3.5" /> Ver logs
            </button>
            <button onClick={logout} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 transition-colors">
              <LogOut className="w-3.5 h-3.5" /> Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* API Key masked */}
        <div className="bg-slate-800 rounded-xl px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">API Key</p>
            <code className="text-sm font-mono text-slate-200">{stats.api_key_masked}</code>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Base de datos</p>
            <p className={`text-sm font-medium ${health?.database === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
              {health?.database === 'ok' ? '✓ Conectada' : '✗ Error'}
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Auths exitosas" value={stats.successful_auths} sub={`${(stats.auth_success_rate * 100).toFixed(1)}% tasa`} icon={ShieldCheck} color="text-emerald-600 bg-emerald-50" />
          <StatCard label="Auths fallidas" value={stats.failed_auths} icon={XCircle} color="text-amber-600 bg-amber-50" />
          <StatCard label="Sujetos activos" value={stats.active_subjects} icon={Users} color="text-indigo-600 bg-indigo-50" />
          <StatCard label="Intentos fraude" value={stats.fraud_attempts} sub={`${stats.spoof_attempts} spoof`} icon={AlertTriangle} color="text-red-600 bg-red-50" />
          <StatCard label="Liveness checks" value={stats.liveness_checks_this_month} icon={Eye} color="text-violet-600 bg-violet-50" />
          <StatCard label="Enrolamientos" value={stats.enrollments_this_month} icon={Users} color="text-sky-600 bg-sky-50" />
          <StatCard label="Costo estimado" value={`$${stats.estimated_cost_usd.toFixed(2)}`} sub="USD este mes" icon={DollarSign} color="text-teal-600 bg-teal-50" />
          <StatCard label="Total auths mes" value={stats.auths_this_month} icon={Activity} />
        </div>

        {/* Usage bars */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Consumo del período</h2>
          <UsageBar label="Autenticaciones" value={stats.auths_this_month} max={stats.auth_limit} />
          <UsageBar label="Enrolamientos" value={stats.enrollments_this_month} max={stats.enrollment_limit} color="bg-sky-500" />
          <UsageBar label="Liveness checks" value={stats.liveness_checks_this_month} max={stats.liveness_limit} color="bg-violet-500" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Line chart — daily auths */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Últimos 7 días — Autenticaciones</h2>
            {stats.daily_stats.length === 0
              ? <p className="text-sm text-slate-400 text-center py-8">Sin datos en este período</p>
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={stats.daily_stats}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={(d) => `Fecha: ${d}`} />
                    <Line type="monotone" dataKey="successful" stroke="#10b981" strokeWidth={2} dot={false} name="Exitosas" />
                    <Line type="monotone" dataKey="failed" stroke="#f59e0b" strokeWidth={2} dot={false} name="Fallidas" />
                    <Line type="monotone" dataKey="fraud" stroke="#ef4444" strokeWidth={2} dot={false} name="Fraude" />
                    <Legend />
                  </LineChart>
                </ResponsiveContainer>
              )}
          </div>

          {/* Pie chart — result breakdown */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Distribución de resultados</h2>
            {pieData.length === 0
              ? <p className="text-sm text-slate-400 text-center py-8">Sin autenticaciones este período</p>
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </div>

          {/* Bar chart — daily breakdown */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 lg:col-span-2">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Volumen diario</h2>
            {stats.daily_stats.length === 0
              ? <p className="text-sm text-slate-400 text-center py-8">Sin datos</p>
              : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats.daily_stats} barSize={18}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="successful" fill="#10b981" name="Exitosas" stackId="a" radius={[0,0,0,0]} />
                    <Bar dataKey="failed" fill="#f59e0b" name="Fallidas" stackId="a" radius={[0,0,0,0]} />
                    <Bar dataKey="fraud" fill="#ef4444" name="Fraude" stackId="a" radius={[3,3,0,0]} />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </div>
        </div>

        {/* Cost breakdown */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Desglose de costos (mes actual)</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Enrolamientos', value: stats.cost_breakdown.enrollments },
              { label: 'Autenticaciones', value: stats.cost_breakdown.authentications },
              { label: 'Liveness checks', value: stats.cost_breakdown.liveness },
              { label: 'Total', value: stats.cost_breakdown.total, bold: true },
            ].map(({ label, value, bold }) => (
              <div key={label} className={`rounded-lg p-4 ${bold ? 'bg-indigo-50 border border-indigo-100' : 'bg-slate-50'}`}>
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`text-xl font-bold mt-1 ${bold ? 'text-indigo-700' : 'text-slate-800'}`}>${value.toFixed(4)}</p>
                <p className="text-xs text-slate-400">USD</p>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  )
}
