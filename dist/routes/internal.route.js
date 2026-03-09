"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalRoutes = internalRoutes;
const metrics_repository_1 = require("../repositories/metrics.repository");
const config_1 = require("../config");
const internal_controller_1 = require("../controllers/internal.controller");
const requestAbuse_service_1 = require("../services/requestAbuse.service");
/**
 * Helper to validate internal token and log failures
 */
async function validateInternalToken(request, reply) {
    const token = request.headers['x-internal-token'];
    if (!token || token !== config_1.INTERNAL_METRICS_TOKEN) {
        request.log.warn({ request_ip: request.ip }, 'INVALID_INTERNAL_TOKEN_ATTEMPT');
        await (0, requestAbuse_service_1.recordAbuseEvent)('INVALID_INTERNAL_TOKEN_ATTEMPT', null, request.ip);
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
async function internalRoutes(fastify) {
    /**
     * GET /v1/internal/metrics
     *
     * Protected by X-Internal-Token header.
     * Returns system-wide performance and job metrics aggregated via SQL.
     */
    fastify.get('/internal/metrics', async (request, reply) => {
        if (!(await validateInternalToken(request, reply)))
            return;
        const metrics = await (0, metrics_repository_1.getInternalMetrics)();
        reply.send(metrics);
    });
    /**
     * POST /v1/internal/provision
     *
     * Protected by X-Provision-Secret header.
     * Provisions a new API key.
     */
    fastify.post('/internal/provision', internal_controller_1.provisionHandler);
    /**
     * POST /v1/internal/replay/:snapshotId
     *
     * Protected by X-Internal-Token header.
     */
    fastify.post('/internal/replay/:snapshotId', async (request, reply) => {
        if (!(await validateInternalToken(request, reply)))
            return;
        // Call the handler manually or pass it normally
        return (0, internal_controller_1.replayHandler)(request, reply);
    });
    /**
     * POST /v1/internal/snapshot
     *
     * Fetches a policy page and stores its raw HTML in replay_snapshots.
     * Protected by X-Internal-Token header.
     * Intended for pre-deployment determinism captures only.
     */
    fastify.post('/internal/snapshot', async (request, reply) => {
        if (!(await validateInternalToken(request, reply)))
            return;
        return (0, internal_controller_1.createSnapshotController)(request, reply);
    });
}
