import { FastifyRequest, FastifyReply } from 'fastify';
import { createMonitorJob, canAcceptNewJob, getJob } from '../services/monitorJob.service';
import {
  MonitorRequestBody,
  MonitorJobCreatedResponse,
  JobStatusResponse,
  JobPendingResponse,
  JobCompletedResponse,
  JobFailedResponse,
} from '../types';

/**
 * Route params type for job status endpoint
 */
type JobParams = {
  jobId: string;
};

/**
 * Controller for POST /v1/monitor
 *
 * Creates a new async monitoring job for the given URL.
 * Returns immediately with job_id for polling.
 *
 * Returns 429 if concurrency limit reached.
 */
export async function createMonitorJobController(
  request: FastifyRequest<{ Body: MonitorRequestBody }>,
  reply: FastifyReply,
): Promise<void> {
  const { url } = request.body || {};

  // Validate URL presence
  if (!url || typeof url !== 'string') {
    reply.code(400).send({
      error: 'BadRequest',
      message: 'URL is required',
      request_id: request.requestId,
    });
    return;
  }

  // Check concurrency limit before creating job
  if (!canAcceptNewJob()) {
    reply.code(429).send({
      error: 'TooManyRequests',
      message: 'Server is at capacity. Please retry later.',
      request_id: request.requestId,
    });
    return;
  }

  if (!request.apiKey) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'API key missing or invalid',
      request_id: request.requestId,
    });
    return;
  }

  // Create job and trigger async processing
  const job = await createMonitorJob(request.apiKey.id, url, request.log);

  const response: MonitorJobCreatedResponse = {
    job_id: job.id,
    status: job.status,
  };

  reply.code(202).send(response);
}

/**
 * Controller for GET /v1/jobs/:jobId
 *
 * Returns current status of a monitoring job.
 * - PENDING/PROCESSING: Returns status only
 * - COMPLETED: Returns status and result
 * - FAILED: Returns status and error_type
 *
 * Returns 404 if job not found.
 */
export async function getJobStatusController(
  request: FastifyRequest<{ Params: JobParams }>,
  reply: FastifyReply,
): Promise<void> {
  const { jobId } = request.params;

  // Validate UUID format (basic check)
  if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    reply.code(400).send({
      error: 'BadRequest',
      message: 'Invalid job ID format',
      request_id: request.requestId,
    });
    return;
  }

  const job = await getJob(jobId);

  if (!job) {
    reply.code(404).send({
      error: 'NotFound',
      message: 'Job not found',
      request_id: request.requestId,
    });
    return;
  }

  let response: JobStatusResponse;

  switch (job.status) {
    case 'PENDING':
    case 'PROCESSING': {
      const pendingResponse: JobPendingResponse = {
        job_id: job.id,
        status: job.status,
      };
      response = pendingResponse;
      break;
    }

    case 'COMPLETED': {
      const completedResponse: JobCompletedResponse = {
        job_id: job.id,
        status: 'COMPLETED',
        result: job.result!,
      };
      response = completedResponse;
      break;
    }

    case 'FAILED': {
      const failedResponse: JobFailedResponse = {
        job_id: job.id,
        status: 'FAILED',
        error_type: job.errorType!,
      };
      response = failedResponse;
      break;
    }
  }

  reply.send(response);
}
