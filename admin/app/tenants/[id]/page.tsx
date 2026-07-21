'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Copy, Check, FlaskConical, AlertTriangle, Shield, ShieldOff, Save, KeyRound, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import type { Tenant, StatsResponse } from '@/lib/types'

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [resetOpen,    setResetOpen]    = useState(false)
  const [newPassword,  setNewPassword]  = useState('')
  const [showPass,     setShowPass]     = useState(false)
  const [resetting,    setResetting]    = useState(false)
  const [resetDone,    setResetDone]    = useState<string | null>(null)
  const [copiedPass,   setCopiedPass]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [editLimits, setEditLimits] = useState({ auth: 0, enroll: 0, liveness: 0 })
  const [editAntispoof, setEditAntispoof] = useState(true)
  const [editLiveness, setEditLiveness] = useState(false)

  useEffect(() => {
    api.getTenant(id)
      .then(async (t) => {
        setTenant(t)
        setEditLimits({ auth: t.monthly_auth_limit, enroll: t.monthly_enroll_limit, liveness: t.monthly_liveness_limit })
        setEditAntispoof(t.anti_spoofing_enabled)
        setEditLiveness(t.liveness_required)
        api.getStats(t.api_key).then(setStats).catch(() => {})
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  async function copyKey() {
    if (!tenant) return
    await navigator.clipboard.writeText(tenant.api_key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDeactivate() {
    if (!tenant || !confirm(`¿Desactivar el tenant "${tenant.name}"?`)) return
    setDeactivating(true)
    try {
      const updated = await api.deactivateTenant(tenant.id)
      setTenant(updated)
    } catch (e: unknown) {
      alert((e as Error).message)
    } finally {
      setDeactivating(false)
    }
  }

  function startEdit() {
    if (!tenant) return
    setEditLimits({ auth: tenant.monthly_auth_limit, enroll: tenant.monthly_enroll_limit, liveness: tenant.monthly_liveness_limit })
    setEditAntispoof(tenant.anti_spoofing_enabled)
    setEditLiveness(tenant.liveness_required)
    setEditing(true)
  }

  async function handleSave() {
    if (!tenant) return
    setSaving(true)
    try {
      const updated = await api.updateTenant(tenant.id, {
        monthly_auth_limit: editLimits.auth,
        monthly_enroll_limit: editLimits.enroll,
        monthly_liveness_limit: editLimits.liveness,
        anti_spoofing_enabled: editAntispoof,
        liveness_required: editLiveness,
      })
      setTenant(updated)
      setEditing(false)
    } catch (e: unknown) {
      alert((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function generatePassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$'
    const arr = new Uint8Array(16)
    crypto.getRandomValues(arr)
    setNewPassword(Array.from(arr).map(b => chars[b % chars.length]).join(''))
    setShowPass(true)
  }

  async function handleResetPassword() {
    if (!tenant || newPassword.length < 8) return
    setResetting(true)
    try {
      await api.resetTenantPassword(tenant.id, newPassword)
      setResetDone(newPassword)
      setResetOpen(false)
      setNewPassword('')
    } catch (e: unknown) {
      alert((e as Error).message)
    } finally {
      setResetting(false)
    }
  }

  async function copyNewPass() {
    if (!resetDone) return
    await navigator.clipboard.writeText(resetDone)
    setCopiedPass(true)
    setTimeout(() => setCopiedPass(false), 2000)
  }

  if (loading) return <div className="p-12 text-sm text-slate-400">Cargando...</div>
  if (error || !tenant) return <div className="p-6 text-sm text-red-500">Error: {error ?? 'Tenant no encontrado'}</div>

  const PLAN_COLOR: Record<string, string> = {
    starter: 'bg-slate-100 text-slate-600',
    business: 'bg-indigo-100 text-indigo-700',
    enterprise: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/tenants" className="text-slate-400 hover:text-slate-600">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{tenant.name}</h1>
            <p className="text-sm text-slate-400 font-mono mt-0.5">{tenant.slug}</p>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ml-2 ${PLAN_COLOR[tenant.plan] ?? 'bg-slate-100 text-slate-600'}`}>
            {tenant.plan}
          </span>
          {!tenant.is_active && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 ml-1">Inactivo</span>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href={`/lab?apiKey=${encodeURIComponent(tenant.api_key)}`}
            className="flex items-center gap-1.5 border border-slate-200 text-slate-700 text-sm px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <FlaskConical className="w-4 h-4" /> Face Lab
          </Link>
          {tenant.is_active && (
            <button
              onClick={handleDeactivate}
              disabled={deactivating}
              className="flex items-center gap-1.5 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <AlertTriangle className="w-4 h-4" /> Desactivar
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">API Key</p>
        <div className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-4 py-3">
          <code className="text-sm font-mono text-slate-700 break-all">{tenant.api_key}</code>
          <button onClick={copyKey} className="shrink-0 text-slate-400 hover:text-indigo-600 transition-colors">
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Auths este mes" value={stats.auths_this_month} sub={`límite: ${stats.auth_limit}`} />
          <StatCard label="Enrolamientos" value={stats.enrollments_this_month} sub={`límite: ${stats.enrollment_limit}`} />
          <StatCard label="Sujetos activos" value={stats.active_subjects} />
          <StatCard label="Tasa de éxito" value={`${(stats.auth_success_rate * 100).toFixed(1)}%`} />
          <StatCard label="Intentos fraude" value={stats.fraud_attempts_this_month} />
          <StatCard label="Costo estimado" value={`$${stats.estimated_cost_usd.toFixed(2)}`} sub="USD este mes" />
        </div>
      )}

      {/* Seguridad del tenant */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Seguridad y Límites</h2>
          {!editing ? (
            <button onClick={startEdit} className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors">
              Editar
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 text-xs bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                <Save className="w-3.5 h-3.5" />{saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          )}
        </div>

        {/* Security toggles */}
        {[
          {
            label: 'Anti-spoofing (MiniFASNet)',
            desc: 'Detecta fotos impresas, pantallas y ataques de presentación',
            editVal: editAntispoof,
            setVal: setEditAntispoof,
            liveVal: tenant.anti_spoofing_enabled,
            icon: tenant.anti_spoofing_enabled || (editing && editAntispoof),
          },
          {
            label: 'Liveness obligatorio',
            desc: 'Exige challenge de movimiento de cabeza antes de cada autenticación',
            editVal: editLiveness,
            setVal: setEditLiveness,
            liveVal: tenant.liveness_required,
            icon: tenant.liveness_required || (editing && editLiveness),
          },
        ].map(({ label, desc, editVal, setVal, liveVal, icon }) => (
          <div key={label} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              {icon
                ? <Shield className="w-4 h-4 text-emerald-600" />
                : <ShieldOff className="w-4 h-4 text-slate-400" />}
              <div>
                <p className="text-sm font-medium text-slate-700">{label}</p>
                <p className="text-xs text-slate-400">{desc}</p>
              </div>
            </div>
            {editing ? (
              <button
                type="button"
                onClick={() => setVal((v: boolean) => !v)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${editVal ? 'bg-indigo-600' : 'bg-slate-200'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${editVal ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            ) : (
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${liveVal ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {liveVal ? 'ON' : 'OFF'}
              </span>
            )}
          </div>
        ))}

        {/* Límites */}
        <div className="space-y-3">
          {[
            { label: 'Autenticaciones / mes', key: 'auth' as const, value: tenant.current_month_auths, max: tenant.monthly_auth_limit, color: 'bg-indigo-500' },
            { label: 'Enrolamientos / mes', key: 'enroll' as const, value: tenant.current_month_enrollments, max: tenant.monthly_enroll_limit, color: 'bg-sky-500' },
            { label: 'Liveness checks / mes', key: 'liveness' as const, value: tenant.current_month_liveness_checks, max: tenant.monthly_liveness_limit, color: 'bg-violet-500' },
          ].map(({ label, key, value, max, color }) => {
            const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
            const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : color
            return (
              <div key={label} className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{label}</span>
                  {editing ? (
                    <input
                      type="number" min={1}
                      value={editLimits[key]}
                      onChange={(e) => setEditLimits(l => ({ ...l, [key]: parseInt(e.target.value) || 1 }))}
                      className="w-24 text-right text-xs border border-indigo-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    />
                  ) : (
                    <span className="font-medium text-slate-700">{value.toLocaleString()} / {max.toLocaleString()} <span className="text-slate-400">({pct}%)</span></span>
                  )}
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Portal access + reset password */}
      {tenant.portal_username && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Acceso al Portal</h2>
            <a href="/portal" target="_blank" rel="noreferrer"
              className="text-xs text-indigo-600 hover:underline">Abrir portal →</a>
          </div>

          <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-xs text-slate-500">Usuario</p>
              <code className="text-sm font-mono text-slate-700">{tenant.portal_username}</code>
            </div>
            <button
              onClick={() => { setResetOpen(o => !o); setResetDone(null); setNewPassword('') }}
              className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" /> Restablecer contraseña
            </button>
          </div>

          {/* Contraseña restablecida con éxito */}
          {resetDone && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-emerald-700">✓ Contraseña actualizada — entrégala al cliente:</p>
              <div className="flex items-center justify-between bg-white rounded border border-emerald-200 px-3 py-2 gap-3">
                <code className="text-sm font-mono text-slate-800 break-all">{resetDone}</code>
                <button onClick={copyNewPass} className="shrink-0 text-slate-400 hover:text-emerald-600 transition-colors">
                  {copiedPass ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-emerald-600">Copia esta contraseña ahora — no se mostrará de nuevo.</p>
            </div>
          )}

          {/* Formulario inline de reset */}
          {resetOpen && (
            <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600">Nueva contraseña para <span className="text-slate-800">{tenant.portal_username}</span></p>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Mínimo 8 caracteres"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full pr-10 pl-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={generatePassword}
                  title="Generar contraseña segura"
                  className="flex items-center gap-1.5 text-xs border border-slate-200 bg-white text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Generar
                </button>
              </div>

              {newPassword.length > 0 && newPassword.length < 8 && (
                <p className="text-xs text-red-500">Mínimo 8 caracteres ({newPassword.length}/8)</p>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setResetOpen(false); setNewPassword('') }}
                  className="text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleResetPassword}
                  disabled={resetting || newPassword.length < 8}
                  className="flex items-center gap-1.5 text-xs bg-indigo-600 text-white rounded-lg px-4 py-1.5 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {resetting ? 'Guardando...' : 'Confirmar cambio'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-slate-400">
        Creado: {new Date(tenant.created_at).toLocaleString('es-CO')}
      </div>
    </div>
  )
}
