"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadUsageRowForUpdate = loadUsageRowForUpdate;
exports.consumeJobsWithClient = consumeJobsWithClient;
exports.consumeJobs = consumeJobs;
exports.getUsageSnapshot = getUsageSnapshot;
const db_1 = require("../db");
const tierConfig_1 = require("../config/tierConfig");
const errors_1 = require("../errors");
function firstDayOfNextMonth(now) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const nextMonth = (month + 1) % 12;
    const nextYear = year + (month === 11 ? 1 : 0);
    return new Date(Date.UTC(nextYear, nextMonth, 1, 0, 0, 0, 0));
}
async function loadUsageRowForUpdate(client, apiKeyId) {
    const result = await client.query(`SELECT id, tier, monthly_quota, monthly_usage, quota_reset_at
     FROM api_keys
     WHERE id = $1
     FOR UPDATE`, [apiKeyId]);
    if (result.rows.length === 0) {
        throw new Error('API key not found');
    }
    let row = result.rows[0];
    const now = new Date();
    if (row.quota_reset_at < now) {
        const nextReset = firstDayOfNextMonth(now);
        row = { ...row, monthly_usage: 0, quota_reset_at: nextReset };
        await client.query(`UPDATE api_keys
       SET monthly_usage = $2,
           quota_reset_at = $3
       WHERE id = $1`, [row.id, row.monthly_usage, row.quota_reset_at]);
    }
    // Ensure monthly_quota is populated (legacy safety)
    if (row.monthly_quota == null) {
        const tierConfig = (0, tierConfig_1.getTierConfig)(row.tier);
        row = { ...row, monthly_quota: tierConfig.monthlyQuota };
        await client.query(`UPDATE api_keys
       SET monthly_quota = $2
       WHERE id = $1`, [row.id, row.monthly_quota]);
    }
    return row;
}
function buildSnapshot(row) {
    const tierConfig = (0, tierConfig_1.getTierConfig)(row.tier);
    const remaining = row.monthly_quota - row.monthly_usage;
    return {
        tier: row.tier,
        monthlyQuota: row.monthly_quota,
        monthlyUsage: row.monthly_usage,
        remaining: remaining >= 0 ? remaining : 0,
        quotaResetAt: row.quota_reset_at,
        maxBatchSize: tierConfig.maxBatchSize,
    };
}
/**
 * Check quota and, if allowed, consume jobs atomically using an existing client.
 * Use this when you are already inside a transaction.
 */
async function consumeJobsWithClient(client, apiKeyId, requestedJobs, options = {}) {
    if (requestedJobs <= 0) {
        throw new Error('requestedJobs must be positive');
    }
    const row = await loadUsageRowForUpdate(client, apiKeyId);
    const tierConfig = (0, tierConfig_1.getTierConfig)(row.tier);
    if (options.enforceBatchLimit && requestedJobs > tierConfig.maxBatchSize) {
        throw new errors_1.BatchLimitExceededError(`Batch size exceeds allowed tier limit of ${tierConfig.maxBatchSize}`);
    }
    const projectedUsage = row.monthly_usage + requestedJobs;
    if (projectedUsage > row.monthly_quota) {
        throw new errors_1.QuotaExceededError('Monthly usage limit reached');
    }
    await client.query(`UPDATE api_keys
     SET monthly_usage = $2
     WHERE id = $1`, [row.id, projectedUsage]);
    const updatedRow = {
        ...row,
        monthly_usage: projectedUsage,
    };
    return buildSnapshot(updatedRow);
}
/**
 * Check quota and, if allowed, consume jobs atomically.
 */
async function consumeJobs(apiKeyId, requestedJobs, options = {}) {
    const client = await db_1.DB.connect();
    try {
        await client.query('BEGIN');
        const snapshot = await consumeJobsWithClient(client, apiKeyId, requestedJobs, options);
        await client.query('COMMIT');
        return snapshot;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
/**
 * Get current usage snapshot for an API key.
 *
 * This applies reset logic if quota_reset_at is in the past,
 * but does not consume any additional jobs.
 */
async function getUsageSnapshot(apiKeyId) {
    const client = await db_1.DB.connect();
    try {
        await client.query('BEGIN');
        const row = await loadUsageRowForUpdate(client, apiKeyId);
        await client.query('COMMIT');
        return buildSnapshot(row);
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
