'use client'

import { useState, useEffect } from 'react'
import { Save, Info, RefreshCw, CheckCircle, AlertCircle, Server } from 'lucide-react'
import { api, type SystemStatus } from '@/lib/api'

const STORAGE_KEY = 'faceid_settings'

interface LocalConfig {
  price_enrollment: number
  price_auth: number
  price_antifaud_addon: number
  price_liveness_check: number
  liveness_required: boolean
  anti_spoofing_enabled: boolean
  default_monthly_auth_limit: number
  default_monthly_enroll_limit: number
  default_monthly_liveness_limit: number
  deepface_threshold: number
  face_quality_min: number
}

const DEFAULTS: LocalConfig = {
  price_enrollment: 0.10,
  price_auth: 0.02,
  price_antifaud_addon: 0.03,
  price_liveness_check: 0.01,
  liveness_required: false,
  anti_spoofing_enabled: true,
  default_monthly_auth_limit: 1000,
  default_monthly_enroll_limit: 500,
  default_monthly_liveness_limit: 500,
  deepface_threshold: 0.55,
  face_quality_min: 0.35,
}

function Tooltip({ hint }: { hint: string }) {
  return (
    <span className="group relative">
      <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
      <span className="absolute left-5 top-0 w-60 text-xs bg-slate-800 text-white rounded-lg px-3 py-2 hidden group-hover:block z-20 shadow-lg leading-relaxed">
        {hint}
      </span>
    </span>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
        on ? 'bg-indigo-600' : 'bg-slate-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function LiveBadge({ live, template }: { live: boolean | undefined; template: boolean }) {
  if (live === undefined) return null
  const match = live === template
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
        match
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-amber-50 text-amber-700 border border-amber-200'
      }`}
    >
      <Server className="w-3 h-3" />
      {match ? `En vivo: ${live ? 'ON' : 'OFF'}` : `Servidor: ${live ? 'ON' : 'OFF'} · Pendiente`}
    </span>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        {hint && <Tooltip hint={hint} />}
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const [config, setConfig] = useState<LocalConfig>(DEFAULTS)
  const [liveStatus, setLiveStatus] = useState<SystemStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setConfig({ ...DEFAULTS, ...JSON.parse(stored) })
    } catch { /* ignore */ }
    fetchStatus()
  }, [])

  async function fetchStatus() {
    setLoadingStatus(true)
    try {
      const s = await api.getSystemStatus()
      setLiveStatus(s)
    } catch { setLiveStatus(null) }
    finally { setLoadingStatus(false) }
  }

  function set<K extends keyof LocalConfig>(key: K, val: LocalConfig[K]) {
    const next = { ...config, [key]: val }
    setConfig(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const envBlock = `# Precios (USD por operación)
PRICE_ENROLLMENT=${config.price_enrollment}
PRICE_AUTH=${config.price_auth}
PRICE_ANTIFAUD_ADDON=${config.price_antifaud_addon}
PRICE_LIVENESS_CHECK=${config.price_liveness_check}

# Seguridad
LIVENESS_REQUIRED=${config.liveness_required}
ANTI_SPOOFING_ENABLED=${config.anti_spoofing_enabled}

# Motor facial
DEEPFACE_THRESHOLD=${config.deepface_threshold}
FACE_QUALITY_MIN=${config.face_quality_min}

# Límites por defecto para nuevos tenants
DEFAULT_MONTHLY_AUTH_LIMIT=${config.default_monthly_auth_limit}
DEFAULT_MONTHLY_ENROLL_LIMIT=${config.default_monthly_enroll_limit}
DEFAULT_MONTHLY_LIVENESS_LIMIT=${config.default_monthly_liveness_limit}`

  async function handleCopy() {
    await navigator.clipboard.writeText(envBlock)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  const securityItems = [
    {
      key: 'anti_spoofing_enabled' as const,
      label: 'Anti-spoofing activado',
      hint: 'Activa MiniFASNet para detectar ataques de presentación (fotos impresas, pantallas, máscaras). Requiere PyTorch instalado. Agrega ~1s de latencia.',
      liveKey: 'anti_spoofing_enabled' as keyof SystemStatus,
    },
    {
      key: 'liveness_required' as const,
      label: 'Liveness obligatorio',
      hint: 'Exige un challenge nonce (X-Challenge-Id) antes de cada autenticación. Protege contra replay attacks y fotos robadas.',
      liveKey: 'liveness_required' as keyof SystemStatus,
    },
  ]

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Configuración</h1>
        <p className="text-sm text-slate-500 mt-1">Precios, límites y parámetros del motor facial.</p>
      </div>

      {/* Estado en vivo del servidor */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">Estado actual del servidor</h2>
          </div>
          <button
            onClick={fetchStatus}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {loadingStatus ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-slate-500 animate-spin" />
            Consultando API…
          </div>
        ) : liveStatus ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Anti-spoofing', value: liveStatus.anti_spoofing_enabled },
                { label: 'Liveness obligatorio', value: liveStatus.liveness_required },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5">
                  <span className="text-xs text-slate-600">{label}</span>
                  <span className={`flex items-center gap-1 text-xs font-semibold ${value ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {value
                      ? <><CheckCircle className="w-3.5 h-3.5" /> ON</>
                      : <><AlertCircle className="w-3.5 h-3.5" /> OFF</>}
                  </span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              {[
                { label: 'Modelo', value: liveStatus.deepface_model },
                { label: 'Detector', value: liveStatus.deepface_detector },
                { label: 'Umbral', value: liveStatus.deepface_threshold.toString() },
                { label: 'Calidad mín', value: liveStatus.face_quality_min.toString() },
                { label: 'Entorno', value: liveStatus.app_env },
                { label: 'Versión', value: `v${liveStatus.app_version}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-lg px-3 py-2">
                  <div className="text-slate-400 mb-0.5">{label}</div>
                  <div className="font-mono font-medium text-slate-700">{value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-4 h-4" />
            No se pudo conectar con la API (¿está corriendo el contenedor?)
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">

        {/* Precios */}
        <div className="p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-700">Precios por operación (USD)</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'price_enrollment' as const, label: 'Enrolamiento', liveKey: 'price_enrollment' as keyof SystemStatus, hint: 'Se cobra una vez al crear el sujeto.' },
              { key: 'price_auth' as const, label: 'Autenticación', liveKey: 'price_auth' as keyof SystemStatus, hint: 'Se cobra en cada intento de verificación.' },
              { key: 'price_antifaud_addon' as const, label: 'Anti-fraude addon', liveKey: 'price_antifaud_addon' as keyof SystemStatus, hint: 'Cargo adicional cuando anti-spoofing está activo.' },
              { key: 'price_liveness_check' as const, label: 'Liveness check', liveKey: 'price_liveness_check' as keyof SystemStatus, hint: 'Se cobra por verificación de liveness activo.' },
            ].map(({ key, label, liveKey, hint }) => (
              <Field key={key} label={label} hint={hint}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input
                    type="number" step="0.001" min="0"
                    value={config[key] as number}
                    onChange={(e) => set(key, parseFloat(e.target.value) || 0)}
                    className="w-full pl-6 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                {liveStatus && (liveStatus[liveKey] as number) !== (config[key] as number) && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                    <Server className="w-3 h-3" />
                    Servidor: ${(liveStatus[liveKey] as number).toFixed(4)}
                  </p>
                )}
              </Field>
            ))}
          </div>
          <div className="bg-slate-50 rounded-lg px-4 py-3 text-xs text-slate-500">
            Ejemplo: 1,000 auths/mes con anti-fraude + liveness =&nbsp;
            <strong className="text-slate-700">
              ${((config.price_auth + config.price_antifaud_addon + config.price_liveness_check) * 1000).toFixed(2)} USD
            </strong>
          </div>
        </div>

        {/* Seguridad */}
        <div className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Seguridad</h2>
          {securityItems.map(({ key, label, hint, liveKey }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm text-slate-700">{label}</span>
                <Tooltip hint={hint} />
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {liveStatus && (
                  <LiveBadge
                    live={liveStatus[liveKey] as boolean}
                    template={config[key]}
                  />
                )}
                <Toggle on={config[key]} onChange={(v) => set(key, v)} />
              </div>
            </div>
          ))}
        </div>

        {/* Motor facial */}
        <div className="p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-700">Motor facial</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Umbral de distancia" hint="Distancia coseno ArcFace. <0.45 = estricto (más falsos negativos), 0.55 = balanceado, >0.65 = permisivo (más falsos positivos).">
              <input
                type="number" step="0.01" min="0.3" max="0.8"
                value={config.deepface_threshold}
                onChange={(e) => set('deepface_threshold', parseFloat(e.target.value) || 0.55)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              {liveStatus && liveStatus.deepface_threshold !== config.deepface_threshold && (
                <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                  <Server className="w-3 h-3" /> Servidor: {liveStatus.deepface_threshold}
                </p>
              )}
            </Field>
            <Field label="Calidad mínima" hint="Proporción mínima cara/imagen (0.35 ≈ cara cubre 9% del frame). Imágenes por debajo son rechazadas al enrolar.">
              <input
                type="number" step="0.05" min="0.1" max="0.9"
                value={config.face_quality_min}
                onChange={(e) => set('face_quality_min', parseFloat(e.target.value) || 0.35)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              {liveStatus && liveStatus.face_quality_min !== config.face_quality_min && (
                <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                  <Server className="w-3 h-3" /> Servidor: {liveStatus.face_quality_min}
                </p>
              )}
            </Field>
          </div>
        </div>

        {/* Límites por defecto */}
        <div className="p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-700">Límites por defecto (nuevos tenants)</h2>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Auths / mes">
              <input
                type="number" min="1"
                value={config.default_monthly_auth_limit}
                onChange={(e) => set('default_monthly_auth_limit', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </Field>
            <Field label="Enrolamientos / mes">
              <input
                type="number" min="1"
                value={config.default_monthly_enroll_limit}
                onChange={(e) => set('default_monthly_enroll_limit', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </Field>
            <Field label="Liveness / mes">
              <input
                type="number" min="1"
                value={config.default_monthly_liveness_limit}
                onChange={(e) => set('default_monthly_liveness_limit', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </Field>
          </div>
        </div>
      </div>

      {/* Bloque .env para copiar */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Variables de entorno (.env)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Copia, pega en <code className="bg-slate-100 px-1 rounded">.env</code> y ejecuta{' '}
              <code className="bg-slate-100 px-1 rounded">docker compose up -d --force-recreate api</code>
            </p>
          </div>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors ${
              copied
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            <Save className="w-4 h-4" />
            {copied ? '¡Copiado!' : 'Copiar .env'}
          </button>
        </div>
        <pre
          onClick={handleCopy}
          className="bg-slate-900 text-emerald-400 text-xs rounded-lg p-4 overflow-x-auto cursor-pointer hover:bg-slate-800 transition-colors select-all leading-relaxed"
        >
          {envBlock}
        </pre>
      </div>
    </div>
  )
}
