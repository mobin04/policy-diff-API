import { FastifyInstance } from 'fastify';
import { getUsageController } from '../controllers/usage.controller';

/**
 * Usage routes for API key quota visibility.
 *
 * Endpoints:
 * - GET /usage - Returns current tier, monthly quota, and usage metrics.
 */
export async function usageRoutes(fastify: FastifyInstance) {
  // Apply API key auth to all routes in this plugin
  fastify.addHook('onRequest', fastify.apiKeyAuth);

  fastify.get(
    '/usage',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              tier: { type: 'string' },
              monthly_quota: { type: 'number' },
              monthly_usage: { type: 'number' },
              remaining: { type: 'number' },
              quota_reset_at: { type: 'string', format: 'date-time' },
            },
            required: ['tier', 'monthly_quota', 'monthly_usage', 'remaining', 'quota_reset_at'],
          },
        },
      },
    },
    getUsageController,
  );
}
