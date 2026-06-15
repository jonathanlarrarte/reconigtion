'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Copy, Check, User, Lock, FlaskConical } from 'lucide-react'
import { api } from '@/lib/api'
import type { Tenant } from '@/lib/types'

const PLANS = [
  { value: 'starter',    label: 'Starter',    auths: 1000,   enrolls: 500,   liveness: 500 },
  { value: 'business',   label: 'Business',   auths: 10000,  enrolls: 2000,  liveness: 5000 },
  { value: 'enterprise', label: 'Enterprise', auths: 100000, enrolls: 20000, liveness: 50000 },
]

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export default function NewTenantPage() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [plan, setPlan] = useState('starter')
  const [authLimit, setAuthLimit] = useState(1000)
  const [enrollLimit, setEnrollLimit] = useState(500)
  const [livenessLimit, setLivenessLimit] = useState(500)
  const [portalUsername, setPortalUsername] = useState('')
  const [portalPassword, setPortalPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Tenant | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  function handleNameChange(v: string) {
    setName(v)
    setSlug(v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
    if (!portalUsername) setPortalUsername(v.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, ''))
  }

  function handlePlanChange(p: string) {
    setPlan(p)
    const preset = PLANS.find((x) => x.value === p)
    if (preset) { setAuthLimit(preset.auths); setEnrollLimit(preset.enrolls); setLivenessLimit(preset.liveness) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const tenant = await api.createTenant({
        name, slug, plan,
        monthly_auth_limit: authLimit,
        monthly_enroll_limit: enrollLimit,
        monthly_liveness_limit: livenessLimit,
        portal_username: portalUsername || undefined,
        portal_password: portalPassword || undefined,
      })
      setCreated(tenant)
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  if (created) {
    return (
      <div className="max-w-lg space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">Tenant creado</h1>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 space-y-4">
          <p className="text-sm text-emerald-800 font-medium">¡Listo! Guarda estas credenciales — no se mostrarán de nuevo.</p>

          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-emerald-700 mb-1">API Key</p>
              <div className="bg-white border border-emerald-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                <code className="text-sm font-mono text-slate-800 break-all">{created.api_key}</code>
                <button onClick={() => copy(created.api_key, 'api')} className="shrink-0 text-slate-400 hover:text-indigo-600">
                  {copied === 'api' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {created.portal_username && (
              <div>
                <p className="text-xs font-medium text-emerald-700 mb-1">Acceso al Portal</p>
                <div className="bg-white border border-emerald-200 rounded-lg px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Usuario:</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">{created.portal_username}</code>
                      <button onClick={() => copy(created.portal_username!, 'user')} className="text-slate-400 hover:text-indigo-600">
                        {copied === 'user' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Contraseña:</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">{portalPassword}</code>
                      <button onClick={() => copy(portalPassword, 'pwd')} className="text-slate-400 hover:text-indigo-600">
                        {copied === 'pwd' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Portal: <span className="font-mono">http://localhost:3000/portal</span></p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <Link href={`/tenants/${created.id}`} className="flex-1 text-center bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
            Ver tenant
          </Link>
          <Link href="/lab" className="flex items-center justify-center gap-1.5 flex-1 border border-slate-200 text-slate-700 text-sm px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors">
            <FlaskConical className="w-4 h-4" /> Face Lab
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tenants" className="text-slate-400 hover:text-slate-600"><ChevronLeft className="w-5 h-5" /></Link>
        <h1 className="text-2xl font-bold text-slate-800">Nuevo Tenant</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Info básica */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-700">Información</h2>

          <Field label="Nombre de la empresa">
            <input required value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Acme Corp"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </Field>

          <Field label="Slug" hint="Solo minúsculas, números y guiones">
            <input required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-corp" pattern="[a-z0-9-]+"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </Field>

          <Field label="Plan">
            <div className="grid grid-cols-3 gap-2">
              {PLANS.map((p) => (
                <button key={p.value} type="button" onClick={() => handlePlanChange(p.value)}
                  className={`py-2 text-sm rounded-lg border transition-colors capitalize ${plan === p.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Auths/mes">
              <input type="number" required min={1} value={authLimit} onChange={(e) => setAuthLimit(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </Field>
            <Field label="Enrolamientos">
              <input type="number" required min={1} value={enrollLimit} onChange={(e) => setEnrollLimit(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </Field>
            <Field label="Liveness">
              <input type="number" required min={1} value={livenessLimit} onChange={(e) => setLivenessLimit(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </Field>
          </div>
        </div>

        {/* Portal user */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Usuario del Portal</h2>
            <p className="text-xs text-slate-400 mt-0.5">La empresa usará estas credenciales para ver sus estadísticas en /portal</p>
          </div>

          <Field label="Usuario">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={portalUsername} onChange={(e) => setPortalUsername(e.target.value)} placeholder="acme.corp"
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </Field>

          <Field label="Contraseña">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="password" value={portalPassword} onChange={(e) => setPortalPassword(e.target.value)} placeholder="mínimo 8 caracteres"
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </Field>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-4 py-3">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full bg-indigo-600 text-white text-sm py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50">
          {loading ? 'Creando...' : 'Crear Tenant'}
        </button>
      </form>
    </div>
  )
}
