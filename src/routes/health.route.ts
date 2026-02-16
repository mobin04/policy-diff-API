import { FastifyInstance } from 'fastify';
import { checkDatabaseConnection } from '../repositories/apiLog.repository';

export async function healthRoutes(app: FastifyInstance) {
  /**
   * Liveness probe - always returns OK if server is running
   * Used by load balancers to check if process is alive
   */
  app.get('/health', async () => {
    return { status: 'ok' };
  });

  /**
   * Readiness probe - checks if dependencies are available
   * Used by orchestrators (K8s) to determine if traffic should be routed
   *
   * Returns 503 if database is unreachable, preventing traffic from
   * being sent to an instance that can't serve requests properly.
   */
  app.get('/ready', async (_request, reply) => {
    const dbReady = await checkDatabaseConnection();

    if (!dbReady) {
      reply.code(503);
      return { status: 'not_ready', reason: 'database unavailable' };
    }

    return { status: 'ready' };
  });
}
