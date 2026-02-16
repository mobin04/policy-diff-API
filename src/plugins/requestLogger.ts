import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { logApiRequest } from '../repositories/apiLog.repository';
import { RequestLogEntry } from '../types';

/**
 * Request Logger Plugin
 *
 * Provides structured logging and audit trail for all requests.
 *
 * Features:
 * - Structured JSON logging (Pino-compatible)
 * - Response time measurement
 * - Audit log persistence to database
 * - Request ID correlation
 *
 * This runs AFTER the response is sent (onResponse hook) so it doesn't
 * add latency to the user's request.
 */

async function requestLoggerPluginFn(fastify: FastifyInstance): Promise<void> {
  // Log completed requests with timing and metadata
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const responseTime = Date.now() - request.startTime;
    const apiKeyId = request.apiKey?.id ?? null;

    // Build structured log entry
    const logEntry: RequestLogEntry = {
      requestId: request.requestId,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime,
    };

    // Include API key ID if authenticated
    if (apiKeyId !== null) {
      logEntry.apiKeyId = apiKeyId;
    }

    // Log to stdout (picked up by log aggregators)
    request.log.info(logEntry, 'request completed');

    // Persist to database for audit trail
    // This is fire-and-forget - we don't await to avoid blocking
    logApiRequest(apiKeyId, request.url, reply.statusCode, responseTime).catch((err) => {
      request.log.error({ err, requestId: request.requestId }, 'Failed to write audit log');
    });
  });
}

export const requestLoggerPlugin = fp(requestLoggerPluginFn, {
  name: 'requestLogger',
  fastify: '5.x',
  // Depends on requestId plugin being registered first
  dependencies: ['requestId'],
});
