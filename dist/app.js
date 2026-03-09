"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const health_route_1 = require("./routes/health.route");
const check_route_1 = require("./routes/check.route");
const monitor_route_1 = require("./routes/monitor.route");
const batch_route_1 = require("./routes/batch.route");
const usage_route_1 = require("./routes/usage.route");
const internal_route_1 = require("./routes/internal.route");
const apiKeyAuth_1 = require("./plugins/apiKeyAuth");
const tierTokenBucketLimiter_1 = require("./plugins/tierTokenBucketLimiter");
const requestId_1 = require("./plugins/requestId");
const requestLogger_1 = require("./plugins/requestLogger");
const config_1 = require("./config");
const errors_1 = require("./errors");
const requestAbuse_service_1 = require("./services/requestAbuse.service");
// Import types to ensure Fastify type extensions are loaded
require("./types/auth");
require("./types/observability");
const isProduction = config_1.NODE_ENV === 'production';
/**
 * Create Fastify instance with structured logging
 *
 * Logger configuration:
 * - Production: 'info' level, no pretty printing
 * - Development: 'debug' level with pretty printing
 */
const app = (0, fastify_1.default)({
    logger: {
        level: config_1.LOG_LEVEL,
        transport: isProduction
            ? {
                target: 'pino-roll',
                options: {
                    file: './logs/app.log',
                    size: '10m', // Rotate every 10MB
                    interval: '1d', // Or every day
                    mkdir: true,
                },
            }
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
app.setErrorHandler((error, request, reply) => {
    const requestId = request.requestId ?? 'unknown';
    // Determine status code from error type
    let statusCode;
    let errorName;
    let message;
    if ((0, errors_1.isApiError)(error)) {
        // Custom API errors have their own status codes
        statusCode = error.statusCode;
        errorName = error.name;
        message = error.message;
    }
    else if ('statusCode' in error && typeof error.statusCode === 'number') {
        // Fastify errors (validation, etc.)
        statusCode = error.statusCode;
        errorName = error.name || 'Error';
        message = error.message;
    }
    else {
        // Unknown errors - treat as internal server error
        statusCode = 500;
        errorName = 'InternalServerError';
        // Hide internal error details in production
        message = isProduction ? 'Internal server error' : error.message;
    }
    // Log the full error server-side (always include stack for debugging)
    request.log.error({
        err: error,
        requestId,
        statusCode,
        errorName,
    }, 'Request error');
    // Build client-facing error response
    const response = {
        error: errorName,
        message,
        request_id: requestId,
    };
    // Include stack trace only in development
    if (!isProduction && error.stack) {
        response.stack = error.stack;
    }
    reply.code(statusCode).send(response);
    // STEP 4: Failed Request Pattern Tracking
    if (statusCode >= 400 && statusCode < 500) {
        const apiKeyId = request.apiKey?.id;
        (0, requestAbuse_service_1.recordAbuseEvent)('CLIENT_ERROR', apiKeyId, request.ip, { statusCode, errorName }).catch(() => { });
        if (apiKeyId) {
            const highErrorRate = (0, requestAbuse_service_1.trackErrorRate)(apiKeyId);
            if (highErrorRate) {
                request.log.warn({ api_key_id: apiKeyId }, 'HIGH_ERROR_RATE_DETECTED');
                (0, requestAbuse_service_1.recordAbuseEvent)('HIGH_ERROR_RATE_DETECTED', apiKeyId, request.ip).catch(() => { });
            }
        }
    }
});
// ==========================================
// Plugin Registration Order Matters!
// ==========================================
// 1. Request ID - must be first to ensure all logs have request ID
app.register(requestId_1.requestIdPlugin);
// 2. Request Logger - depends on requestId, logs all requests
app.register(requestLogger_1.requestLoggerPlugin);
// 3. API Key Auth - makes fastify.apiKeyAuth available
app.register(apiKeyAuth_1.apiKeyAuthPlugin);
// 4. Tier-Aware Token Bucket Rate Limiter - depends on apiKeyAuth
app.register(tierTokenBucketLimiter_1.tierTokenBucketLimiterPlugin);
// 5. Public routes (no auth required)
app.register(health_route_1.healthRoutes);
// 5. Protected routes under /v1 prefix
app.register(check_route_1.checkRoutes, { prefix: '/v1' });
// 6. Async monitoring routes under /v1 prefix
app.register(monitor_route_1.monitorRoutes, { prefix: '/v1' });
// 7. Batch status routes under /v1 prefix
app.register(batch_route_1.batchRoutes, { prefix: '/v1' });
// 8. Usage visibility routes under /v1 prefix
app.register(usage_route_1.usageRoutes, { prefix: '/v1' });
// 9. Internal metrics routes under /v1 prefix
app.register(internal_route_1.internalRoutes, { prefix: '/v1' });
exports.default = app;
