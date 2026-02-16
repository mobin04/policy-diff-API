import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import crypto from 'crypto';

/**
 * Request ID Plugin
 *
 * Assigns a unique identifier to each request for tracing and debugging.
 *
 * Behavior:
 * - If client sends x-request-id header, use it (enables end-to-end tracing)
 * - Otherwise, generate a new UUID
 * - Attach to request object and response header
 *
 * Why this matters:
 * - Correlate logs across services
 * - Debug user-reported issues ("my request failed" → find exact log)
 * - Track request flow through middleware/handlers
 */

const REQUEST_ID_HEADER = 'x-request-id';

async function requestIdPluginFn(fastify: FastifyInstance): Promise<void> {
  // Generate or extract request ID on every request
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Use client-provided ID or generate new one
    const existingId = request.headers[REQUEST_ID_HEADER];
    const requestId = typeof existingId === 'string' && existingId.length > 0 ? existingId : crypto.randomUUID();

    // Attach to request for use in handlers and logging
    request.requestId = requestId;

    // Record start time for response time calculation
    request.startTime = Date.now();

    // Add to reply headers so client can correlate
    reply.header(REQUEST_ID_HEADER, requestId);
  });
}

export const requestIdPlugin = fp(requestIdPluginFn, {
  name: 'requestId',
  fastify: '5.x',
});
