-- Migration for Production Hardening Layer
--
-- Features:
-- 1. Idempotency Keys table for POST /v1/monitor and /v1/monitor/batch
-- 2. api_key_id added to monitor_jobs for per-key concurrency control
-- 3. Job Timeout and Crash Recovery support

-- 1. Add api_key_id to monitor_jobs
ALTER TABLE monitor_jobs ADD COLUMN IF NOT EXISTS api_key_id INTEGER REFERENCES api_keys(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_monitor_jobs_api_key_id ON monitor_jobs(api_key_id);

-- 2. Create idempotency_keys table
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL, -- SHA-256 hash in hex (64 chars)
    response_body JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(api_key_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_api_key_id ON idempotency_keys(api_key_id);
