'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Activity, Lock, User } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        router.push(params.get('next') ?? '/')
      } else {
        const data = await res.json()
        setError(data.error ?? 'Error al iniciar sesión')
      }
    } catch {
      setError('Error de conexión. Intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Usuario</label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError('') }}
            placeholder="admin"
            autoFocus
            autoComplete="username"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Contraseña</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            placeholder="••••••••"
            autoComplete="current-password"
            className={`w-full pl-9 pr-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
              error ? 'border-red-300 bg-red-50' : 'border-slate-200'
            }`}
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <button
        type="submit"
        disabled={loading || !username || !password}
        className="w-full bg-indigo-600 text-white text-sm py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 font-medium"
      >
        {loading ? 'Verificando...' : 'Ingresar'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-2xl">
            <Activity className="w-6 h-6 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">FaceID Admin</h1>
          <p className="text-sm text-slate-500">Panel de administración</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
