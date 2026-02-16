-- API Logs table for audit and analytics
-- Security Note: We intentionally DO NOT store request/response bodies.
-- This table stores only metadata for compliance and analytics purposes.

CREATE TABLE IF NOT EXISTS api_logs (
    id SERIAL PRIMARY KEY,
    -- NULL for unauthenticated requests (e.g., health checks, failed auth)
    api_key_id INTEGER REFERENCES api_keys(id),
    -- Endpoint path (e.g., "/v1/check")
    endpoint TEXT NOT NULL,
    -- HTTP status code
    status_code INTEGER NOT NULL,
    -- Response time in milliseconds
    response_time INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for querying logs by API key (usage reports, billing)
CREATE INDEX IF NOT EXISTS idx_api_logs_api_key_id ON api_logs(api_key_id);

-- Index for time-based queries (analytics, cleanup)
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at);

-- Composite index for filtering by status code and time (error analysis)
CREATE INDEX IF NOT EXISTS idx_api_logs_status_created ON api_logs(status_code, created_at);
