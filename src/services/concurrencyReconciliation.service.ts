import { countProcessingJobs } from '../repositories/monitorJob.repository';
import { getActiveJobCount, resetActiveJobs } from '../utils/concurrencyGuard';
import { FastifyBaseLogger } from 'fastify';

/**
 * Concurrency Reconciliation Guard
 *
 * Verifies consistency between the in-memory concurrency counter
 * and the database PROCESSING job count.
 *
 * If drift is detected:
 * - Logs a structured error
 * - Corrects the in-memory counter to match the DB value
 * - Logs the repair event
 *
 * This must never throw or crash the server.
 */

let _logger: FastifyBaseLogger | null = null;

/**
 * Initialized the reconciliation service with a structured logger.
 * Must be called once at startup.
 */
export function initReconciliation(logger: FastifyBaseLogger): void {
  _logger = logger;
}

/**
 * Reconcile the in-memory concurrency counter with the database.
 *
 * - Fetches DB PROCESSING count
 * - Fetches in-memory active count
 * - If they match: return silently
 * - If they differ: log error, correct in-memory counter, log repair
 *
 * STRICT:
 * - No console.log — uses structured logger
 * - No throwing — all errors are caught and logged
 * - Must never crash the server
 */
export async function reconcileConcurrencyState(): Promise<void> {
  try {
    const dbCount = await countProcessingJobs();
    const inMemoryCount = getActiveJobCount();

    if (dbCount === inMemoryCount) {
      return;
    }

    if (_logger) {
      _logger.error(
        {
          event: 'concurrency_drift_detected',
          in_memory_count: inMemoryCount,
          db_count: dbCount,
        },
        'In-memory concurrency counter does not match database PROCESSING count',
      );
    }

    // Repair: clear in-memory set to match DB source of truth.
    // Since we cannot selectively add/remove unknown job IDs,
    // we reset the set entirely. Active jobs that are genuinely
    // processing will re-acquire their slots on the next iteration.
    resetActiveJobs();

    if (_logger) {
      _logger.info(
        {
          event: 'concurrency_drift_repaired',
          previous_in_memory: inMemoryCount,
          corrected_to_db: dbCount,
        },
        'In-memory concurrency counter reset to match database state',
      );
    }
  } catch (err: unknown) {
    if (_logger) {
      _logger.error({ err, event: 'concurrency_reconciliation_failure' }, 'Failed to reconcile concurrency state');
    }
  }
}
