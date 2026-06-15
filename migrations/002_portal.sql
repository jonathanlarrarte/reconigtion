-- Migration 002: Portal users, liveness billing, enhanced tracking
-- Run: docker compose exec db psql -U postgres -d faceid_saas -f /migrations/002_portal.sql

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS portal_username        VARCHAR(100) UNIQUE,
    ADD COLUMN IF NOT EXISTS portal_password_hash   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS monthly_liveness_limit INTEGER DEFAULT 500,
    ADD COLUMN IF NOT EXISTS current_month_liveness_checks INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS custom_price_liveness  FLOAT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_portal_username ON tenants(portal_username) WHERE portal_username IS NOT NULL;

ALTER TABLE auth_attempts
    ADD COLUMN IF NOT EXISTS liveness_failed BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_real_face    BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_auth_success ON auth_attempts(tenant_id, success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_fraud   ON auth_attempts(tenant_id, deepfake_detected, created_at DESC);
