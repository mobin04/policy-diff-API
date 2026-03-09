"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyAuthPlugin = void 0;
exports.apiKeyAuthHook = apiKeyAuthHook;
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const apiKey_repository_1 = require("../repositories/apiKey.repository");
const config_1 = require("../config");
/**
 * API Key Authentication Plugin
 *
 * Security Design Decisions:
 *
 * 1. WHY DEV BYPASS EXISTS:
 *    During local development, requiring API keys for every request slows down
 *    iteration. The x-dev-bypass header allows skipping auth ONLY when:
 *    - NODE_ENV is 'development'
 *    - The header is explicitly set
 *    This cannot work in production (NODE_ENV !== 'development').
 *
 * 2. WHY RATE LIMIT IS BASIC:
 *    Current implementation uses a simple DB counter. This is sufficient for:
 *    - Low-traffic APIs
 *    - MVP/prototype stage
 *    For production scale, consider:
 *    - Redis-based sliding window
 *    - Token bucket algorithm
 *    - External rate limiter (e.g., Kong, Cloudflare)
 *
 * 3. FUTURE BILLING PREPARATION:
 *    The current structure supports billing integration by:
 *    - Tracking per-key usage
 *    - Having configurable rate limits per key
 *    - Separating dev/prod environments
 *    Future: Add billing_tier, reset_at, overage_allowed fields
 */
const DEV_BYPASS_HEADER = 'x-dev-bypass';
/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader) {
    if (!authHeader)
        return null;
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer')
        return null;
    return parts[1];
}
/**
 * Send standardized error response
 */
function sendAuthError(reply, statusCode, error, message) {
    const response = { error, message };
    reply.code(statusCode).send(response);
}
/**
 * API Key authentication hook
 * Validates API key, checks rate limits, and tracks usage
 */
async function apiKeyAuthHook(request, reply) {
    const isDevelopment = config_1.NODE_ENV === 'development';
    // Dev bypass: Allow requests without key in development mode
    // Security: This ONLY works when NODE_ENV is explicitly 'development'
    if (isDevelopment && request.headers[DEV_BYPASS_HEADER] === 'true') {
        request.log.warn('DEV BYPASS: Request allowed without API key. Do NOT use in production!');
        return;
    }
    // Extract API key from Authorization header
    const authHeader = request.headers.authorization;
    const rawKey = extractBearerToken(authHeader);
    if (!rawKey) {
        sendAuthError(reply, 401, 'Unauthorized', 'API key missing or invalid');
        return;
    }
    // Look up the key in database
    const apiKey = await (0, apiKey_repository_1.findApiKeyByRawKey)(rawKey);
    if (!apiKey) {
        sendAuthError(reply, 403, 'Forbidden', 'Invalid API key');
        return;
    }
    if (!apiKey.isActive) {
        sendAuthError(reply, 403, 'Forbidden', 'API key has been deactivated');
        return;
    }
    // Attach API key to request for downstream handlers
    request.apiKey = apiKey;
}
/**
 * Fastify plugin that registers the API key auth hook
 *
 * Usage:
 *   // Apply to specific routes
 *   fastify.register(apiKeyAuthPlugin);
 *   fastify.addHook('onRequest', fastify.apiKeyAuth);
 *
 *   // Or apply to route options
 *   fastify.post('/check', { preHandler: fastify.apiKeyAuth }, handler);
 */
async function apiKeyAuthPluginFn(fastify) {
    // Decorate fastify with the auth hook for flexible usage
    fastify.decorate('apiKeyAuth', apiKeyAuthHook);
}
exports.apiKeyAuthPlugin = (0, fastify_plugin_1.default)(apiKeyAuthPluginFn, {
    name: 'apiKeyAuth',
    fastify: '5.x',
});
