"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tierTokenBucketLimiterPlugin = exports.rateLimitHitCount = exports.buckets = void 0;
exports.getActiveTokenBucketsCount = getActiveTokenBucketsCount;
exports.cleanupInactiveBuckets = cleanupInactiveBuckets;
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const tierConfig_1 = require("../config/tierConfig");
/**
 * In-memory storage for token buckets.
 * Key = apiKeyId (as string)
 * Exported for testing.
 */
exports.buckets = new Map();
// Metrics (exported for exposure via repository/controller)
exports.rateLimitHitCount = 0;
/**
 * Get the number of active token buckets in memory
 */
function getActiveTokenBucketsCount() {
    return exports.buckets.size;
}
/**
 * Remove inactive buckets from memory
 * Inactive = lastRefill older than 15 minutes
 */
function cleanupInactiveBuckets() {
    const now = Date.now();
    const CLEANUP_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
    let deletedCount = 0;
    for (const [key, bucket] of exports.buckets.entries()) {
        if (now - bucket.lastRefill > CLEANUP_THRESHOLD_MS) {
            exports.buckets.delete(key);
            deletedCount++;
        }
    }
    return deletedCount;
}
/**
 * Tier-Aware Token Bucket Rate Limiter Plugin
 *
 * Implements per-API-key rate limiting based on the user's tier.
 *
 * Algorithm:
 * 1. Initialize bucket with capacity if new.
 * 2. Refill tokens based on elapsed time and refillRate.
 * 3. Clamp to capacity.
 * 4. Reject if tokens < 1.
 * 5. Consume 1 token.
 *
 * Performance: O(1) per request.
 * Cleanup: Garbage collection runs every 5 minutes to remove inactive buckets.
 */
async function tierTokenBucketLimiterFn(fastify) {
    fastify.addHook('onRequest', async (request, reply) => {
        // Only apply to routes that have been authenticated (apiKey is available)
        const apiKey = request.apiKey;
        if (!apiKey) {
            return;
        }
        const apiKeyId = apiKey.id.toString();
        const config = (0, tierConfig_1.getTierConfig)(apiKey.tier);
        const now = Date.now();
        let bucket = exports.buckets.get(apiKeyId);
        // Initialize if new
        if (!bucket) {
            bucket = {
                tokens: config.capacity,
                lastRefill: now,
            };
            exports.buckets.set(apiKeyId, bucket);
        }
        else {
            // Refill tokens
            const elapsedSeconds = (now - bucket.lastRefill) / 1000;
            const refillAmount = elapsedSeconds * config.refillRate;
            bucket.tokens = Math.min(config.capacity, bucket.tokens + refillAmount);
            bucket.lastRefill = now;
        }
        // Check availability
        if (bucket.tokens < 1) {
            exports.rateLimitHitCount++;
            request.log.warn({
                api_key_id: apiKey.id,
                tier: apiKey.tier,
                remaining_tokens: bucket.tokens,
            }, 'RATE_LIMIT_EXCEEDED');
            reply.code(429).send({
                error: 'TooManyRequests',
                message: 'Rate limit exceeded for your tier. Please try again later.',
            });
            return;
        }
        // Consume token
        bucket.tokens -= 1;
    });
    // Garbage Collection for inactive buckets
    // Runs every 5 minutes
    setInterval(() => {
        const deletedCount = cleanupInactiveBuckets();
        if (deletedCount > 0) {
            fastify.log.debug({ deletedCount, activeBuckets: exports.buckets.size }, 'Token bucket garbage collection complete');
        }
    }, 5 * 60 * 1000).unref();
}
exports.tierTokenBucketLimiterPlugin = (0, fastify_plugin_1.default)(tierTokenBucketLimiterFn, {
    name: 'tierTokenBucketLimiter',
    fastify: '5.x',
    dependencies: ['apiKeyAuth'], // Must run after auth to have access to request.apiKey
});
