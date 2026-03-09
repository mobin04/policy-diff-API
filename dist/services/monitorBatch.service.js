"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMonitorBatch = createMonitorBatch;
exports.getBatchStatus = getBatchStatus;
const db_1 = require("../db");
const canonicalizeUrl_1 = require("../utils/canonicalizeUrl");
const page_repository_1 = require("../repositories/page.repository");
const monitorJob_repository_1 = require("../repositories/monitorJob.repository");
const monitorBatch_repository_1 = require("../repositories/monitorBatch.repository");
const apiKey_repository_1 = require("../repositories/apiKey.repository");
const idempotency_repository_1 = require("../repositories/idempotency.repository");
const monitorJob_service_1 = require("./monitorJob.service");
const errors_1 = require("../errors");
const usage_service_1 = require("./usage.service");
const tierConfig_1 = require("../config/tierConfig");
/**
 * Create a new monitor batch for multiple URLs in a single transaction.
 */
async function createMonitorBatch(apiKeyId, urls, logger, idempotencyOptions) {
    if (!Array.isArray(urls) || urls.length === 0) {
        throw new errors_1.BadRequestError('urls must be a non-empty array');
    }
    // Deduplicate by canonical URL identity
    const canonicalUrls = urls.map((u) => (0, canonicalizeUrl_1.canonicalizeUrl)(u));
    const uniqueUrls = Array.from(new Set(canonicalUrls));
    // Overload protection (check before transaction)
    if (!(0, monitorJob_service_1.canAcceptNewJobs)(uniqueUrls.length)) {
        throw new errors_1.TooManyRequestsError('Server is overloaded. Please retry later.');
    }
    const client = await db_1.DB.connect();
    try {
        await client.query('BEGIN');
        // 1. Quota and Tier check (atomic within transaction)
        const usageSnapshot = await (0, usage_service_1.consumeJobsWithClient)(client, apiKeyId, uniqueUrls.length, {
            enforceBatchLimit: true,
        });
        const tierConfig = (0, tierConfig_1.getTierConfig)(usageSnapshot.tier);
        // 1.5. URL limit check
        const currentUrlCount = await (0, apiKey_repository_1.countDistinctUrlsForKey)(apiKeyId, client);
        const incomingNewUrls = [];
        // Check which of the incoming URLs are new for this key
        for (const url of uniqueUrls) {
            const pageIdResult = await client.query('SELECT id FROM pages WHERE url = $1', [url]);
            let alreadyMonitored = false;
            if (pageIdResult.rows.length > 0) {
                const jobCheck = await client.query('SELECT 1 FROM monitor_jobs WHERE api_key_id = $1 AND page_id = $2 LIMIT 1', [apiKeyId, pageIdResult.rows[0].id]);
                if (jobCheck.rows.length > 0) {
                    alreadyMonitored = true;
                }
            }
            if (!alreadyMonitored) {
                incomingNewUrls.push(url);
            }
        }
        if (currentUrlCount + incomingNewUrls.length > tierConfig.maxUrls) {
            throw new errors_1.UrlLimitExceededError();
        }
        // 2. Batch record creation
        const batch = await (0, monitorBatch_repository_1.createBatch)(apiKeyId, uniqueUrls.length, client);
        if (logger) {
            logger.info({ batchId: batch.id, totalJobs: uniqueUrls.length }, 'Monitor batch created');
        }
        const jobs = [];
        const jobIds = [];
        // 3. Sequential job creation within transaction
        for (const url of uniqueUrls) {
            const pageId = await (0, page_repository_1.ensurePageExists)(url, client);
            const job = await (0, monitorJob_repository_1.createJob)(pageId, apiKeyId, batch.id, client);
            jobs.push({ url, job_id: job.id, status: 'PENDING' });
            jobIds.push(job.id);
        }
        const response = {
            batch_id: batch.id,
            total_jobs: uniqueUrls.length,
            jobs,
        };
        // 4. Idempotency storage (atomic with batch/job creation)
        if (idempotencyOptions) {
            await (0, idempotency_repository_1.saveIdempotencyRecord)(apiKeyId, idempotencyOptions.key, idempotencyOptions.requestHash, response, client);
        }
        await client.query('COMMIT');
        // Trigger async processing for all jobs (after commit)
        for (const jobId of jobIds) {
            (0, monitorJob_service_1.enqueueMonitorJobProcessing)(jobId, logger);
        }
        return response;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
async function getBatchStatus(batchId, apiKeyId) {
    const batch = await (0, monitorBatch_repository_1.getBatchByIdForApiKey)(batchId, apiKeyId);
    if (!batch)
        return null;
    const counts = await (0, monitorBatch_repository_1.getBatchJobCounts)(batchId);
    const jobs = await (0, monitorBatch_repository_1.listBatchJobs)(batchId);
    return {
        batch_id: batch.id,
        total: batch.totalJobs,
        completed: counts.completed,
        processing: counts.processing,
        failed: counts.failed,
        jobs: jobs.map((j) => ({ url: j.url, job_id: j.jobId, status: j.status })),
    };
}
