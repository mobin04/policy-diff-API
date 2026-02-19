import { FastifyInstance } from 'fastify';
import { checkDatabaseConnection } from '../repositories/apiLog.repository';
import { areMigrationsPending } from '../db';

/**
 * Health and Readiness Endpoints
 * 
 * /health: Liveness probe for process monitoring.
 * /ready: Readiness probe for deployment orchestration (K8s/ALB).
 */

// Simple flag to track if initialization is complete
let isInitialized = false;

export function markAsInitialized() {
  isInitialized = true;
}

export async function healthRoutes(app: FastifyInstance) {
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
    const dbReady = await checkDatabaseConnection();
    if (!dbReady) {
      reply.code(503);
      return { status: 'not_ready', reason: 'database unavailable' };
    }

    // 3. Check for pending migrations
    try {
      const pending = await areMigrationsPending();
      if (pending) {
        reply.code(503);
        return { status: 'not_ready', reason: 'migrations pending' };
      }
    } catch (err) {
      reply.code(503);
      return { status: 'not_ready', reason: 'error checking migrations' };
    }

    return { status: 'ready' };
  });
}
