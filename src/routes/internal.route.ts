import { FastifyInstance } from 'fastify';
import { getInternalMetrics } from '../repositories/metrics.repository';
import { INTERNAL_METRICS_TOKEN } from '../config';
import { provisionHandler } from '../controllers/internal.controller';

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
    const token = request.headers['x-internal-token'];

    if (!token || token !== INTERNAL_METRICS_TOKEN) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or missing internal token',
      });
      return;
    }

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
}
