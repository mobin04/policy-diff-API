-- Durable URL subscriptions for automatic daily monitoring.
--
-- monitor_jobs remains the historical execution table. This table records the
-- current active URLs each API key wants checked by the daily scheduler.

CREATE TABLE IF NOT EXISTS monitored_urls (
    id SERIAL PRIMARY KEY,
    api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_scheduled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(api_key_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_monitored_urls_active ON monitored_urls(is_active);
CREATE INDEX IF NOT EXISTS idx_monitored_urls_api_key_id ON monitored_urls(api_key_id);
CREATE INDEX IF NOT EXISTS idx_monitored_urls_page_id ON monitored_urls(page_id);
