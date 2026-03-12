"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findApiKeyByHash = findApiKeyByHash;
exports.findApiKeyByRawKey = findApiKeyByRawKey;
exports.createApiKey = createApiKey;
exports.deactivateApiKey = deactivateApiKey;
exports.findActiveByEmail = findActiveByEmail;
exports.updateApiKeyHash = updateApiKeyHash;
exports.countDistinctUrlsForKey = countDistinctUrlsForKey;
exports.insertProvisionedKey = insertProvisionedKey;
const db_1 = require("../db");
const apiKey_1 = require("../utils/apiKey");
/**
 * Convert database row to ApiKey type
 */
function rowToApiKey(row) {
    return {
        id: row.id,
        keyHash: row.key_hash,
        name: row.name,
        email: row.email,
        // Map DB 'live' to App 'prod' to handle legacy/mismatched DB constraints
        environment: row.environment === 'live' ? 'prod' : row.environment,
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
async function findApiKeyByHash(keyHash) {
    const result = await db_1.DB.query(`SELECT id, key_hash, name, email, environment, is_active,
            created_at, rotated_at, tier, monthly_quota, monthly_usage, quota_reset_at
     FROM api_keys
     WHERE key_hash = $1`, [keyHash]);
    if (result.rows.length === 0) {
        return null;
    }
    return rowToApiKey(result.rows[0]);
}
/**
 * Find an API key by raw key value
 * Hashes the key and looks it up
 */
async function findApiKeyByRawKey(rawKey) {
    const keyHash = (0, apiKey_1.hashApiKey)(rawKey);
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
async function createApiKey(rawKey, name, environment) {
    const keyHash = (0, apiKey_1.hashApiKey)(rawKey);
    // Map App 'prod' to DB 'live'
    const dbEnv = environment === 'prod' ? 'live' : environment;
    const result = await db_1.DB.query(`INSERT INTO api_keys (key_hash, name, email, environment, tier, monthly_quota, monthly_usage, quota_reset_at)
     VALUES ($1, $2, 'legacy@example.com', $3, 'FREE', 30, 0, NOW())
     RETURNING id, key_hash, name, email, environment, is_active,
               created_at, tier, monthly_quota, monthly_usage, quota_reset_at`, [keyHash, name, dbEnv]);
    return rowToApiKey(result.rows[0]);
}
/**
 * Deactivate an API key (soft delete)
 */
async function deactivateApiKey(keyId) {
    await db_1.DB.query('UPDATE api_keys SET is_active = FALSE WHERE id = $1', [keyId]);
}
/**
 * Find an active API key by email
 */
async function findActiveByEmail(email) {
    const result = await db_1.DB.query(`SELECT id, key_hash, name, email, environment, is_active,
            created_at, rotated_at, tier, monthly_quota, monthly_usage, quota_reset_at
     FROM api_keys
     WHERE email = $1 AND is_active = TRUE`, [email]);
    if (result.rows.length === 0) {
        return null;
    }
    return rowToApiKey(result.rows[0]);
}
/**
 * Update the key hash for an existing record (regeneration)
 */
async function updateApiKeyHash(apiKeyId, newHash) {
    await db_1.DB.query(`UPDATE api_keys
     SET key_hash = $2, rotated_at = NOW()
     WHERE id = $1`, [apiKeyId, newHash]);
}
/**
 * Count unique page_ids associated with an API key across all its monitor jobs.
 */
async function countDistinctUrlsForKey(apiKeyId, client) {
    const db = client || db_1.DB;
    const result = await db.query('SELECT COUNT(DISTINCT page_id) as count FROM monitor_jobs WHERE api_key_id = $1', [apiKeyId]);
    return parseInt(result.rows[0].count, 10);
}
/**
 * Insert a provisioned key
 * Note: Performs NO hashing or logic, only executes SQL.
 */
async function insertProvisionedKey(keyHash, input, quotaResetAt) {
    const result = await db_1.DB.query(`INSERT INTO api_keys (
       key_hash, name, email, environment, tier,
       monthly_quota, monthly_usage, quota_reset_at, is_active
     )
     VALUES ($1, $2, $3, $4, $5, $6, 0, $7, TRUE)
     RETURNING id, key_hash, name, email, environment, is_active,
               created_at, rotated_at, tier, monthly_quota, monthly_usage, quota_reset_at`, [keyHash, input.name, input.email, input.environment, input.tier, input.monthlyQuota, quotaResetAt]);
    return rowToApiKey(result.rows[0]);
}
