import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { healthRoutes } from './routes/health.route';
import { checkRoutes } from './routes/check.route';
import { monitorRoutes } from './routes/monitor.route';
import { batchRoutes } from './routes/batch.route';
import { usageRoutes } from './routes/usage.route';
import { internalRoutes } from './routes/internal.route';
import { apiKeyAuthPlugin } from './plugins/apiKeyAuth';
import { globalRateLimitPlugin } from './plugins/globalRateLimit';
import { requestIdPlugin } from './plugins/requestId';
import { requestLoggerPlugin } from './plugins/requestLogger';
import { NODE_ENV, LOG_LEVEL } from './config';
import { ErrorResponse } from './types';
import { ApiError, isApiError } from './errors';

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
    level: LOG_LEVEL,
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
 * Handles custom error types:
 * - InvalidUrlError (400) - Bad URL format
 * - FetchError (502) - Cannot reach target
 * - HttpError (502) - Target returned error
 *
 * Security considerations:
 * - Production: Hide stack traces to prevent information leakage
 * - Development: Include stack traces for debugging
 * - Always include request_id for log correlation
 * - Never expose internal implementation details
 */
app.setErrorHandler((error: Error, request: FastifyRequest, reply: FastifyReply) => {
  const requestId = request.requestId ?? 'unknown';

  // Determine status code from error type
  let statusCode: number;
  let errorName: string;
  let message: string;

  if (isApiError(error)) {
    // Custom API errors have their own status codes
    statusCode = (error as ApiError).statusCode;
    errorName = error.name;
    message = error.message;
  } else if ('statusCode' in error && typeof error.statusCode === 'number') {
    // Fastify errors (validation, etc.)
    statusCode = error.statusCode;
    errorName = error.name || 'Error';
    message = error.message;
  } else {
    // Unknown errors - treat as internal server error
    statusCode = 500;
    errorName = 'InternalServerError';
    // Hide internal error details in production
    message = isProduction ? 'Internal server error' : error.message;
  }

  // Log the full error server-side (always include stack for debugging)
  request.log.error(
    {
      err: error,
      requestId,
      statusCode,
      errorName,
    },
    'Request error',
  );

  // Build client-facing error response
  const response: ErrorResponse = {
    error: errorName,
    message,
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

// 0. Global Rate Limiter - protect server first
app.register(globalRateLimitPlugin);

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

// 6. Async monitoring routes under /v1 prefix
app.register(monitorRoutes, { prefix: '/v1' });

// 7. Batch status routes under /v1 prefix
app.register(batchRoutes, { prefix: '/v1' });

// 8. Usage visibility routes under /v1 prefix
app.register(usageRoutes, { prefix: '/v1' });

// 9. Internal metrics routes under /v1 prefix
app.register(internalRoutes, { prefix: '/v1' });

export default app;
