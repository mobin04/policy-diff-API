"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueMonitorJobProcessing = enqueueMonitorJobProcessing;
exports.canAcceptNewJobs = canAcceptNewJobs;
exports.createMonitorJob = createMonitorJob;
exports.processMonitorJob = processMonitorJob;
exports.canAcceptNewJob = canAcceptNewJob;
exports.getJob = getJob;
exports.initializeJobService = initializeJobService;
const db_1 = require("../db");
const fetchPage_1 = require("../utils/fetchPage");
const normalizer_service_1 = require("./normalizer.service");
const sectionExtractor_service_1 = require("./sectionExtractor.service");
const mainContentExtractor_1 = require("../utils/mainContentExtractor");
const hash_1 = require("../utils/hash");
const canonicalizeUrl_1 = require("../utils/canonicalizeUrl");
const differ_service_1 = require("./differ.service");
const riskEngine_service_1 = require("./riskEngine.service");
const isolationStability_service_1 = require("./isolationStability.service");
const concurrencyGuard_1 = require("../utils/concurrencyGuard");
const page_repository_1 = require("../repositories/page.repository");
const monitorJob_repository_1 = require("../repositories/monitorJob.repository");
const idempotency_repository_1 = require("../repositories/idempotency.repository");
const apiKey_repository_1 = require("../repositories/apiKey.repository");
const tierConfig_1 = require("../config/tierConfig");
const errors_1 = require("../errors");
const usage_service_1 = require("./usage.service");
const startupRecoveryService_1 = require("./startupRecoveryService");
const MAX_JOB_RUNTIME_MS = 15000;
/**
 * In-memory FIFO queue for jobs waiting on concurrency slots.
 *
 * This keeps the system single-instance and deterministic:
 * - Jobs are created in DB immediately (PENDING)
 * - Processing starts when a concurrency slot becomes available
 * - No Redis / message queue / cron is introduced
 */
const pendingQueue = [];
const queuedJobIds = new Set();
let drainScheduled = false;
/**
 * Maximum number of queued jobs allowed in memory.
 * When exceeded, the system rejects new job submissions with 429.
 */
const MAX_QUEUED_JOBS = 1000;
function scheduleDrain() {
    if (drainScheduled)
        return;
    drainScheduled = true;
    setImmediate(() => {
        drainScheduled = false;
        // Start as many jobs as we have capacity for
        while (pendingQueue.length > 0 && (0, concurrencyGuard_1.canAcquireJob)()) {
            const next = pendingQueue.shift();
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
function enqueueMonitorJobProcessing(jobId, logger) {
    if (queuedJobIds.has(jobId))
        return;
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
function canAcceptNewJobs(jobCount = 1) {
    const inFlight = (0, concurrencyGuard_1.getActiveJobCount)();
    const queued = pendingQueue.length;
    const capacity = (0, concurrencyGuard_1.getMaxConcurrentJobs)() + MAX_QUEUED_JOBS;
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
async function createMonitorJob(apiKeyId, rawUrl, logger, idempotencyOptions) {
    const canonicalUrl = (0, canonicalizeUrl_1.canonicalizeUrl)(rawUrl);
    if (logger) {
        logger.debug({ apiKeyId, rawUrl, canonicalUrl }, 'Creating monitor job');
    }
    const client = await db_1.DB.connect();
    try {
        await client.query('BEGIN');
        // 1. Quota consumption (atomic within transaction)
        const usageSnapshot = await (0, usage_service_1.consumeJobsWithClient)(client, apiKeyId, 1);
        const tierConfig = (0, tierConfig_1.getTierConfig)(usageSnapshot.tier);
        // URL limit check
        const currentUrlCount = await (0, apiKey_repository_1.countDistinctUrlsForKey)(apiKeyId, client);
        if (currentUrlCount >= tierConfig.maxUrls) {
            // Need to check if THIS specific URL is already monitored
            const pageIdResult = await client.query('SELECT id FROM pages WHERE url = $1', [canonicalUrl]);
            let alreadyMonitored = false;
            if (pageIdResult.rows.length > 0) {
                const jobCheck = await client.query('SELECT 1 FROM monitor_jobs WHERE api_key_id = $1 AND page_id = $2 LIMIT 1', [apiKeyId, pageIdResult.rows[0].id]);
                if (jobCheck.rows.length > 0) {
                    alreadyMonitored = true;
                }
            }
            if (!alreadyMonitored) {
                throw new errors_1.UrlLimitExceededError();
            }
        }
        // 2. Ensure page exists (upsert)
        const pageId = await (0, page_repository_1.ensurePageExists)(canonicalUrl, client);
        // 3. Create job with PENDING status
        const job = await (0, monitorJob_repository_1.createJob)(pageId, apiKeyId, null, client);
        // 4. Store idempotency record if requested (atomic with job creation)
        if (idempotencyOptions) {
            const responseBody = {
                job_id: job.id,
                status: job.status,
            };
            await (0, idempotency_repository_1.saveIdempotencyRecord)(apiKeyId, idempotencyOptions.key, idempotencyOptions.requestHash, responseBody, client);
        }
        await client.query('COMMIT');
        if (logger) {
            logger.info({ jobId: job.id, pageId, canonicalUrl }, 'Monitor job created');
        }
        // Schedule async processing
        enqueueMonitorJobProcessing(job.id, logger);
        return job;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
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
async function processMonitorJob(jobId, logger) {
    // Try to acquire global concurrency slot
    if (!(0, concurrencyGuard_1.acquireJob)(jobId)) {
        // At global capacity: keep job PENDING and queue for later processing
        enqueueMonitorJobProcessing(jobId, logger);
        return;
    }
    try {
        // Get job details
        const job = await (0, monitorJob_repository_1.getJobById)(jobId);
        if (!job) {
            if (logger) {
                logger.error({ jobId }, 'Job not found');
            }
            (0, concurrencyGuard_1.releaseJob)(jobId);
            return;
        }
        // Per-API-key concurrency limit based on tier
        // This ensures fairness across keys and prevents a single key from hogging the system.
        if (job.apiKeyId != null) {
            const usage = await (0, usage_service_1.loadUsageRowForUpdate)(db_1.DB, job.apiKeyId); // Use default pool
            const tierConfig = (0, tierConfig_1.getTierConfig)(usage.tier);
            const activeJobsForKey = await (0, monitorJob_repository_1.getActiveJobCountForKey)(job.apiKeyId);
            if (activeJobsForKey >= tierConfig.maxConcurrentJobs) {
                if (logger) {
                    logger.debug({ jobId, apiKeyId: job.apiKeyId, tier: usage.tier }, 'Per-key concurrency limit reached, re-enqueuing');
                }
                // At per-key capacity: release global slot and retry start via re-enqueue after delay
                (0, concurrencyGuard_1.releaseJob)(jobId);
                setTimeout(() => enqueueMonitorJobProcessing(jobId, logger), 1000);
                return;
            }
        }
        // Mark as processing
        const updatedJob = await (0, monitorJob_repository_1.markJobProcessing)(jobId);
        if (!updatedJob || !updatedJob.url) {
            await (0, monitorJob_repository_1.markJobFailed)(jobId, 'INTERNAL_ERROR');
            if (logger) {
                logger.error({ jobId }, 'Failed to mark job as processing or URL missing');
            }
            return;
        }
        if (logger) {
            logger.debug({ jobId, pageId: updatedJob.pageId, url: updatedJob.url }, 'Job processing started');
        }
        const { url } = updatedJob;
        const previousFingerprintResult = await db_1.DB.query('SELECT isolation_fingerprint FROM pages WHERE id = $1', [updatedJob.pageId]);
        const previousFingerprint = previousFingerprintResult.rows[0]?.isolation_fingerprint ?? null;
        // Timeout enforcement: MAX_JOB_RUNTIME_MS (15000)
        const controller = new AbortController();
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                controller.abort();
                reject(new Error('JOB_TIMEOUT'));
            }, MAX_JOB_RUNTIME_MS);
        });
        try {
            // Execute the monitoring pipeline with timeout and abortion support
            const result = await Promise.race([
                executeMonitoringPipeline(job.pageId, url, previousFingerprint, controller.signal, logger),
                timeoutPromise,
            ]);
            // Store result and mark completed
            await (0, monitorJob_repository_1.markJobCompleted)(jobId, result);
            if (logger) {
                logger.info({ jobId, status: 'COMPLETED' }, 'Job completed successfully');
            }
        }
        catch (pipelineError) {
            const errorType = pipelineError instanceof Error && pipelineError.message === 'JOB_TIMEOUT'
                ? 'JOB_TIMEOUT'
                : classifyError(pipelineError);
            await (0, monitorJob_repository_1.markJobFailed)(jobId, errorType);
            if (logger) {
                logger.error({ jobId, errorType, error: String(pipelineError) }, 'Job execution failed');
            }
        }
    }
    catch (error) {
        // Root level failure (DB, schema, etc)
        const errorType = classifyError(error);
        await (0, monitorJob_repository_1.markJobFailed)(jobId, errorType);
        if (logger) {
            logger.error({ jobId, error: String(error) }, 'Unexpected job error');
        }
    }
    finally {
        // Always release the global concurrency slot
        (0, concurrencyGuard_1.releaseJob)(jobId);
        // Kick the queue to start next jobs, if any
        scheduleDrain();
    }
}
/**
 * Execute the full monitoring pipeline for a page
 *
 * This is the core processing logic extracted from the sync flow.
 * It performs: fetch → normalize → isolate → extract → diff → risk analysis
 *
 * @param pageId - Database ID of the page
 * @param url - Canonical URL to fetch
 * @param previousFingerprint - Isolation fingerprint from previous run
 * @param signal - AbortSignal for timeout/cancellation
 * @param logger - Optional logger
 * @returns DiffResult with analysis
 */
async function executeMonitoringPipeline(pageId, url, previousFingerprint, signal, logger) {
    // Fetch page content (respects AbortSignal)
    const rawHtml = await (0, fetchPage_1.fetchPage)(url, signal);
    // Structural Normalization Layer
    const cleanedHtml = (0, normalizer_service_1.normalizeHtml)(rawHtml);
    // Content Isolation Layer
    const isolationResult = (0, mainContentExtractor_1.extractMainContent)(cleanedHtml);
    const isolatedHtml = isolationResult.content;
    const isolationStatus = isolationResult.usedFallback ? 'fallback' : 'success';
    const driftDetected = (0, isolationStability_service_1.detectIsolationDrift)(previousFingerprint, isolationResult.fingerprint);
    if (driftDetected && logger) {
        logger.warn({
            previous_fingerprint: previousFingerprint,
            current_fingerprint: isolationResult.fingerprint,
            canonical_url: url,
        }, 'ISOLATION_CONTAINER_DRIFT_DETECTED');
    }
    // Normalize and extract sections
    const normalizedContent = (0, normalizer_service_1.normalizeContent)(isolatedHtml);
    const sections = (0, sectionExtractor_service_1.extractSections)(isolatedHtml);
    const contentHash = (0, hash_1.generateHash)(normalizedContent);
    if (logger) {
        logger.debug({ pageId, contentHash, sectionCount: sections.length, isolationStatus, driftDetected }, 'Content processed');
    }
    // Check if signal aborted before heavy operations
    if (signal.aborted) {
        throw new Error('JOB_TIMEOUT');
    }
    // Check for existing versions
    const versionCountResult = await db_1.DB.query('SELECT COUNT(*)::int as count FROM page_versions WHERE page_id = $1', [pageId]);
    const versionCount = versionCountResult.rows[0].count;
    // Fetch latest version for comparison
    const latestVersionResult = await db_1.DB.query('SELECT content_hash, sections FROM page_versions WHERE page_id = $1 ORDER BY created_at DESC LIMIT 1', [pageId]);
    let diffResult;
    if (versionCount > 0 && latestVersionResult.rows.length > 0) {
        const latestHash = latestVersionResult.rows[0].content_hash;
        const latestSections = latestVersionResult.rows[0].sections;
        // Check if content changed
        if (latestHash === contentHash) {
            diffResult = {
                message: 'No meaningful change detected',
                content_isolation: isolationStatus,
                isolation_drift: driftDetected,
            };
        }
        else {
            // Calculate diff
            const changes = (0, differ_service_1.diffSections)(latestSections, sections, { url, logger });
            const metadata = changes;
            if (changes.length === 0) {
                diffResult = {
                    message: 'No meaningful change detected',
                    content_isolation: isolationStatus,
                    isolation_drift: driftDetected,
                    numeric_override_triggered: metadata.numeric_override_triggered,
                    fuzzy_match_count: metadata.fuzzy_match_count,
                    low_confidence_fuzzy_match_count: metadata.low_confidence_fuzzy_match_count,
                    fuzzy_collision_count: metadata.fuzzy_collision_count,
                    title_rename_count: metadata.title_rename_count,
                };
            }
            else {
                // Analyze risk
                const riskAnalysis = (0, riskEngine_service_1.analyzeRisk)(changes, sections, latestSections);
                diffResult = {
                    message: 'Changes detected',
                    risk_level: riskAnalysis.risk_level,
                    changes: riskAnalysis.changes,
                    content_isolation: isolationStatus,
                    isolation_drift: driftDetected,
                    numeric_override_triggered: metadata.numeric_override_triggered,
                    fuzzy_match_count: metadata.fuzzy_match_count,
                    low_confidence_fuzzy_match_count: metadata.low_confidence_fuzzy_match_count,
                    fuzzy_collision_count: metadata.fuzzy_collision_count,
                    title_rename_count: metadata.title_rename_count,
                };
                // Store new version
                await db_1.DB.query('INSERT INTO page_versions (page_id, content, content_hash, sections) VALUES ($1, $2, $3, $4)', [
                    pageId,
                    normalizedContent,
                    contentHash,
                    JSON.stringify(sections),
                ]);
            }
        }
    }
    else {
        // First version
        await db_1.DB.query('INSERT INTO page_versions (page_id, content, content_hash, sections) VALUES ($1, $2, $3, $4)', [
            pageId,
            normalizedContent,
            contentHash,
            JSON.stringify(sections),
        ]);
        diffResult = {
            message: 'First snapshot stored',
            content_isolation: isolationStatus,
            isolation_drift: driftDetected,
        };
    }
    // Update page cache and fingerprint
    await db_1.DB.query('UPDATE pages SET last_checked_at = NOW(), last_result = $2, isolation_fingerprint = $3 WHERE id = $1', [pageId, JSON.stringify(diffResult), isolationResult.fingerprint]);
    return diffResult;
}
/**
 * Classify an error into a JobErrorType
 *
 * Maps application errors to standardized error types for API responses.
 * Does not expose internal details or stack traces.
 */
function classifyError(error) {
    if (error instanceof Error && (error.message === 'JOB_TIMEOUT' || error.name === 'AbortError')) {
        return 'JOB_TIMEOUT';
    }
    if (!(0, errors_1.isApiError)(error)) {
        return 'INTERNAL_ERROR';
    }
    if (error instanceof errors_1.InvalidUrlError) {
        return 'INVALID_URL';
    }
    if (error instanceof errors_1.FetchError) {
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
    if (error instanceof errors_1.HttpError) {
        if (error.upstreamStatus === 429 || error.upstreamStatus === 403) {
            return 'PAGE_ACCESS_BLOCKED';
        }
        return 'HTTP_ERROR';
    }
    if (error instanceof errors_1.UnsupportedDynamicPageError) {
        return 'UNSUPPORTED_DYNAMIC_PAGE';
    }
    if (error instanceof errors_1.PageAccessBlockedError) {
        return 'PAGE_ACCESS_BLOCKED';
    }
    if (error instanceof errors_1.InvalidPageContentError) {
        return 'INVALID_PAGE_CONTENT';
    }
    return 'INTERNAL_ERROR';
}
/**
 * Check if the system can accept new jobs
 * Used by controller to return 429 before creating job
 */
function canAcceptNewJob() {
    return canAcceptNewJobs(1);
}
/**
 * Get job by ID (delegate to repository)
 */
async function getJob(jobId) {
    return (0, monitorJob_repository_1.getJobById)(jobId);
}
/**
 * Initialize job service on server startup
 * Marks any orphaned PROCESSING jobs as FAILED
 *
 * @param logger - Logger for startup messages
 * @returns Number of orphaned jobs cleaned up
 */
async function initializeJobService(logger) {
    const orphanedCount = await (0, startupRecoveryService_1.runCrashRecovery)();
    if (orphanedCount > 0 && logger) {
        logger.info({ orphanedCount }, 'Marked orphaned PROCESSING jobs as FAILED (CRASH_RECOVERY)');
    }
    return orphanedCount;
}
