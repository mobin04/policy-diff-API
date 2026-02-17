import { DB } from '../db';
import { ApiKey, ApiKeyRow, ApiKeyEnvironment } from '../types';
import { hashApiKey } from '../utils/apiKey';

/**
 * Convert database row to ApiKey type
 */
function rowToApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    keyHash: row.key_hash,
    name: row.name,
    environment: row.environment,
    isActive: row.is_active,
    usageCount: row.usage_count,
    rateLimit: row.rate_limit,
    createdAt: row.created_at,
    tier: row.tier,
    monthlyQuota: row.monthly_quota,
    monthlyUsage: row.monthly_usage,
    quotaResetAt: row.quota_reset_at,
  };
}

/**
 * Find an API key by its hash
 * Used during authentication to validate incoming keys
 */
export async function findApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
  const result = await DB.query<ApiKeyRow>(
    `SELECT id, key_hash, name, environment, is_active, usage_count, rate_limit,
            created_at, tier, monthly_quota, monthly_usage, quota_reset_at
     FROM api_keys
     WHERE key_hash = $1`,
    [keyHash],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToApiKey(result.rows[0]);
}

/**
 * Find an API key by raw key value
 * Hashes the key and looks it up
 */
export async function findApiKeyByRawKey(rawKey: string): Promise<ApiKey | null> {
  const keyHash = hashApiKey(rawKey);
  return findApiKeyByHash(keyHash);
}

/**
 * Increment usage count for an API key
 * Called after each successful authenticated request
 */
export async function incrementUsage(keyId: number): Promise<void> {
  await DB.query('UPDATE api_keys SET usage_count = usage_count + 1 WHERE id = $1', [keyId]);
}

/**
 * Create a new API key record
 * Note: The raw key should be shown to the user ONCE before calling this
 *
 * @param rawKey - The raw API key (will be hashed)
 * @param name - Human-readable name for the key
 * @param environment - 'dev' or 'prod'
 * @param rateLimit - Optional custom rate limit (default: 100)
 */
export async function createApiKey(
  rawKey: string,
  name: string,
  environment: ApiKeyEnvironment,
  rateLimit: number = 100,
): Promise<ApiKey> {
  const keyHash = hashApiKey(rawKey);

  const result = await DB.query<ApiKeyRow>(
    `INSERT INTO api_keys (key_hash, name, environment, rate_limit, tier, monthly_quota, monthly_usage, quota_reset_at)
     VALUES ($1, $2, $3, $4, 'FREE', 100, 0, NOW())
     RETURNING id, key_hash, name, environment, is_active, usage_count, rate_limit,
               created_at, tier, monthly_quota, monthly_usage, quota_reset_at`,
    [keyHash, name, environment, rateLimit],
  );

  return rowToApiKey(result.rows[0]);
}

/**
 * Deactivate an API key (soft delete)
 */
export async function deactivateApiKey(keyId: number): Promise<void> {
  await DB.query('UPDATE api_keys SET is_active = FALSE WHERE id = $1', [keyId]);
}

/**
 * Reset usage count for an API key
 * Useful for billing cycle resets
 */
export async function resetUsageCount(keyId: number): Promise<void> {
  await DB.query('UPDATE api_keys SET usage_count = 0 WHERE id = $1', [keyId]);
}
