"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalRateLimitPlugin = void 0;
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const config_1 = require("../config");
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
async function globalRateLimitPluginFn(fastify) {
    fastify.addHook('onRequest', async (_request, reply) => {
        const now = Date.now();
        // Reset window if minute passed
        if (now - windowStart > WINDOW_MS) {
            requestCount = 0;
            windowStart = now;
        }
        requestCount++;
        if (requestCount > config_1.GLOBAL_RATE_LIMIT) {
            reply.code(429).send({
                error: 'TooManyRequests',
                message: 'Global rate limit exceeded. Please try again later.',
            });
        }
    });
}
exports.globalRateLimitPlugin = (0, fastify_plugin_1.default)(globalRateLimitPluginFn, {
    name: 'globalRateLimit',
    fastify: '5.x',
});
