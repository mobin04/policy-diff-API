import { DB } from '../db';
import { canonicalizeUrl } from '../utils/canonicalizeUrl';
import { ensurePageExists } from '../repositories/page.repository';
import { createJob } from '../repositories/monitorJob.repository';
import {
  createBatch,
  getBatchByIdForApiKey,
  getBatchJobCounts,
  listBatchJobs,
} from '../repositories/monitorBatch.repository';
import { countDistinctUrlsForKey } from '../repositories/apiKey.repository';
import { saveIdempotencyRecord } from '../repositories/idempotency.repository';
import { canAcceptNewJobs, enqueueMonitorJobProcessing } from './monitorJob.service';
import { BatchStatusResponse, MonitorBatchCreatedResponse } from '../types';
import {
  BadRequestError,
  TooManyRequestsError,
  QuotaExceededError,
  BatchLimitExceededError,
  UrlLimitExceededError,
} from '../errors';
import { loadUsageRowForUpdate, consumeJobsWithClient } from './usage.service';
import { getTierConfig } from '../config/tierConfig';

type Logger = {
  debug: (obj: object, msg: string) => void;
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
};

/**
 * Create a new monitor batch for multiple URLs in a single transaction.
 */
export async function createMonitorBatch(
  apiKeyId: number,
  urls: string[],
  logger?: Logger,
  idempotencyOptions?: { key: string; requestHash: string },
): Promise<MonitorBatchCreatedResponse> {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new BadRequestError('urls must be a non-empty array');
  }

  // Deduplicate by canonical URL identity
  const canonicalUrls = urls.map((u) => canonicalizeUrl(u));
  const uniqueUrls = Array.from(new Set(canonicalUrls));

  // Overload protection (check before transaction)
  if (!canAcceptNewJobs(uniqueUrls.length)) {
    throw new TooManyRequestsError('Server is overloaded. Please retry later.');
  }

  const client = await DB.connect();
  try {
    await client.query('BEGIN');

    // 1. Quota and Tier check (atomic within transaction)
    const usageSnapshot = await consumeJobsWithClient(client, apiKeyId, uniqueUrls.length, {
      enforceBatchLimit: true,
    });
    const tierConfig = getTierConfig(usageSnapshot.tier);

    // 1.5. URL limit check
    const currentUrlCount = await countDistinctUrlsForKey(apiKeyId, client);
    const incomingNewUrls: string[] = [];

    // Check which of the incoming URLs are new for this key
    for (const url of uniqueUrls) {
      const pageIdResult = await client.query<{ id: number }>(
        'SELECT id FROM pages WHERE url = $1',
        [url]
      );
      
      let alreadyMonitored = false;
      if (pageIdResult.rows.length > 0) {
        const jobCheck = await client.query(
          'SELECT 1 FROM monitor_jobs WHERE api_key_id = $1 AND page_id = $2 LIMIT 1',
          [apiKeyId, pageIdResult.rows[0].id]
        );
        if (jobCheck.rows.length > 0) {
          alreadyMonitored = true;
        }
      }

      if (!alreadyMonitored) {
        incomingNewUrls.push(url);
      }
    }

    if (currentUrlCount + incomingNewUrls.length > tierConfig.maxUrls) {
      throw new UrlLimitExceededError();
    }

    // 2. Batch record creation
    const batch = await createBatch(apiKeyId, uniqueUrls.length, client);

    if (logger) {
      logger.info({ batchId: batch.id, totalJobs: uniqueUrls.length }, 'Monitor batch created');
    }

    const jobs: MonitorBatchCreatedResponse['jobs'] = [];
    const jobIds: string[] = [];

    // 3. Sequential job creation within transaction
    for (const url of uniqueUrls) {
      const pageId = await ensurePageExists(url, client);
      const job = await createJob(pageId, apiKeyId, batch.id, client);
      jobs.push({ url, job_id: job.id, status: 'PENDING' });
      jobIds.push(job.id);
    }

    const response: MonitorBatchCreatedResponse = {
      batch_id: batch.id,
      total_jobs: uniqueUrls.length,
      jobs,
    };

    // 4. Idempotency storage (atomic with batch/job creation)
    if (idempotencyOptions) {
      await saveIdempotencyRecord(
        apiKeyId,
        idempotencyOptions.key,
        idempotencyOptions.requestHash,
        response as unknown as Record<string, unknown>,
        client,
      );
    }

    await client.query('COMMIT');

    // Trigger async processing for all jobs (after commit)
    for (const jobId of jobIds) {
      enqueueMonitorJobProcessing(jobId, logger);
    }

    return response;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getBatchStatus(batchId: string, apiKeyId: number): Promise<BatchStatusResponse | null> {
  const batch = await getBatchByIdForApiKey(batchId, apiKeyId);
  if (!batch) return null;

  const counts = await getBatchJobCounts(batchId);
  const jobs = await listBatchJobs(batchId);

  return {
    batch_id: batch.id,
    total: batch.totalJobs,
    completed: counts.completed,
    processing: counts.processing,
    failed: counts.failed,
    jobs: jobs.map((j) => ({ url: j.url, job_id: j.jobId, status: j.status })),
  };
}
