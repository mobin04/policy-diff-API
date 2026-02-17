import { canonicalizeUrl } from '../utils/canonicalizeUrl';
import { ensurePageExists } from '../repositories/page.repository';
import { createJob } from '../repositories/monitorJob.repository';
import {
  createBatch,
  getBatchByIdForApiKey,
  getBatchJobCounts,
  listBatchJobs,
} from '../repositories/monitorBatch.repository';
import { canAcceptNewJobs, enqueueMonitorJobProcessing } from './monitorJob.service';
import { BatchStatusResponse, MonitorBatchCreatedResponse } from '../types';
import { BadRequestError, TooManyRequestsError } from '../errors';
import { consumeJobs } from './usage.service';

type Logger = {
  debug: (obj: object, msg: string) => void;
  info: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
};

export async function createMonitorBatch(
  apiKeyId: number,
  urls: string[],
  logger?: Logger,
): Promise<MonitorBatchCreatedResponse> {
  if (!Array.isArray(urls) || urls.length === 0) {
    // Let Fastify schema handle most cases, but keep service defensive
    throw new BadRequestError('urls must be a non-empty array');
  }

  // Canonicalize (validates) then deduplicate by canonical URL identity
  const canonicalUrls = urls.map((u) => canonicalizeUrl(u));
  const uniqueUrls = Array.from(new Set(canonicalUrls));

  // Tier-based quota and batch-size enforcement (all-or-nothing)
  await consumeJobs(apiKeyId, uniqueUrls.length, { enforceBatchLimit: true });

  // Overload protection: allow queuing, but reject unbounded growth
  if (!canAcceptNewJobs(uniqueUrls.length)) {
    throw new TooManyRequestsError('Server is overloaded. Please retry later.');
  }

  // Batch size is based on request size; uniqueUrls can be <= urls length
  const batch = await createBatch(apiKeyId, uniqueUrls.length);

  if (logger) {
    logger.info({ batchId: batch.id, totalJobs: uniqueUrls.length }, 'Monitor batch created');
  }

  const jobs: MonitorBatchCreatedResponse['jobs'] = [];

  for (const url of uniqueUrls) {
    const pageId = await ensurePageExists(url);
    const job = await createJob(pageId, batch.id);
    jobs.push({ url, job_id: job.id, status: 'PENDING' });

    // Trigger async processing (queued if at capacity)
    enqueueMonitorJobProcessing(job.id, logger);
  }

  return {
    batch_id: batch.id,
    total_jobs: uniqueUrls.length,
    jobs,
  };
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
    jobs: jobs.map((j) => ({ job_id: j.jobId, status: j.status })),
  };
}
