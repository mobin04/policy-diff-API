import { DB } from '../db';
import { fetchPage } from '../utils/fetchPage';
import { normalizeContent } from './normalizer.service';
import { extractSections } from './sectionExtractor.service';
import { generateHash } from '../utils/hash';
import { canonicalizeUrl } from '../utils/canonicalizeUrl';
import { diffSections } from './differ.service';
import { analyzeRisk } from './riskEngine.service';
import { acquireJob, releaseJob, canAcquireJob, getActiveJobCount, getMaxConcurrentJobs } from '../utils/concurrencyGuard';
import { ensurePageExists } from '../repositories/page.repository';
import {
  createJob,
  markJobProcessing,
  markJobCompleted,
  markJobFailed,
  getJobById,
  getActiveJobCountForKey,
} from '../repositories/monitorJob.repository';
import { saveIdempotencyRecord } from '../repositories/idempotency.repository';
import { MonitorJob, JobErrorType, DiffResult, Section } from '../types';
import {
  InvalidUrlError,
  FetchError,
  HttpError,
  isApiError,
  QuotaExceededError,
  UnsupportedDynamicPageError,
  PageAccessBlockedError,
  InvalidPageContentError,
} from '../errors';
import { loadUsageRowForUpdate } from './usage.service';
import { runCrashRecovery } from './startupRecoveryService';

const MAX_JOB_RUNTIME_MS = 15000;
const MAX_CONCURRENT_JOBS_PER_KEY = 2;

/**
 * Logger interface matching Fastify's logger
 */
type Logger = {
  debug: (obj: object, msg: string) => void;
  info: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
};

type QueuedJob = { jobId: string; logger?: Logger };

/**
 * In-memory FIFO queue for jobs waiting on concurrency slots.
 *
 * This keeps the system single-instance and deterministic:
 * - Jobs are created in DB immediately (PENDING)
 * - Processing starts when a concurrency slot becomes available
 * - No Redis / message queue / cron is introduced
 */
const pendingQueue: QueuedJob[] = [];
const queuedJobIds = new Set<string>();
let drainScheduled = false;

/**
 * Maximum number of queued jobs allowed in memory.
 * When exceeded, the system rejects new job submissions with 429.
 */
const MAX_QUEUED_JOBS = 1000;

function scheduleDrain(): void {
  if (drainScheduled) return;
  drainScheduled = true;
  setImmediate(() => {
    drainScheduled = false;

    // Start as many jobs as we have capacity for
    while (pendingQueue.length > 0 && canAcquireJob()) {
      const next = pendingQueue.shift()!;
      queuedJobIds.delete(next.jobId);

      processMonitorJob(next.jobId, next.logger).catch((err) => {
        // This catch should never trigger as processMonitorJob handles all errors
        // But we log it just in case
        if (next.logger) {
          next.logger.error({ jobId: next.jobId, error: String(err) }, 'Unexpected error in queued job processing');
        }
      });
    }
  });
}

/**
 * Enqueue a job for async processing, respecting MAX_CONCURRENT_JOBS.
 *
 * If a slot is available, processing will begin immediately (next tick).
 * If not, the job remains PENDING until a slot frees up.
 */
export function enqueueMonitorJobProcessing(jobId: string, logger?: Logger): void {
  if (queuedJobIds.has(jobId)) return;
  queuedJobIds.add(jobId);
  pendingQueue.push({ jobId, logger });
  scheduleDrain();
}

/**
 * Check if the system can accept new jobs without unbounded queuing.
 *
 * Policy:
 * - Jobs may be queued in-memory when MAX_CONCURRENT_JOBS is reached
 * - Reject only when the in-memory queue would exceed MAX_QUEUED_JOBS
 */
export function canAcceptNewJobs(jobCount = 1): boolean {
  const inFlight = getActiveJobCount();
  const queued = pendingQueue.length;
  const capacity = getMaxConcurrentJobs() + MAX_QUEUED_JOBS;
  return inFlight + queued + jobCount <= capacity;
}

/**
 * Create a new monitor job for the given URL
 *
 * Flow:
 * 1. Canonicalize URL
 * 2. BEGIN Transaction
 * 3. Enforce and Consume Quota (atomic)
 * 4. Ensure page exists (upsert)
 * 5. Create job with PENDING status
 * 6. Store idempotency record if requested
 * 7. COMMIT Transaction
 * 8. Schedule async processing via setImmediate
 *
 * @param apiKeyId - ID of authenticated API key
 * @param rawUrl - User-provided URL
 * @param logger - Optional logger
 * @param idempotencyOptions - Optional key and body hash for idempotency storage
 * @returns Created job entity
 */
export async function createMonitorJob(
  apiKeyId: number,
  rawUrl: string,
  logger?: Logger,
  idempotencyOptions?: { key: string; requestHash: string },
): Promise<MonitorJob> {
  const canonicalUrl = canonicalizeUrl(rawUrl);

  if (logger) {
    logger.debug({ apiKeyId, rawUrl, canonicalUrl }, 'Creating monitor job');
  }

  const client = await DB.connect();
  try {
    await client.query('BEGIN');

    // 1. Quota consumption: single job (atomic within transaction)
    const usage = await loadUsageRowForUpdate(client, apiKeyId);
    if (usage.monthly_usage + 1 > usage.monthly_quota) {
      throw new QuotaExceededError();
    }
    await client.query('UPDATE api_keys SET monthly_usage = monthly_usage + 1 WHERE id = $1', [apiKeyId]);

    // 2. Ensure page exists (upsert)
    const pageId = await ensurePageExists(canonicalUrl, client);

    // 3. Create job with PENDING status
    const job = await createJob(pageId, apiKeyId, null, client);

    // 4. Store idempotency record if requested (atomic with job creation)
    if (idempotencyOptions) {
      const responseBody = {
        job_id: job.id,
        status: job.status,
      };
      await saveIdempotencyRecord(
        apiKeyId,
        idempotencyOptions.key,
        idempotencyOptions.requestHash,
        responseBody,
        client,
      );
    }

    await client.query('COMMIT');

    if (logger) {
      logger.info({ jobId: job.id, pageId, canonicalUrl }, 'Monitor job created');
    }

    // Schedule async processing
    enqueueMonitorJobProcessing(job.id, logger);

    return job;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Process a monitor job through the full pipeline
 *
 * Pipeline:
 * 1. Acquire global concurrency slot
 * 2. Check per-API-key concurrency limit
 * 3. Mark job as PROCESSING
 * 4. Execute monitoring pipeline with timeout enforcement
 *
 * @param jobId - UUID of the job to process
 * @param logger - Optional logger for observability
 */
export async function processMonitorJob(jobId: string, logger?: Logger): Promise<void> {
  // Try to acquire global concurrency slot
  if (!acquireJob(jobId)) {
    // At global capacity: keep job PENDING and queue for later processing
    enqueueMonitorJobProcessing(jobId, logger);
    return;
  }

  try {
    // Get job details
    const job = await getJobById(jobId);
    if (!job) {
      if (logger) {
        logger.error({ jobId }, 'Job not found');
      }
      releaseJob(jobId);
      return;
    }

    // Per-API-key concurrency limit: MAX_CONCURRENT_JOBS_PER_KEY (2)
    // This ensures fairness across keys and prevents a single key from hogging the system.
    if (job.apiKeyId != null) {
      const activeJobsForKey = await getActiveJobCountForKey(job.apiKeyId);
      if (activeJobsForKey >= MAX_CONCURRENT_JOBS_PER_KEY) {
        if (logger) {
          logger.debug({ jobId, apiKeyId: job.apiKeyId }, 'Per-key concurrency limit reached, re-enqueuing');
        }
        // At per-key capacity: release global slot and retry start via re-enqueue after delay
        releaseJob(jobId);
        setTimeout(() => enqueueMonitorJobProcessing(jobId, logger), 1000);
        return;
      }
    }

    // Mark as processing
    await markJobProcessing(jobId);

    if (logger) {
      logger.debug({ jobId, pageId: job.pageId }, 'Job processing started');
    }

    // Get page URL from database
    const pageResult = await DB.query<{ url: string }>('SELECT url FROM pages WHERE id = $1', [job.pageId]);

    if (pageResult.rows.length === 0) {
      await markJobFailed(jobId, 'INTERNAL_ERROR');
      if (logger) {
        logger.error({ jobId, pageId: job.pageId }, 'Page not found for job');
      }
      return;
    }

    const url = pageResult.rows[0].url;

    // Timeout enforcement: MAX_JOB_RUNTIME_MS (15000)
    const controller = new AbortController();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        controller.abort();
        reject(new Error('JOB_TIMEOUT'));
      }, MAX_JOB_RUNTIME_MS);
    });

    try {
      // Execute the monitoring pipeline with timeout and abortion support
      const result = await Promise.race([
        executeMonitoringPipeline(job.pageId, url, controller.signal, logger),
        timeoutPromise,
      ]);

      // Store result and mark completed
      await markJobCompleted(jobId, result);

      if (logger) {
        logger.info({ jobId, status: 'COMPLETED' }, 'Job completed successfully');
      }
    } catch (pipelineError) {
      const errorType = pipelineError instanceof Error && pipelineError.message === 'JOB_TIMEOUT'
        ? 'JOB_TIMEOUT'
        : classifyError(pipelineError);

      await markJobFailed(jobId, errorType as JobErrorType);

      if (logger) {
        logger.error({ jobId, errorType, error: String(pipelineError) }, 'Job execution failed');
      }
    }
  } catch (error) {
    // Root level failure (DB, schema, etc)
    const errorType = classifyError(error);
    await markJobFailed(jobId, errorType);

    if (logger) {
      logger.error({ jobId, error: String(error) }, 'Unexpected job error');
    }
  } finally {
    // Always release the global concurrency slot
    releaseJob(jobId);

    // Kick the queue to start next jobs, if any
    scheduleDrain();
  }
}

/**
 * Execute the full monitoring pipeline for a page
 *
 * This is the core processing logic extracted from the sync flow.
 * It performs: fetch → normalize → extract → diff → risk analysis
 *
 * @param pageId - Database ID of the page
 * @param url - Canonical URL to fetch
 * @param signal - AbortSignal for timeout/cancellation
 * @param logger - Optional logger
 * @returns DiffResult with analysis
 */
async function executeMonitoringPipeline(
  pageId: number,
  url: string,
  signal: AbortSignal,
  logger?: Logger,
): Promise<DiffResult> {
  // Fetch page content (respects AbortSignal)
  const rawHtml = await fetchPage(url, signal);

  // Normalize and extract sections
  const normalizedContent = normalizeContent(rawHtml);
  const sections = extractSections(rawHtml);
  const contentHash = generateHash(normalizedContent);

  if (logger) {
    logger.debug({ pageId, contentHash, sectionCount: sections.length }, 'Content processed');
  }

  // Check if signal aborted before heavy operations
  if (signal.aborted) {
    throw new Error('JOB_TIMEOUT');
  }

  // Check for existing versions
  const versionCountResult = await DB.query<{ count: number }>(
    'SELECT COUNT(*)::int as count FROM page_versions WHERE page_id = $1',
    [pageId],
  );
  const versionCount = versionCountResult.rows[0].count;

  // Fetch latest version for comparison
  const latestVersionResult = await DB.query<{ content_hash: string; sections: Section[] }>(
    'SELECT content_hash, sections FROM page_versions WHERE page_id = $1 ORDER BY created_at DESC LIMIT 1',
    [pageId],
  );

  let diffResult: DiffResult;

  if (versionCount > 0 && latestVersionResult.rows.length > 0) {
    const latestHash = latestVersionResult.rows[0].content_hash;
    const latestSections = latestVersionResult.rows[0].sections;

    // Check if content changed
    if (latestHash === contentHash) {
      diffResult = { message: 'No meaningful change detected' };
    } else {
      // Calculate diff
      const changes = diffSections(latestSections, sections);

      if (changes.length === 0) {
        diffResult = { message: 'No meaningful change detected' };
      } else {
        // Analyze risk
        const riskAnalysis = analyzeRisk(changes, sections);

        diffResult = {
          message: 'Changes detected',
          risk_level: riskAnalysis.risk_level,
          changes: riskAnalysis.changes,
        };

        // Store new version
        await DB.query('INSERT INTO page_versions (page_id, content, content_hash, sections) VALUES ($1, $2, $3, $4)', [
          pageId,
          normalizedContent,
          contentHash,
          JSON.stringify(sections),
        ]);
      }
    }
  } else {
    // First version
    await DB.query('INSERT INTO page_versions (page_id, content, content_hash, sections) VALUES ($1, $2, $3, $4)', [
      pageId,
      normalizedContent,
      contentHash,
      JSON.stringify(sections),
    ]);

    diffResult = { message: 'First snapshot stored' };
  }

  // Update page cache
  await DB.query('UPDATE pages SET last_checked_at = NOW(), last_result = $2 WHERE id = $1', [
    pageId,
    JSON.stringify(diffResult),
  ]);

  return diffResult;
}

/**
 * Classify an error into a JobErrorType
 *
 * Maps application errors to standardized error types for API responses.
 * Does not expose internal details or stack traces.
 */
function classifyError(error: unknown): JobErrorType {
  if (error instanceof Error && (error.message === 'JOB_TIMEOUT' || error.name === 'AbortError')) {
    return 'JOB_TIMEOUT';
  }

  if (!isApiError(error)) {
    return 'INTERNAL_ERROR';
  }

  if (error instanceof InvalidUrlError) {
    return 'INVALID_URL';
  }

  if (error instanceof FetchError) {
    const cause = error.cause;
    if (cause === 'timeout') {
      return 'TIMEOUT';
    }
    if (cause === 'dns') {
      return 'DNS_FAILURE';
    }
    if (cause === 'connection') {
      return 'CONNECTION_ERROR';
    }
    return 'FETCH_ERROR';
  }

  if (error instanceof HttpError) {
    if (error.upstreamStatus === 429 || error.upstreamStatus === 403) {
      return 'PAGE_ACCESS_BLOCKED';
    }
    return 'HTTP_ERROR';
  }

  if (error instanceof UnsupportedDynamicPageError) {
    return 'UNSUPPORTED_DYNAMIC_PAGE';
  }

  if (error instanceof PageAccessBlockedError) {
    return 'PAGE_ACCESS_BLOCKED';
  }

  if (error instanceof InvalidPageContentError) {
    return 'INVALID_PAGE_CONTENT';
  }

  return 'INTERNAL_ERROR';
}

/**
 * Check if the system can accept new jobs
 * Used by controller to return 429 before creating job
 */
export function canAcceptNewJob(): boolean {
  return canAcceptNewJobs(1);
}

/**
 * Get job by ID (delegate to repository)
 */
export async function getJob(jobId: string): Promise<MonitorJob | null> {
  return getJobById(jobId);
}

/**
 * Initialize job service on server startup
 * Marks any orphaned PROCESSING jobs as FAILED
 *
 * @param logger - Logger for startup messages
 * @returns Number of orphaned jobs cleaned up
 */
export async function initializeJobService(logger?: Logger): Promise<number> {
  const orphanedCount = await runCrashRecovery();

  if (orphanedCount > 0 && logger) {
    logger.info({ orphanedCount }, 'Marked orphaned PROCESSING jobs as FAILED (CRASH_RECOVERY)');
  }

  return orphanedCount;
}
