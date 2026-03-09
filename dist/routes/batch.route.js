"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchRoutes = batchRoutes;
const batch_controller_1 = require("../controllers/batch.controller");
/**
 * Batch routes for aggregated async monitoring status
 *
 * Endpoints:
 * - GET /batches/:batchId - Get batch status and aggregated job counts
 */
async function batchRoutes(fastify) {
    // Apply API key auth to all routes in this plugin
    fastify.addHook('onRequest', fastify.apiKeyAuth);
    fastify.get('/batches/:batchId', {
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
    }, batch_controller_1.getBatchStatusController);
}
