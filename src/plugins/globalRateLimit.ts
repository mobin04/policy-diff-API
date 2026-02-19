import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { GLOBAL_RATE_LIMIT } from '../config';

/**
 * Global Rate Limiter Plugin
 * 
 * Provides a simple in-memory rate limiting mechanism to protect the
 * server from brute-force attacks or overwhelming traffic.
 * 
 * Policy:
 * - Limits the total number of requests across all clients.
 * - Sliding window implementation (per minute).
 * - Configurable via GLOBAL_RATE_LIMIT environment variable.
 * 
 * Note: This is a single-instance implementation.
 */

let requestCount = 0;
let windowStart = Date.now();
const WINDOW_MS = 60000; // 1 minute

async function globalRateLimitPluginFn(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', async (_request: FastifyRequest, reply: FastifyReply) => {
    const now = Date.now();

    // Reset window if minute passed
    if (now - windowStart > WINDOW_MS) {
      requestCount = 0;
      windowStart = now;
    }

    requestCount++;

    if (requestCount > GLOBAL_RATE_LIMIT) {
      reply.code(429).send({
        error: 'TooManyRequests',
        message: 'Global rate limit exceeded. Please try again later.',
      });
    }
  });
}

export const globalRateLimitPlugin = fp(globalRateLimitPluginFn, {
  name: 'globalRateLimit',
  fastify: '5.x',
});
