-- Request Abuse Instrumentation
-- This table tracks abnormal request patterns for observability and hardening

CREATE TABLE IF NOT EXISTS request_abuse_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
    request_ip TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_abuse_events_event_type ON request_abuse_events(event_type);
CREATE INDEX IF NOT EXISTS idx_request_abuse_events_api_key_id ON request_abuse_events(api_key_id);
CREATE INDEX IF NOT EXISTS idx_request_abuse_events_created_at ON request_abuse_events(created_at DESC);
