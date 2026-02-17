-- Monitor Batches table for grouping async monitor jobs
--
-- WHY BATCHES:
-- - Clients often need to monitor multiple URLs together (e.g., privacy + terms)
-- - A batch groups jobs under a single identifier for aggregated polling
-- - This remains single-instance and deterministic (no queue/cron/redis)
--
-- NOTE ON TYPES:
-- - api_keys.id is SERIAL (integer) in this codebase, so api_key_id is INTEGER

CREATE TABLE IF NOT EXISTS monitor_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    total_jobs INTEGER NOT NULL CHECK (total_jobs > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for filtering batches by API key
CREATE INDEX IF NOT EXISTS idx_monitor_batches_api_key_id ON monitor_batches(api_key_id);

-- Index for listing most recent batches first
CREATE INDEX IF NOT EXISTS idx_monitor_batches_created_at_desc ON monitor_batches(created_at DESC);

-- Add optional batch_id to monitor_jobs
ALTER TABLE monitor_jobs
    ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Add foreign key constraint (idempotent)
DO $$
BEGIN
    ALTER TABLE monitor_jobs
        ADD CONSTRAINT fk_monitor_jobs_batch_id
        FOREIGN KEY (batch_id) REFERENCES monitor_batches(id) ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Index for querying jobs by batch
CREATE INDEX IF NOT EXISTS idx_monitor_jobs_batch_id ON monitor_jobs(batch_id);
