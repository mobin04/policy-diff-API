import Fastify, { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { healthRoutes } from './routes/health.route';
import { checkRoutes } from './routes/check.route';
import { apiKeyAuthPlugin } from './plugins/apiKeyAuth';
import { requestIdPlugin } from './plugins/requestId';
import { requestLoggerPlugin } from './plugins/requestLogger';
import { NODE_ENV } from './config';
import { ErrorResponse } from './types/observability';

// Import types to ensure Fastify type extensions are loaded
import './types/auth';
import './types/observability';

const isProduction = NODE_ENV === 'production';

/**
 * Create Fastify instance with structured logging
 *
 * Logger configuration:
 * - Production: 'info' level, no pretty printing
 * - Development: 'debug' level with pretty printing
 */
const app = Fastify({
  logger: {
    level: isProduction ? 'info' : 'debug',
    // In production, output JSON for log aggregators
    // In development, use pino-pretty if available
    transport: isProduction
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
  },
});

/**
 * Global Error Handler
 *
 * Provides consistent error responses across all endpoints.
 *
 * Security considerations:
 * - Production: Hide stack traces to prevent information leakage
 * - Development: Include stack traces for debugging
 * - Always include request_id for log correlation
 */
app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
  const statusCode = error.statusCode ?? 500;
  const requestId = request.requestId ?? 'unknown';

  // Log the full error server-side
  request.log.error(
    {
      err: error,
      requestId,
      statusCode,
    },
    'Request error',
  );

  // Build client-facing error response
  const response: ErrorResponse = {
    error: error.name || 'InternalServerError',
    message: statusCode >= 500 && isProduction ? 'Internal server error' : error.message,
    request_id: requestId,
  };

  // Include stack trace only in development
  if (!isProduction && error.stack) {
    response.stack = error.stack;
  }

  reply.code(statusCode).send(response);
});

// ==========================================
// Plugin Registration Order Matters!
// ==========================================

// 1. Request ID - must be first to ensure all logs have request ID
app.register(requestIdPlugin);

// 2. Request Logger - depends on requestId, logs all requests
app.register(requestLoggerPlugin);

// 3. API Key Auth - makes fastify.apiKeyAuth available
app.register(apiKeyAuthPlugin);

// 4. Public routes (no auth required)
app.register(healthRoutes);

// 5. Protected routes under /v1 prefix
app.register(checkRoutes, { prefix: '/v1' });

export default app;
