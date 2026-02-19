import { FastifyInstance } from 'fastify';
import { getBatchStatusController } from '../controllers/batch.controller';

/**
 * Batch routes for aggregated async monitoring status
 *
 * Endpoints:
 * - GET /batches/:batchId - Get batch status and aggregated job counts
 */
export async function batchRoutes(fastify: FastifyInstance) {
  // Apply API key auth to all routes in this plugin
  fastify.addHook('onRequest', fastify.apiKeyAuth);

  fastify.get(
    '/batches/:batchId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['batchId'],
          additionalProperties: false,
          properties: {
            batchId: {
              type: 'string',
              pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
            },
          },
        },
      },
    },
    getBatchStatusController,
  );
}
