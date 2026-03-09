"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usageRoutes = usageRoutes;
const usage_controller_1 = require("../controllers/usage.controller");
/**
 * Usage routes for API key quota visibility.
 *
 * Endpoints:
 * - GET /usage - Returns current tier, monthly quota, and usage metrics.
 */
async function usageRoutes(fastify) {
    // Apply API key auth to all routes in this plugin
    fastify.addHook('onRequest', fastify.apiKeyAuth);
    fastify.get('/usage', {
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
    }, usage_controller_1.getUsageController);
}
