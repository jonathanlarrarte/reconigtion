'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, User, Lock, Eye, EyeOff } from 'lucide-react'
import { api } from '@/lib/api'

export default function PortalLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const token = await api.portalLogin(username, password)
      sessionStorage.setItem('portal_token', token.access_token)
      sessionStorage.setItem('portal_tenant', JSON.stringify({ name: token.tenant_name, slug: token.tenant_slug, id: token.tenant_id }))
      router.push('/portal/dashboard')
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-500/20 border border-indigo-500/30 rounded-2xl">
            <Activity className="w-7 h-7 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Portal de Empresa</h1>
            <p className="text-sm text-slate-400 mt-1">FaceID SaaS — Acceso tenant</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-300">Usuario</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                required value={username} onChange={(e) => { setUsername(e.target.value); setError(null) }}
                placeholder="usuario de empresa" autoFocus
                className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-900 border border-slate-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-600"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-300">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                required type={showPwd ? 'text' : 'password'} value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null) }}
                placeholder="••••••••"
                className="w-full pl-9 pr-10 py-2.5 text-sm bg-slate-900 border border-slate-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-600"
              />
              <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</p>
          )}

          <button type="submit" disabled={loading || !username || !password}
            className="w-full bg-indigo-600 text-white text-sm py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 font-medium">
            {loading ? 'Verificando...' : 'Ingresar al Portal'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600">
          ¿Eres administrador?{' '}
          <a href="/" className="text-slate-400 hover:text-indigo-400 transition-colors">Ir al Admin Panel →</a>
        </p>
      </div>
    </div>
  )
}
