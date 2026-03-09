"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJob = createJob;
exports.getJobById = getJobById;
exports.markJobProcessing = markJobProcessing;
exports.markJobCompleted = markJobCompleted;
exports.markJobFailed = markJobFailed;
exports.getJobsByStatus = getJobsByStatus;
exports.getActiveJobCountForKey = getActiveJobCountForKey;
exports.markOrphanedJobsFailed = markOrphanedJobsFailed;
exports.countProcessingJobs = countProcessingJobs;
const db_1 = require("../db");
/**
 * Convert database row to MonitorJob entity
 */
function rowToEntity(row) {
    return {
        id: row.id,
        pageId: row.page_id,
        url: row.url,
        apiKeyId: row.api_key_id ?? null,
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
 * @param apiKeyId - ID of the API key creating the job
 * @param batchId - Optional batch ID to group this job
 * @param client - Optional DB client for transaction
 * @returns Created job entity
 */
async function createJob(pageId, apiKeyId, batchId = null, client) {
    const db = client || db_1.DB;
    const result = await db.query(`INSERT INTO monitor_jobs (page_id, api_key_id, batch_id, status)
     VALUES ($1, $2, $3, 'PENDING')
     RETURNING *`, [pageId, apiKeyId, batchId]);
    return rowToEntity(result.rows[0]);
}
/**
 * Get job by ID
 *
 * @param jobId - UUID of the job
 * @returns Job entity or null if not found
 */
async function getJobById(jobId) {
    const result = await db_1.DB.query(`SELECT j.*, p.url 
     FROM monitor_jobs j
     JOIN pages p ON j.page_id = p.id
     WHERE j.id = $1`, [jobId]);
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
async function markJobProcessing(jobId) {
    const result = await db_1.DB.query(`UPDATE monitor_jobs j
     SET status = 'PROCESSING', started_at = NOW()
     FROM pages p
     WHERE j.page_id = p.id AND j.id = $1
     RETURNING j.*, p.url`, [jobId]);
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
async function markJobCompleted(jobId, result) {
    const queryResult = await db_1.DB.query(`UPDATE monitor_jobs j
     SET status = 'COMPLETED', result = $2, completed_at = NOW()
     FROM pages p
     WHERE j.page_id = p.id AND j.id = $1
     RETURNING j.*, p.url`, [jobId, JSON.stringify(result)]);
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
async function markJobFailed(jobId, errorType) {
    const result = await db_1.DB.query(`UPDATE monitor_jobs j
     SET status = 'FAILED', error_type = $2, completed_at = NOW()
     FROM pages p
     WHERE j.page_id = p.id AND j.id = $1
     RETURNING j.*, p.url`, [jobId, errorType]);
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
async function getJobsByStatus(status) {
    const result = await db_1.DB.query(`SELECT j.*, p.url 
     FROM monitor_jobs j
     JOIN pages p ON j.page_id = p.id
     WHERE j.status = $1 
     ORDER BY j.created_at DESC`, [status]);
    return result.rows.map(rowToEntity);
}
/**
 * Count active (PROCESSING) jobs for a specific API key
 *
 * @param apiKeyId - ID of the API key
 * @returns Count of jobs currently in PROCESSING state
 */
async function getActiveJobCountForKey(apiKeyId) {
    const result = await db_1.DB.query("SELECT COUNT(*) as count FROM monitor_jobs WHERE status = 'PROCESSING' AND api_key_id = $1", [apiKeyId]);
    return parseInt(result.rows[0].count, 10);
}
/**
 * Mark orphaned PROCESSING jobs as FAILED
 * Called on server startup to clean up jobs that were interrupted
 *
 * @returns Number of jobs marked as failed
 */
async function markOrphanedJobsFailed() {
    const result = await db_1.DB.query(`UPDATE monitor_jobs
     SET status = 'FAILED', error_type = 'CRASH_RECOVERY', completed_at = NOW()
     WHERE status = 'PROCESSING'
     AND started_at < NOW() - INTERVAL '5 minutes'`);
    return result.rowCount ?? 0;
}
/**
 * Count all jobs currently in PROCESSING state
 *
 * Used by the concurrency reconciliation guard to compare
 * the database state against the in-memory concurrency counter.
 *
 * @returns Number of PROCESSING jobs in the database
 */
async function countProcessingJobs() {
    const result = await db_1.DB.query("SELECT COUNT(*)::int AS count FROM monitor_jobs WHERE status = 'PROCESSING'");
    return result.rows[0].count;
}
