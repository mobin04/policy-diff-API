"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAsInitialized = markAsInitialized;
exports.healthRoutes = healthRoutes;
const apiLog_repository_1 = require("../repositories/apiLog.repository");
const db_1 = require("../db");
/**
 * Health and Readiness Endpoints
 *
 * /health: Liveness probe for process monitoring.
 * /ready: Readiness probe for deployment orchestration (K8s/ALB).
 */
// Simple flag to track if initialization is complete
let isInitialized = false;
function markAsInitialized() {
    isInitialized = true;
}
async function healthRoutes(app) {
    /**
     * Liveness probe - always returns OK if server is running.
     */
    app.get('/health', async () => {
        return { status: 'ok' };
    });
    /**
     * Readiness probe - verifies dependencies and state.
     */
    app.get('/ready', async (_request, reply) => {
        // 1. Check if server-side recovery/init logic finished
        if (!isInitialized) {
            reply.code(503);
            return { status: 'not_ready', reason: 'initializing recovery service' };
        }
        // 2. Check Database connectivity
        const dbReady = await (0, apiLog_repository_1.checkDatabaseConnection)();
        if (!dbReady) {
            reply.code(503);
            return { status: 'not_ready', reason: 'database unavailable' };
        }
        // 3. Check for pending migrations
        try {
            const pending = await (0, db_1.areMigrationsPending)();
            if (pending) {
                reply.code(503);
                return { status: 'not_ready', reason: 'migrations pending' };
            }
        }
        catch (err) {
            reply.code(503);
            return { status: 'not_ready', reason: 'error checking migrations' };
        }
        return { status: 'ready' };
    });
}
