import { FastifyInstance } from 'fastify';
import { createMonitorJobController, getJobStatusController } from '../controllers/monitor.controller';

/**
 * Monitor routes for async policy monitoring
 *
 * Endpoints:
 * - POST /monitor - Create new monitoring job
 * - GET /jobs/:jobId - Get job status and result
 */
export async function monitorRoutes(fastify: FastifyInstance) {
  // Apply API key auth to all routes in this plugin
  fastify.addHook('onRequest', fastify.apiKeyAuth);

  /**
   * POST /v1/monitor
   *
   * Create a new async monitoring job.
   * Returns immediately with job_id for polling.
   *
   * Request body: { "url": "https://example.com/privacy" }
   * Response: { "job_id": "uuid", "status": "PENDING" }
   *
   * Status codes:
   * - 202: Job created, processing started
   * - 400: Invalid request (missing URL)
   * - 429: Server at capacity
   */
  fastify.post('/monitor', createMonitorJobController);

  /**
   * GET /v1/jobs/:jobId
   *
   * Get current status of a monitoring job.
   *
   * Response varies by status:
   * - PENDING/PROCESSING: { "job_id": "...", "status": "PROCESSING" }
   * - COMPLETED: { "job_id": "...", "status": "COMPLETED", "result": {...} }
   * - FAILED: { "job_id": "...", "status": "FAILED", "error_type": "TIMEOUT" }
   *
   * Status codes:
   * - 200: Job found
   * - 400: Invalid job ID format
   * - 404: Job not found
   */
  fastify.get('/jobs/:jobId', getJobStatusController);
}
