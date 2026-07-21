export interface Tenant {
  id: string
  name: string
  slug: string
  api_key: string
  plan: string
  monthly_auth_limit: number
  monthly_enroll_limit: number
  monthly_liveness_limit: number
  current_month_auths: number
  current_month_enrollments: number
  current_month_liveness_checks: number
  portal_username: string | null
  anti_spoofing_enabled: boolean
  liveness_required: boolean
  webhook_url: string | null
  is_active: boolean
  created_at: string
}

export interface TenantCreate {
  name: string
  slug: string
  plan: string
  monthly_auth_limit: number
  monthly_enroll_limit: number
  monthly_liveness_limit: number
  portal_username?: string
  portal_password?: string
}

export interface TenantUpdate {
  monthly_auth_limit?: number
  monthly_enroll_limit?: number
  monthly_liveness_limit?: number
  anti_spoofing_enabled?: boolean
  liveness_required?: boolean
  webhook_url?: string
  plan?: string
}

export interface DailyStat {
  date: string
  total: number
  successful: number
  failed: number
  fraud: number
}

export interface DetailedStats {
  tenant_id: string
  tenant_name: string
  plan: string
  billing_period_start: string | null
  auths_this_month: number
  auth_limit: number
  successful_auths: number
  failed_auths: number
  auth_success_rate: number
  enrollments_this_month: number
  enrollment_limit: number
  active_subjects: number
  liveness_checks_this_month: number
  liveness_limit: number
  fraud_attempts: number
  spoof_attempts: number
  estimated_cost_usd: number
  cost_breakdown: { enrollments: number; authentications: number; liveness: number; total: number }
  daily_stats: DailyStat[]
  api_online: boolean
  api_key_masked: string
}

export interface PortalToken {
  access_token: string
  token_type: string
  tenant_name: string
  tenant_slug: string
  tenant_id: string
}

export interface StatsResponse {
  tenant_id: string
  tenant_name: string
  plan: string
  billing_period_start: string | null
  enrollments_this_month: number
  enrollment_limit: number
  active_subjects: number
  auths_this_month: number
  auth_limit: number
  auth_success_rate: number
  fraud_attempts_this_month: number
  estimated_cost_usd: number
}

export interface EnrollResponse {
  subject_id: string
  external_id: string
  enrolled: boolean
  quality_score: number
  is_real_face: boolean
  message: string
  amount_charged: number
  request_id: string
}

export interface AuthResponse {
  request_id: string
  verified: boolean
  subject_id: string
  external_id: string
  confidence: number
  distance: number
  is_real_face: boolean
  spoofing_score: number
  fraud_detected: boolean
  amount_charged: number
  timestamp: string
}

export interface AuthLogEntry {
  id: string
  external_id: string | null
  success: boolean
  confidence_score: number | null
  fraud_detected: boolean | null
  is_real_face: boolean | null
  spoofing_score: number | null
  ip_address: string | null
  created_at: string
  amount_charged: number | null
}

export interface LogsResponse {
  items: AuthLogEntry[]
  total: number
  page: number
  pages: number
}

export interface Subject {
  id: string
  external_id: string
  display_name: string | null
  is_enrolled: boolean
  enrollment_quality_score: number | null
  enrollment_images_count: number
  enrolled_at: string | null
  created_at: string
}
