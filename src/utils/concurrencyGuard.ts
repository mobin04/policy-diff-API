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

/** Maximum number of concurrent jobs that can be processed */
const MAX_CONCURRENT_JOBS = 5;

/** Set of currently active job IDs */
const activeJobs = new Set<string>();

/**
 * Check if a new job can be acquired
 * @returns true if under concurrency limit
 */
export function canAcquireJob(): boolean {
  return activeJobs.size < MAX_CONCURRENT_JOBS;
}

/**
 * Acquire a job slot for processing
 * Must be paired with releaseJob() when processing completes
 *
 * @param jobId - UUID of the job being processed
 * @returns true if slot acquired, false if at capacity
 */
export function acquireJob(jobId: string): boolean {
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
export function releaseJob(jobId: string): void {
  activeJobs.delete(jobId);
}

/**
 * Get current number of active jobs
 * Useful for health checks and monitoring
 */
export function getActiveJobCount(): number {
  return activeJobs.size;
}

/**
 * Get the maximum concurrent job limit
 */
export function getMaxConcurrentJobs(): number {
  return MAX_CONCURRENT_JOBS;
}

/**
 * Check if a specific job is currently being processed
 * @param jobId - UUID of the job to check
 */
export function isJobActive(jobId: string): boolean {
  return activeJobs.has(jobId);
}

/**
 * Clear all active jobs
 * ONLY for testing purposes - do not use in production
 */
export function _clearActiveJobsForTesting(): void {
  activeJobs.clear();
}
