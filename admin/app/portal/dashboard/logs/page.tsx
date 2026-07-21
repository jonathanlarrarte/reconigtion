'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck, XCircle, AlertTriangle, Eye, EyeOff,
  ChevronLeft, ChevronRight, Search, LogOut, ArrowLeft, RefreshCw, List,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { AuthLogEntry } from '@/lib/types'

type Filter = 'all' | 'success' | 'failed' | 'fraud'

function ResultBadge({ entry }: { entry: AuthLogEntry }) {
  if (entry.fraud_detected) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
        <AlertTriangle className="w-3 h-3" /> Fraude
      </span>
    )
  }
  if (!entry.success && entry.is_real_face === false) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
        <EyeOff className="w-3 h-3" /> Spoof
      </span>
    )
  }
  if (entry.success) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
        <ShieldCheck className="w-3 h-3" /> Verificado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
      <XCircle className="w-3 h-3" /> Fallido
    </span>
  )
}

function LivenessBadge({ isReal }: { isReal: boolean | null }) {
  if (isReal === null || isReal === undefined) return <span className="text-slate-300 text-xs">—</span>
  return isReal
    ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Eye className="w-3 h-3" /> Real</span>
    : <span className="inline-flex items-center gap-1 text-xs text-purple-600"><EyeOff className="w-3 h-3" /> Spoof</span>
}

function formatDate(dt: string) {
  return new Date(dt).toLocaleString('es-CO', {
    month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

const PLAN_COLOR: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600',
  business: 'bg-indigo-100 text-indigo-700',
  enterprise: 'bg-purple-100 text-purple-700',
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',     label: 'Todos' },
  { key: 'success', label: 'Exitosas' },
  { key: 'failed',  label: 'Fallidas' },
  { key: 'fraud',   label: 'Fraude / Spoof' },
]

export default function PortalLogs() {
  const router = useRouter()
  const [logs,       setLogs]       = useState<AuthLogEntry[]>([])
  const [total,      setTotal]      = useState(0)
  const [pages,      setPages]      = useState(1)
  const [page,       setPage]       = useState(1)
  const [filter,     setFilter]     = useState<Filter>('all')
  const [search,     setSearch]     = useState('')
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tenant,     setTenant]     = useState<{ name: string; plan?: string } | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function getToken() {
    return typeof window !== 'undefined' ? sessionStorage.getItem('portal_token') : null
  }

  const loadLogs = useCallback(async (
    p: number, f: Filter, q: string, silent = false,
  ) => {
    const token = getToken()
    if (!token) { router.push('/portal'); return }
    if (silent) setRefreshing(true)
    else        setLoading(true)
    try {
      const successParam = f === 'success' ? true : f === 'failed' ? false : undefined
      const fraudOnly    = f === 'fraud' ? true : undefined
      const result = await api.portalLogs(token, p, 50, successParam, fraudOnly, q || undefined)
      setLogs(result.items)
      setTotal(result.total)
      setPages(result.pages)
    } catch {
      router.push('/portal')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [router])

  useEffect(() => {
    const t = sessionStorage.getItem('portal_tenant')
    if (t) setTenant(JSON.parse(t))
    loadLogs(1, 'all', '')
  }, [loadLogs])

  function handleFilter(f: Filter) {
    setFilter(f); setPage(1)
    loadLogs(1, f, search)
  }

  function handleSearch(q: string) {
    setSearch(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); loadLogs(1, filter, q) }, 400)
  }

  function handlePage(p: number) {
    setPage(p); loadLogs(p, filter, search)
  }

  function logout() {
    sessionStorage.removeItem('portal_token')
    sessionStorage.removeItem('portal_tenant')
    router.push('/portal')
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/portal/dashboard')}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <List className="w-4 h-4 text-indigo-500" />
            <span className="font-semibold text-slate-800 text-sm">FaceID Portal</span>
            {tenant && (
              <>
                <span className="text-slate-300">/</span>
                <span className="text-sm text-slate-600">{tenant.name}</span>
                {tenant.plan && (
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${PLAN_COLOR[tenant.plan] ?? 'bg-slate-100 text-slate-600'}`}>
                    {tenant.plan}
                  </span>
                )}
              </>
            )}
            <span className="text-slate-300">/</span>
            <span className="text-sm text-slate-500">Logs</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadLogs(page, filter, search, true)}
              disabled={refreshing}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        <div>
          <h1 className="text-xl font-bold text-slate-800">Registro de autenticaciones</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total.toLocaleString()} intentos registrados en total
          </p>
        </div>

        {/* Leyenda de estados */}
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          {[
            { color: 'bg-emerald-100 text-emerald-700', label: 'Verificado — rostro reconocido correctamente' },
            { color: 'bg-amber-100 text-amber-700',     label: 'Fallido — rostro no coincide' },
            { color: 'bg-red-100 text-red-700',         label: 'Fraude — deepfake o manipulación detectada' },
            { color: 'bg-purple-100 text-purple-700',   label: 'Spoof — foto/pantalla en lugar de persona real' },
          ].map(({ color, label }) => (
            <span key={label} className={`px-2 py-0.5 rounded-full font-medium ${color}`}>{label}</span>
          ))}
        </div>

        {/* Filtros + búsqueda */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 gap-1">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => handleFilter(f.key)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  filter === f.key
                    ? 'bg-indigo-600 text-white font-medium shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por ID de usuario..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 w-60"
            />
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 font-semibold uppercase tracking-wide bg-slate-50">
                  <th className="px-5 py-3">Fecha / Hora</th>
                  <th className="px-5 py-3">ID Usuario</th>
                  <th className="px-5 py-3">Resultado</th>
                  <th className="px-5 py-3">Confianza</th>
                  <th className="px-5 py-3">Liveness</th>
                  <th className="px-5 py-3">IP</th>
                  <th className="px-5 py-3 text-right">Costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs text-slate-400">Cargando registros...</span>
                      </div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-sm text-slate-400">
                      No hay registros para este filtro.
                    </td>
                  </tr>
                ) : logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap font-mono">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      <code className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-mono">
                        {log.external_id ?? <span className="text-slate-400">desconocido</span>}
                      </code>
                    </td>
                    <td className="px-5 py-3">
                      <ResultBadge entry={log} />
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {log.confidence_score != null ? (
                        <span className={`font-mono font-semibold ${
                          log.confidence_score >= 0.8 ? 'text-emerald-600'
                          : log.confidence_score >= 0.6 ? 'text-amber-600'
                          : 'text-slate-400'
                        }`}>
                          {(log.confidence_score * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <LivenessBadge isReal={log.is_real_face} />
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-400">
                      {log.ip_address ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-slate-500">
                      {log.amount_charged != null ? `$${log.amount_charged.toFixed(4)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {!loading && (
            <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {total === 0
                  ? 'Sin resultados'
                  : `Mostrando ${((page - 1) * 50) + 1}–${Math.min(page * 50, total)} de ${total.toLocaleString()} registros`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePage(page - 1)}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-500 min-w-16 text-center">
                  {page} / {pages}
                </span>
                <button
                  onClick={() => handlePage(page + 1)}
                  disabled={page === pages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
