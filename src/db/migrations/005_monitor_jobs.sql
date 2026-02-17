-- Monitor Jobs table for async monitoring execution
--
-- WHY ASYNC JOB-BASED MONITORING:
-- - Synchronous execution blocks the HTTP connection during long-running operations
-- - External pages can take 5-30 seconds to fetch, normalize, and diff
-- - Job-based model allows immediate response with polling for results
-- - Enables better observability into processing pipeline
--
-- WHY POSTGRESQL AS JOB STATE STORE:
-- - No external dependencies (Redis/RabbitMQ)
-- - Transactional guarantees on state transitions
-- - Simple deployment and debugging
-- - Sufficient for single-instance deployment
--
-- IMPORTANT: This is NOT a distributed queue. For horizontal scaling,
-- migrate to Redis/BullMQ or similar distributed job queue.

-- Job status enum-like constraint
-- Using CHECK constraint instead of PostgreSQL ENUM for easier migrations
CREATE TABLE IF NOT EXISTS monitor_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    result JSONB,
    error_type VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Index for querying jobs by page
CREATE INDEX IF NOT EXISTS idx_monitor_jobs_page_id ON monitor_jobs(page_id);

-- Index for querying jobs by status (useful for finding pending/stuck jobs)
CREATE INDEX IF NOT EXISTS idx_monitor_jobs_status ON monitor_jobs(status);

-- Index for ordering by creation time (most recent first)
CREATE INDEX IF NOT EXISTS idx_monitor_jobs_created_at ON monitor_jobs(created_at DESC);
