import { DB } from '../db';
import { MonitorJob, MonitorJobRow, JobStatus, JobErrorType, DiffResult } from '../types';

/**
 * Convert database row to MonitorJob entity
 */
function rowToEntity(row: MonitorJobRow): MonitorJob {
  return {
    id: row.id,
    pageId: row.page_id,
    batchId: row.batch_id,
    status: row.status,
    result: row.result,
    errorType: row.error_type,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

/**
 * Create a new monitor job with PENDING status
 *
 * @param pageId - ID of the page to monitor
 * @param batchId - Optional batch ID to group this job
 * @returns Created job entity
 */
export async function createJob(pageId: number, batchId: string | null = null): Promise<MonitorJob> {
  const result = await DB.query<MonitorJobRow>(
    `INSERT INTO monitor_jobs (page_id, batch_id, status)
     VALUES ($1, $2, 'PENDING')
     RETURNING *`,
    [pageId, batchId],
  );

  return rowToEntity(result.rows[0]);
}

/**
 * Get job by ID
 *
 * @param jobId - UUID of the job
 * @returns Job entity or null if not found
 */
export async function getJobById(jobId: string): Promise<MonitorJob | null> {
  const result = await DB.query<MonitorJobRow>('SELECT * FROM monitor_jobs WHERE id = $1', [jobId]);

  if (result.rows.length === 0) {
    return null;
  }

  return rowToEntity(result.rows[0]);
}

/**
 * Update job status to PROCESSING and set started_at
 *
 * @param jobId - UUID of the job
 * @returns Updated job or null if not found
 */
export async function markJobProcessing(jobId: string): Promise<MonitorJob | null> {
  const result = await DB.query<MonitorJobRow>(
    `UPDATE monitor_jobs
     SET status = 'PROCESSING', started_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [jobId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToEntity(result.rows[0]);
}

/**
 * Mark job as completed with result
 *
 * @param jobId - UUID of the job
 * @param result - Diff result to store
 * @returns Updated job or null if not found
 */
export async function markJobCompleted(jobId: string, result: DiffResult): Promise<MonitorJob | null> {
  const queryResult = await DB.query<MonitorJobRow>(
    `UPDATE monitor_jobs
     SET status = 'COMPLETED', result = $2, completed_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [jobId, JSON.stringify(result)],
  );

  if (queryResult.rows.length === 0) {
    return null;
  }

  return rowToEntity(queryResult.rows[0]);
}

/**
 * Mark job as failed with error type
 *
 * @param jobId - UUID of the job
 * @param errorType - Type of error that caused failure
 * @returns Updated job or null if not found
 */
export async function markJobFailed(jobId: string, errorType: JobErrorType): Promise<MonitorJob | null> {
  const result = await DB.query<MonitorJobRow>(
    `UPDATE monitor_jobs
     SET status = 'FAILED', error_type = $2, completed_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [jobId, errorType],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToEntity(result.rows[0]);
}

/**
 * Get jobs by status
 * Useful for finding orphaned PROCESSING jobs on startup
 *
 * @param status - Job status to filter by
 * @returns Array of matching jobs
 */
export async function getJobsByStatus(status: JobStatus): Promise<MonitorJob[]> {
  const result = await DB.query<MonitorJobRow>(
    'SELECT * FROM monitor_jobs WHERE status = $1 ORDER BY created_at DESC',
    [status],
  );

  return result.rows.map(rowToEntity);
}

/**
 * Mark orphaned PROCESSING jobs as FAILED
 * Called on server startup to clean up jobs that were interrupted
 *
 * @returns Number of jobs marked as failed
 */
export async function markOrphanedJobsFailed(): Promise<number> {
  const result = await DB.query(
    `UPDATE monitor_jobs
     SET status = 'FAILED', error_type = 'INTERNAL_ERROR', completed_at = NOW()
     WHERE status = 'PROCESSING'`,
  );

  return result.rowCount ?? 0;
}
