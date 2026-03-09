"use strict";
/**
 * In-memory concurrency guard for limiting active job processing
 *
 * IMPORTANT: This is a single-instance solution. It does NOT work for:
 * - Multiple server instances (horizontal scaling)
 * - Clustered Node.js deployments
 * - Serverless environments
 *
 * For distributed deployments, use Redis-based locking or a distributed queue.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canAcquireJob = canAcquireJob;
exports.acquireJob = acquireJob;
exports.releaseJob = releaseJob;
exports.getActiveJobCount = getActiveJobCount;
exports.getMaxConcurrentJobs = getMaxConcurrentJobs;
exports.isJobActive = isJobActive;
exports._clearActiveJobsForTesting = _clearActiveJobsForTesting;
exports.resetActiveJobs = resetActiveJobs;
/** Maximum number of concurrent jobs that can be processed */
const MAX_CONCURRENT_JOBS = 5;
/** Set of currently active job IDs */
const activeJobs = new Set();
/**
 * Check if a new job can be acquired
 * @returns true if under concurrency limit
 */
function canAcquireJob() {
    return activeJobs.size < MAX_CONCURRENT_JOBS;
}
/**
 * Acquire a job slot for processing
 * Must be paired with releaseJob() when processing completes
 *
 * @param jobId - UUID of the job being processed
 * @returns true if slot acquired, false if at capacity
 */
function acquireJob(jobId) {
    if (activeJobs.size >= MAX_CONCURRENT_JOBS) {
        return false;
    }
    activeJobs.add(jobId);
    return true;
}
/**
 * Release a job slot after processing completes (success or failure)
 *
 * @param jobId - UUID of the job that finished processing
 */
function releaseJob(jobId) {
    activeJobs.delete(jobId);
}
/**
 * Get current number of active jobs
 * Useful for health checks and monitoring
 */
function getActiveJobCount() {
    return activeJobs.size;
}
/**
 * Get the maximum concurrent job limit
 */
function getMaxConcurrentJobs() {
    return MAX_CONCURRENT_JOBS;
}
/**
 * Check if a specific job is currently being processed
 * @param jobId - UUID of the job to check
 */
function isJobActive(jobId) {
    return activeJobs.has(jobId);
}
/**
 * Clear all active jobs
 * ONLY for testing purposes - do not use in production
 * For production reconciliation, use resetActiveJobs() instead.
 */
function _clearActiveJobsForTesting() {
    activeJobs.clear();
}
/**
 * Reset in-memory active jobs set.
 * Used by the concurrency reconciliation guard when drift is detected.
 * The database is the source of truth — this clears the in-memory set
 * so that only genuinely active jobs re-acquire slots.
 */
function resetActiveJobs() {
    activeJobs.clear();
}
