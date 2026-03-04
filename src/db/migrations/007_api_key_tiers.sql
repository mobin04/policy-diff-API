-- API key tiers, quotas, and monthly usage tracking
--
-- This migration introduces:
-- - tier classification (FREE, STARTER, PRO)
-- - monthly_quota: per-key monthly job limit
-- - monthly_usage: jobs consumed in current period
-- - quota_reset_at: timestamp when usage will reset

ALTER TABLE api_keys
    ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'FREE'
        CHECK (tier IN ('FREE', 'STARTER', 'PRO'));

ALTER TABLE api_keys
    ADD COLUMN IF NOT EXISTS monthly_quota INTEGER;

ALTER TABLE api_keys
    ADD COLUMN IF NOT EXISTS monthly_usage INTEGER NOT NULL DEFAULT 0;

ALTER TABLE api_keys
    ADD COLUMN IF NOT EXISTS quota_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill monthly_quota for existing keys based on default FREE tier (30 jobs)
UPDATE api_keys
SET monthly_quota = 30
WHERE monthly_quota IS NULL;

-- Indexes for tier-based queries and scheduled maintenance
CREATE INDEX IF NOT EXISTS idx_api_keys_tier ON api_keys(tier);
CREATE INDEX IF NOT EXISTS idx_api_keys_quota_reset_at ON api_keys(quota_reset_at);
