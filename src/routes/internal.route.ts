import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getInternalMetrics } from '../repositories/metrics.repository';
import { INTERNAL_METRICS_TOKEN } from '../config';
import {
  provisionHandler,
  regenerateKeyHandler,
  replayHandler,
  createSnapshotController,
} from '../controllers/internal.controller';
import { recordAbuseEvent } from '../services/requestAbuse.service';

/**
 * Helper to validate internal token and log failures
 */
async function validateInternalToken(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const token = request.headers['x-internal-token'];

  if (!token || token !== INTERNAL_METRICS_TOKEN) {
    request.log.warn({ request_ip: request.ip }, 'INVALID_INTERNAL_TOKEN_ATTEMPT');
    await recordAbuseEvent('INVALID_INTERNAL_TOKEN_ATTEMPT', null, request.ip);

    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or missing internal token',
    });
    return false;
  }
  return true;
}

/**
 * Internal routes for metrics and system observability
 */
export async function internalRoutes(fastify: FastifyInstance) {
  /**
   * GET /v1/internal/metrics
   *
   * Protected by X-Internal-Token header.
   * Returns system-wide performance and job metrics aggregated via SQL.
   */
  fastify.get('/internal/metrics', async (request, reply) => {
    if (!(await validateInternalToken(request, reply))) return;

    const metrics = await getInternalMetrics();
    reply.send(metrics);
  });

  /**
   * POST /v1/internal/provision
   *
   * Protected by X-Provision-Secret header.
   * Provisions a new API key.
   */
  fastify.post('/internal/provision', provisionHandler);

  /**
   * POST /v1/internal/regenerate-key
   *
   * Protected by X-Provision-Secret header.
   * Regenerates an existing API key.
   */
  fastify.post('/internal/regenerate-key', regenerateKeyHandler);

  /**
   * POST /v1/internal/replay/:snapshotId
   *
   * Protected by X-Internal-Token header.
   */
  fastify.post('/internal/replay/:snapshotId', async (request, reply) => {
    if (!(await validateInternalToken(request, reply))) return;

    // Call the handler manually or pass it normally
    return replayHandler(request as Parameters<typeof replayHandler>[0], reply);
  });

  /**
   * POST /v1/internal/snapshot
   *
   * Fetches a policy page and stores its raw HTML in replay_snapshots.
   * Protected by X-Internal-Token header.
   * Intended for pre-deployment determinism captures only.
   */
  fastify.post('/internal/snapshot', async (request, reply) => {
    if (!(await validateInternalToken(request, reply))) return;

    return createSnapshotController(request as Parameters<typeof createSnapshotController>[0], reply);
  });
}
