import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { getTierConfig } from '../config/tierConfig';

/**
 * Token Bucket state for an API key
 */
type TokenBucket = {
  tokens: number;
  lastRefill: number; // timestamp in ms
};

/**
 * In-memory storage for token buckets.
 * Key = apiKeyId (as string)
 * Exported for testing.
 */
export const buckets = new Map<string, TokenBucket>();

// Metrics (exported for exposure via repository/controller)
export let rateLimitHitCount = 0;

/**
 * Get the number of active token buckets in memory
 */
export function getActiveTokenBucketsCount(): number {
  return buckets.size;
}

/**
 * Remove inactive buckets from memory
 * Inactive = lastRefill older than 15 minutes
 */
export function cleanupInactiveBuckets(): number {
  const now = Date.now();
  const CLEANUP_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

  let deletedCount = 0;
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > CLEANUP_THRESHOLD_MS) {
      buckets.delete(key);
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
async function tierTokenBucketLimiterFn(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Only apply to routes that have been authenticated (apiKey is available)
    const apiKey = request.apiKey;
    if (!apiKey) {
      return;
    }

    const apiKeyId = apiKey.id.toString();
    const config = getTierConfig(apiKey.tier);
    const now = Date.now();

    let bucket = buckets.get(apiKeyId);

    // Initialize if new
    if (!bucket) {
      bucket = {
        tokens: config.capacity,
        lastRefill: now,
      };
      buckets.set(apiKeyId, bucket);
    } else {
      // Refill tokens
      const elapsedSeconds = (now - bucket.lastRefill) / 1000;
      const refillAmount = elapsedSeconds * config.refillRate;

      bucket.tokens = Math.min(config.capacity, bucket.tokens + refillAmount);
      bucket.lastRefill = now;
    }

    // Check availability
    if (bucket.tokens < 1) {
      rateLimitHitCount++;

      request.log.warn(
        {
          api_key_id: apiKey.id,
          tier: apiKey.tier,
          remaining_tokens: bucket.tokens,
        },
        'RATE_LIMIT_EXCEEDED',
      );

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
  setInterval(
    () => {
      const deletedCount = cleanupInactiveBuckets();
      if (deletedCount > 0) {
        fastify.log.debug({ deletedCount, activeBuckets: buckets.size }, 'Token bucket garbage collection complete');
      }
    },
    5 * 60 * 1000,
  ).unref();
}

export const tierTokenBucketLimiterPlugin = fp(tierTokenBucketLimiterFn, {
  name: 'tierTokenBucketLimiter',
  fastify: '5.x',
  dependencies: ['apiKeyAuth'], // Must run after auth to have access to request.apiKey
});
