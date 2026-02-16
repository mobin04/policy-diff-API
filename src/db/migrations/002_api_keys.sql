-- API Keys table for authentication
-- Security Note: We store only hashed keys (SHA-256) to protect against database breaches.
-- If the database is compromised, attackers cannot recover the original API keys.

CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    -- SHA-256 hash of the API key. Raw keys are NEVER stored.
    key_hash TEXT NOT NULL UNIQUE,
    -- Human-readable name for the key (e.g., "My App Production Key")
    name TEXT NOT NULL,
    -- Environment restriction: 'dev' keys work only in development, 'prod' in production
    environment TEXT CHECK (environment IN ('dev', 'prod')) NOT NULL,
    -- Soft delete: allows disabling keys without removing history
    is_active BOOLEAN DEFAULT TRUE,
    -- Simple usage counter for rate limiting and future billing
    -- Note: This is a basic implementation. For high-traffic scenarios,
    -- consider Redis-based counters or time-windowed rate limiting.
    usage_count INTEGER DEFAULT 0,
    -- Maximum requests allowed (per billing period, currently unlimited time window)
    -- This prepares for future billing tiers (e.g., free=100, pro=10000)
    rate_limit INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast key lookup during authentication
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

-- Index for listing active keys by environment
CREATE INDEX IF NOT EXISTS idx_api_keys_environment_active ON api_keys(environment, is_active);
