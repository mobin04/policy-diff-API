-- Page caching columns for performance optimization
--
-- WHY DB-LEVEL CACHING IS SUFFICIENT FOR MVP:
-- - No external dependency (Redis) to manage
-- - Atomic updates with page record
-- - Simpler deployment and debugging
-- - Sufficient for low-to-medium traffic
--
-- HOW THIS PREPARES FOR FUTURE SCALING:
-- - Can migrate to Redis/Memcached later without API changes
-- - last_checked_at enables time-based invalidation strategies
-- - last_result structure matches API response format

-- Store the last computed result (diff + risk analysis)
-- Avoids recomputing when content hasn't changed
ALTER TABLE pages ADD COLUMN IF NOT EXISTS last_result JSONB;

-- Track when page was last checked for cooldown feature
-- Enables "skip if checked recently" optimization
ALTER TABLE pages ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP;

-- Index for cooldown queries
CREATE INDEX IF NOT EXISTS idx_pages_last_checked_at ON pages(last_checked_at);
