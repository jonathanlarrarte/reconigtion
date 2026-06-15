import type { AuthResponse, EnrollResponse, StatsResponse, Tenant, TenantCreate, TenantUpdate, DetailedStats, PortalToken } from './types'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export interface SystemStatus {
  anti_spoofing_enabled: boolean
  liveness_required: boolean
  deepface_model: string
  deepface_detector: string
  deepface_threshold: number
  face_quality_min: number
  price_enrollment: number
  price_auth: number
  price_antifaud_addon: number
  price_liveness_check: number
  app_env: string
  app_version: string
}

export const api = {
  // ── Admin (no auth required in dev) ──────────────────────────────────────
  async getSystemStatus(): Promise<SystemStatus> {
    const res = await fetch(`${BASE}/v1/admin/system/status`, { cache: 'no-store' })
    return handleResponse(res)
  },

  async listTenants(): Promise<Tenant[]> {
    const res = await fetch(`${BASE}/v1/admin/tenants/`, { cache: 'no-store' })
    return handleResponse(res)
  },

  async getTenant(id: string): Promise<Tenant> {
    const res = await fetch(`${BASE}/v1/admin/tenants/${id}`, { cache: 'no-store' })
    return handleResponse(res)
  },

  async createTenant(data: TenantCreate): Promise<Tenant> {
    const res = await fetch(`${BASE}/v1/admin/tenants/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  },

  async updateTenant(id: string, data: TenantUpdate): Promise<Tenant> {
    const res = await fetch(`${BASE}/v1/admin/tenants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  },

  async deactivateTenant(id: string): Promise<Tenant> {
    const res = await fetch(`${BASE}/v1/admin/tenants/${id}/deactivate`, { method: 'PATCH' })
    return handleResponse(res)
  },

  // ── Face API (requires X-API-Key) ─────────────────────────────────────────
  async getStats(apiKey: string, baseUrl = BASE): Promise<StatsResponse> {
    const res = await fetch(`${baseUrl}/v1/stats`, {
      headers: { 'X-API-Key': apiKey },
      cache: 'no-store',
    })
    return handleResponse(res)
  },

  async enrollFace(apiKey: string, externalId: string, image: File, baseUrl = BASE): Promise<EnrollResponse> {
    const form = new FormData()
    form.append('image', image)
    const res = await fetch(`${baseUrl}/v1/faces/enroll/${encodeURIComponent(externalId)}`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
      body: form,
    })
    return handleResponse(res)
  },

  async getChallenge(apiKey: string, baseUrl = BASE): Promise<{ challenge_id: string; expires_in: number }> {
    const res = await fetch(`${baseUrl}/v1/liveness/challenge`, {
      headers: { 'X-API-Key': apiKey },
      cache: 'no-store',
    })
    return handleResponse(res)
  },

  async authenticateFace(apiKey: string, externalId: string, image: File, baseUrl = BASE, activeLiveness = false): Promise<AuthResponse> {
    // Always pre-fetch a challenge; the server ignores it if liveness_required=false for this tenant.
    let challengeId: string | undefined
    try {
      const ch = await this.getChallenge(apiKey, baseUrl)
      challengeId = ch.challenge_id
    } catch { /* swallow — server will reject only if tenant requires it */ }

    const form = new FormData()
    form.append('image', image)
    const headers: Record<string, string> = { 'X-API-Key': apiKey }
    if (challengeId) headers['X-Challenge-Id'] = challengeId
    if (activeLiveness) headers['X-Active-Liveness'] = 'true'
    const res = await fetch(`${baseUrl}/v1/faces/authenticate/${encodeURIComponent(externalId)}`, {
      method: 'POST',
      headers,
      body: form,
    })
    return handleResponse(res)
  },

  async listSubjects(apiKey: string, baseUrl = BASE) {
    const res = await fetch(`${baseUrl}/v1/faces/subjects`, {
      headers: { 'X-API-Key': apiKey },
      cache: 'no-store',
    })
    return handleResponse(res)
  },

  // ── Tenant Portal ─────────────────────────────────────────────────────────
  async portalLogin(username: string, password: string): Promise<PortalToken> {
    const res = await fetch(`${BASE}/v1/portal/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    return handleResponse(res)
  },

  async portalStats(token: string): Promise<DetailedStats> {
    const res = await fetch(`${BASE}/v1/portal/stats`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    return handleResponse(res)
  },

  async portalHealth(token: string) {
    const res = await fetch(`${BASE}/v1/portal/health`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    return handleResponse(res)
  },
}
