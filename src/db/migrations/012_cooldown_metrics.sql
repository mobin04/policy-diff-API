-- Cooldown Integrity Instrumentation
-- This table tracks cooldown hits and integrity warnings for observability

CREATE TABLE IF NOT EXISTS cooldown_hits (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    hit_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    integrity_warning BOOLEAN DEFAULT FALSE,
    isolation_drift_detected BOOLEAN DEFAULT FALSE,
    previous_fingerprint TEXT,
    cached_fingerprint TEXT
);

CREATE INDEX IF NOT EXISTS idx_cooldown_hits_page_id ON cooldown_hits(page_id);
CREATE INDEX IF NOT EXISTS idx_cooldown_hits_hit_at ON cooldown_hits(hit_at DESC);
