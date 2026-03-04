import { DB } from '../db';
import { getTierConfig } from '../config/tierConfig';
import { QuotaExceededError, BatchLimitExceededError } from '../errors';

export type UsageRow = {
  id: number;
  tier: 'FREE' | 'STARTER' | 'PRO';
  monthly_quota: number;
  monthly_usage: number;
  quota_reset_at: Date;
};

export type UsageSnapshot = {
  tier: 'FREE' | 'STARTER' | 'PRO';
  monthlyQuota: number;
  monthlyUsage: number;
  remaining: number;
  quotaResetAt: Date;
  maxBatchSize: number;
};

function firstDayOfNextMonth(now: Date): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const nextMonth = (month + 1) % 12;
  const nextYear = year + (month === 11 ? 1 : 0);
  return new Date(Date.UTC(nextYear, nextMonth, 1, 0, 0, 0, 0));
}

export async function loadUsageRowForUpdate(
  client: typeof DB | { query: typeof DB.query },
  apiKeyId: number,
): Promise<UsageRow> {
  const result = await client.query<UsageRow>(
    `SELECT id, tier, monthly_quota, monthly_usage, quota_reset_at
     FROM api_keys
     WHERE id = $1
     FOR UPDATE`,
    [apiKeyId],
  );

  if (result.rows.length === 0) {
    throw new Error('API key not found');
  }

  let row = result.rows[0];
  const now = new Date();

  if (row.quota_reset_at < now) {
    const nextReset = firstDayOfNextMonth(now);
    row = { ...row, monthly_usage: 0, quota_reset_at: nextReset };

    await client.query(
      `UPDATE api_keys
       SET monthly_usage = $2,
           quota_reset_at = $3
       WHERE id = $1`,
      [row.id, row.monthly_usage, row.quota_reset_at],
    );
  }

  // Ensure monthly_quota is populated (legacy safety)
  if (row.monthly_quota == null) {
    const tierConfig = getTierConfig(row.tier);
    row = { ...row, monthly_quota: tierConfig.monthlyQuota };

    await client.query(
      `UPDATE api_keys
       SET monthly_quota = $2
       WHERE id = $1`,
      [row.id, row.monthly_quota],
    );
  }

  return row;
}

function buildSnapshot(row: UsageRow): UsageSnapshot {
  const tierConfig = getTierConfig(row.tier);
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

type ConsumeOptions = {
  enforceBatchLimit?: boolean;
};

/**
 * Check quota and, if allowed, consume jobs atomically using an existing client.
 * Use this when you are already inside a transaction.
 */
export async function consumeJobsWithClient(
  client: typeof DB | { query: typeof DB.query },
  apiKeyId: number,
  requestedJobs: number,
  options: ConsumeOptions = {},
): Promise<UsageSnapshot> {
  if (requestedJobs <= 0) {
    throw new Error('requestedJobs must be positive');
  }

  const row = await loadUsageRowForUpdate(client, apiKeyId);
  const tierConfig = getTierConfig(row.tier);

  if (options.enforceBatchLimit && requestedJobs > tierConfig.maxBatchSize) {
    throw new BatchLimitExceededError(`Batch size exceeds allowed tier limit of ${tierConfig.maxBatchSize}`);
  }

  const projectedUsage = row.monthly_usage + requestedJobs;
  if (projectedUsage > row.monthly_quota) {
    throw new QuotaExceededError('Monthly usage limit reached');
  }

  await client.query(
    `UPDATE api_keys
     SET monthly_usage = $2
     WHERE id = $1`,
    [row.id, projectedUsage],
  );

  const updatedRow: UsageRow = {
    ...row,
    monthly_usage: projectedUsage,
  };

  return buildSnapshot(updatedRow);
}

/**
 * Check quota and, if allowed, consume jobs atomically.
 */
export async function consumeJobs(
  apiKeyId: number,
  requestedJobs: number,
  options: ConsumeOptions = {},
): Promise<UsageSnapshot> {
  const client = await DB.connect();

  try {
    await client.query('BEGIN');
    const snapshot = await consumeJobsWithClient(client, apiKeyId, requestedJobs, options);
    await client.query('COMMIT');
    return snapshot;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get current usage snapshot for an API key.
 *
 * This applies reset logic if quota_reset_at is in the past,
 * but does not consume any additional jobs.
 */
export async function getUsageSnapshot(apiKeyId: number): Promise<UsageSnapshot> {
  const client = await DB.connect();

  try {
    await client.query('BEGIN');
    const row = await loadUsageRowForUpdate(client, apiKeyId);
    await client.query('COMMIT');
    return buildSnapshot(row);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
