"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMonitorJobController = createMonitorJobController;
exports.getJobStatusController = getJobStatusController;
const monitorJob_service_1 = require("../services/monitorJob.service");
const idempotency_service_1 = require("../services/idempotency.service");
const requestAbuse_service_1 = require("../services/requestAbuse.service");
const hash_1 = require("../utils/hash");
const errors_1 = require("../errors");
/**
 * Controller for POST /v1/monitor
 *
 * Creates a new async monitoring job for the given URL.
 * Returns immediately with job_id for polling.
 *
 * Returns 429 if concurrency limit reached.
 */
async function createMonitorJobController(request, reply) {
    const { url } = request.body || {};
    const idempotencyKey = request.headers['idempotency-key'];
    // Validate URL presence
    if (!url || typeof url !== 'string') {
        reply.code(400).send({
            error: 'BadRequest',
            message: 'URL is required',
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
    try {
        // Check idempotency first
        const cachedResponse = await (0, idempotency_service_1.checkIdempotency)(request.apiKey.id, idempotencyKey, request.body, request.log);
        if (cachedResponse) {
            reply.code(202).send(cachedResponse);
            return;
        }
        // Check concurrency limit before creating job
        if (!(0, monitorJob_service_1.canAcceptNewJob)()) {
            reply.code(429).send({
                error: 'TooManyRequests',
                message: 'Server is at capacity. Please retry later.',
                request_id: request.requestId,
            });
            return;
        }
        // Create job and trigger async processing (handles idempotency storage in transaction if key provided)
        const requestHash = idempotencyKey ? (0, hash_1.generateHash)(JSON.stringify(request.body)) : undefined;
        const idempotencyOptions = idempotencyKey && requestHash ? { key: idempotencyKey, requestHash } : undefined;
        const job = await (0, monitorJob_service_1.createMonitorJob)(request.apiKey.id, url, request.log, idempotencyOptions);
        const response = {
            job_id: job.id,
            status: job.status,
        };
        reply.code(202).send(response);
    }
    catch (error) {
        if (error instanceof errors_1.ConflictError) {
            reply.code(409).send({
                error: 'Conflict',
                message: error.message,
                request_id: request.requestId,
            });
        }
        else {
            throw error;
        }
    }
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
async function getJobStatusController(request, reply) {
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
    const job = await (0, monitorJob_service_1.getJob)(jobId);
    // STEP 3: Job Polling Instrumentation
    await (0, requestAbuse_service_1.recordAbuseEvent)('JOB_POLLING', request.apiKey?.id, request.ip, { job_id: jobId });
    if (request.apiKey) {
        const highFrequency = (0, requestAbuse_service_1.trackJobPolling)(request.apiKey.id, jobId);
        if (highFrequency) {
            request.log.warn({ api_key_id: request.apiKey.id, job_id: jobId }, 'HIGH_FREQUENCY_JOB_POLLING');
            await (0, requestAbuse_service_1.recordAbuseEvent)('HIGH_FREQUENCY_JOB_POLLING', request.apiKey.id, request.ip, { job_id: jobId });
        }
    }
    if (!job) {
        reply.code(404).send({
            error: 'NotFound',
            message: 'Job not found',
            request_id: request.requestId,
        });
        return;
    }
    let response;
    switch (job.status) {
        case 'PENDING':
        case 'PROCESSING': {
            const pendingResponse = {
                url: job.url || '',
                job_id: job.id,
                status: job.status,
            };
            response = pendingResponse;
            break;
        }
        case 'COMPLETED': {
            const completedResponse = {
                url: job.url || '',
                job_id: job.id,
                status: 'COMPLETED',
                result: job.result,
            };
            response = completedResponse;
            break;
        }
        case 'FAILED': {
            const failedResponse = {
                url: job.url || '',
                job_id: job.id,
                status: 'FAILED',
                error_type: job.errorType,
            };
            response = failedResponse;
            break;
        }
    }
    reply.send(response);
}
