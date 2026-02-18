import { DB } from '../db';
import { JobStatus, MonitorBatch, MonitorBatchRow } from '../types';

function rowToEntity(row: MonitorBatchRow): MonitorBatch {
  return {
    id: row.id,
    apiKeyId: row.api_key_id,
    totalJobs: row.total_jobs,
    createdAt: row.created_at,
  };
}

export async function createBatch(
  apiKeyId: number,
  totalJobs: number,
  client?: typeof DB | { query: typeof DB.query },
): Promise<MonitorBatch> {
  const db = client || DB;
  const result = await db.query<MonitorBatchRow>(
    `INSERT INTO monitor_batches (api_key_id, total_jobs)
     VALUES ($1, $2)
     RETURNING *`,
    [apiKeyId, totalJobs],
  );

  return rowToEntity(result.rows[0]);
}

export async function getBatchByIdForApiKey(batchId: string, apiKeyId: number): Promise<MonitorBatch | null> {
  const result = await DB.query<MonitorBatchRow>('SELECT * FROM monitor_batches WHERE id = $1 AND api_key_id = $2', [
    batchId,
    apiKeyId,
  ]);

  if (result.rows.length === 0) return null;
  return rowToEntity(result.rows[0]);
}

export type BatchJobCounts = {
  completed: number;
  processing: number;
  failed: number;
};

export async function getBatchJobCounts(batchId: string): Promise<BatchJobCounts> {
  const result = await DB.query<{ status: JobStatus; count: number }>(
    'SELECT status, COUNT(*)::int as count FROM monitor_jobs WHERE batch_id = $1 GROUP BY status',
    [batchId],
  );

  const counts: BatchJobCounts = { completed: 0, processing: 0, failed: 0 };

  for (const row of result.rows) {
    if (row.status === 'COMPLETED') counts.completed = row.count;
    if (row.status === 'PROCESSING') counts.processing = row.count;
    if (row.status === 'FAILED') counts.failed = row.count;
  }

  return counts;
}

export type BatchJobListItem = { jobId: string; status: JobStatus };

export async function listBatchJobs(batchId: string): Promise<BatchJobListItem[]> {
  const result = await DB.query<{ id: string; status: JobStatus }>(
    'SELECT id, status FROM monitor_jobs WHERE batch_id = $1 ORDER BY created_at ASC',
    [batchId],
  );

  return result.rows.map((r) => ({ jobId: r.id, status: r.status }));
}
