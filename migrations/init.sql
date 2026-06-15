-- ============================================================
-- FaceID SaaS — Esquema inicial de base de datos
-- Ejecutar en PostgreSQL con la extensión pgvector instalada
-- ============================================================

-- 1. Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tenants (empresas clientes)
CREATE TABLE IF NOT EXISTS tenants (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                    VARCHAR(255) NOT NULL,
    slug                    VARCHAR(100) UNIQUE NOT NULL,
    api_key                 VARCHAR(64) UNIQUE NOT NULL,

    plan                    VARCHAR(50) DEFAULT 'starter',
    stripe_customer_id      VARCHAR(255),
    stripe_subscription_id  VARCHAR(255),

    monthly_auth_limit      INTEGER DEFAULT 1000,
    monthly_enroll_limit    INTEGER DEFAULT 200,

    current_month_auths        INTEGER DEFAULT 0,
    current_month_enrollments  INTEGER DEFAULT 0,
    billing_period_start       TIMESTAMP,

    custom_price_enrollment FLOAT,
    custom_price_auth       FLOAT,

    anti_spoofing_enabled   BOOLEAN DEFAULT TRUE,
    webhook_url             VARCHAR(512),
    is_active               BOOLEAN DEFAULT TRUE,

    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_api_key ON tenants(api_key);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- 3. Sujetos enrolados (usuarios finales de los tenants)
CREATE TABLE IF NOT EXISTS face_subjects (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    external_id     VARCHAR(255) NOT NULL,
    display_name    VARCHAR(255),
    metadata        JSONB,

    face_embedding  vector(512),

    enrollment_quality_score  FLOAT,
    enrollment_images_count   INTEGER DEFAULT 0,
    is_enrolled     BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,

    enrolled_at     TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),

    UNIQUE(tenant_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_subjects_tenant_external ON face_subjects(tenant_id, external_id);
CREATE INDEX IF NOT EXISTS idx_subjects_tenant_id ON face_subjects(tenant_id);

-- Índice HNSW para búsqueda ANN — necesario para escalar a millones de embeddings
CREATE INDEX IF NOT EXISTS idx_face_embedding_hnsw
    ON face_subjects USING hnsw (face_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 4. Intentos de autenticación
CREATE TABLE IF NOT EXISTS auth_attempts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subject_id      UUID REFERENCES face_subjects(id) ON DELETE SET NULL,

    success             BOOLEAN NOT NULL,
    confidence_score    FLOAT,
    distance            FLOAT,

    is_real_face        BOOLEAN,
    spoofing_score      FLOAT,
    deepfake_detected   BOOLEAN,
    fraud_signals       JSONB,

    billed          BOOLEAN DEFAULT FALSE,
    amount_charged  FLOAT,

    ip_address  VARCHAR(45),
    user_agent  TEXT,
    request_id  VARCHAR(64),

    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_tenant_date ON auth_attempts(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_request_id ON auth_attempts(request_id);
CREATE INDEX IF NOT EXISTS idx_auth_subject ON auth_attempts(subject_id);

-- 5. Audit log
CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID REFERENCES tenants(id) ON DELETE SET NULL,
    event_type  VARCHAR(100) NOT NULL,
    actor_id    VARCHAR(255),
    actor_type  VARCHAR(50),
    payload     JSONB,
    ip_address  VARCHAR(45),
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_date ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_logs(event_type);

-- 6. Admin users
CREATE TABLE IF NOT EXISTS admin_users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email           VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255),
    role            VARCHAR(50) DEFAULT 'tenant_admin',
    is_active       BOOLEAN DEFAULT TRUE,
    last_login      TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_email ON admin_users(email);

-- 7. Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_face_subjects_updated_at
    BEFORE UPDATE ON face_subjects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Tenant de prueba para desarrollo
-- API key: fid_dev_test_key_change_in_production
-- ============================================================
INSERT INTO tenants (
    name, slug, api_key, plan,
    monthly_auth_limit, monthly_enroll_limit
) VALUES (
    'Demo Company', 'demo',
    'fid_dev_test_key_change_in_production',
    'business', 10000, 2000
) ON CONFLICT (slug) DO NOTHING;
