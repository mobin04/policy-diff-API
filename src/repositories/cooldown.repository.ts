import { DB } from '../db';

/**
 * Record a cooldown cache hit for instrumentation and metrics.
 *
 * @param pageId - Database ID of the page
 * @param integrityWarning - True if cached result was missing expected metadata
 * @param isolationDriftDetected - True if the cached result previously flagged drift
 */
export async function recordCooldownHit(
  pageId: number,
  integrityWarning: boolean = false,
  isolationDriftDetected: boolean = false,
): Promise<void> {
  await DB.query(
    'INSERT INTO cooldown_hits (page_id, integrity_warning, isolation_drift_detected) VALUES ($1, $2, $3)',
    [pageId, integrityWarning, isolationDriftDetected],
  );
}
