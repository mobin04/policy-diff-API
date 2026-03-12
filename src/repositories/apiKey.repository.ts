import { DB } from '../db';
import { ApiKey, ApiKeyRow, ApiKeyEnvironment, CreateApiKeyInput } from '../types';
import { hashApiKey } from '../utils/apiKey';

/**
 * Convert database row to ApiKey type
 */
function rowToApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    keyHash: row.key_hash,
    name: row.name,
    email: row.email,
    // Map DB 'live' to App 'prod' to handle legacy/mismatched DB constraints
    environment: (row.environment as string) === 'live' ? 'prod' : (row.environment as ApiKeyEnvironment),
    isActive: row.is_active,
    createdAt: row.created_at,
    rotatedAt: row.rotated_at,
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
    `SELECT id, key_hash, name, email, environment, is_active,
            created_at, rotated_at, tier, monthly_quota, monthly_usage, quota_reset_at
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
 * Create a new API key record
 * Note: The raw key should be shown to the user ONCE before calling this
 *
 * @param rawKey - The raw API key (will be hashed)
 * @param name - Human-readable name for the key
 * @param environment - 'dev' or 'prod'
 */
export async function createApiKey(rawKey: string, name: string, environment: ApiKeyEnvironment): Promise<ApiKey> {
  const keyHash = hashApiKey(rawKey);
  // Map App 'prod' to DB 'live'
  const dbEnv = environment === 'prod' ? 'live' : environment;

  const result = await DB.query<ApiKeyRow>(
    `INSERT INTO api_keys (key_hash, name, email, environment, tier, monthly_quota, monthly_usage, quota_reset_at)
     VALUES ($1, $2, 'legacy@example.com', $3, 'FREE', 30, 0, NOW())
     RETURNING id, key_hash, name, email, environment, is_active,
               created_at, tier, monthly_quota, monthly_usage, quota_reset_at`,
    [keyHash, name, dbEnv],
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
 * Find an active API key by email
 */
export async function findActiveByEmail(email: string): Promise<ApiKey | null> {
  const result = await DB.query<ApiKeyRow>(
    `SELECT id, key_hash, name, email, environment, is_active,
            created_at, rotated_at, tier, monthly_quota, monthly_usage, quota_reset_at
     FROM api_keys
     WHERE email = $1 AND is_active = TRUE`,
    [email],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToApiKey(result.rows[0]);
}

/**
 * Update the key hash for an existing record (regeneration)
 */
export async function updateApiKeyHash(apiKeyId: number, newHash: string): Promise<Date> {
  const result = await DB.query<{ rotated_at: Date }>(
    `UPDATE api_keys
     SET key_hash = $2, rotated_at = NOW()
     WHERE id = $1
     RETURNING rotated_at`,
    [apiKeyId, newHash],
  );
  return result.rows[0].rotated_at;
}

/**
 * Count unique page_ids associated with an API key across all its monitor jobs.
 */
export async function countDistinctUrlsForKey(
  apiKeyId: number,
  client?: typeof DB | { query: typeof DB.query },
): Promise<number> {
  const db = client || DB;
  const result = await db.query<{ count: string }>(
    'SELECT COUNT(DISTINCT page_id) as count FROM monitor_jobs WHERE api_key_id = $1',
    [apiKeyId],
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Insert a provisioned key
 * Note: Performs NO hashing or logic, only executes SQL.
 */
export async function insertProvisionedKey(
  keyHash: string,
  input: CreateApiKeyInput,
  quotaResetAt: Date,
): Promise<ApiKey> {
  const result = await DB.query<ApiKeyRow>(
    `INSERT INTO api_keys (
       key_hash, name, email, environment, tier,
       monthly_quota, monthly_usage, quota_reset_at, is_active
     )
     VALUES ($1, $2, $3, $4, $5, $6, 0, $7, TRUE)
     RETURNING id, key_hash, name, email, environment, is_active,
               created_at, rotated_at, tier, monthly_quota, monthly_usage, quota_reset_at`,
    [keyHash, input.name, input.email, input.environment, input.tier, input.monthlyQuota, quotaResetAt],
  );

  return rowToApiKey(result.rows[0]);
}
