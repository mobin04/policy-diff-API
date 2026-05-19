import { DB } from '../db';

export type MonitoredUrl = {
  id: number;
  apiKeyId: number;
  pageId: number;
  url: string;
  email: string;
  lastScheduledAt: Date | null;
};

type MonitoredUrlRow = {
  id: number;
  api_key_id: number;
  page_id: number;
  url: string;
  email: string;
  last_scheduled_at: Date | null;
};

function rowToMonitoredUrl(row: MonitoredUrlRow): MonitoredUrl {
  return {
    id: row.id,
    apiKeyId: row.api_key_id,
    pageId: row.page_id,
    url: row.url,
    email: row.email,
    lastScheduledAt: row.last_scheduled_at,
  };
}

export async function upsertActiveMonitoredUrl(
  apiKeyId: number,
  pageId: number,
  client?: typeof DB | { query: typeof DB.query },
): Promise<void> {
  const db = client || DB;
  await db.query(
    `INSERT INTO monitored_urls (api_key_id, page_id, is_active, updated_at)
     VALUES ($1, $2, TRUE, NOW())
     ON CONFLICT (api_key_id, page_id)
     DO UPDATE SET is_active = TRUE, updated_at = NOW()`,
    [apiKeyId, pageId],
  );
}

export async function listActiveMonitoredUrls(): Promise<MonitoredUrl[]> {
  const result = await DB.query<MonitoredUrlRow>(
    `SELECT mu.id, mu.api_key_id, mu.page_id, mu.last_scheduled_at, p.url, ak.email
     FROM monitored_urls mu
     JOIN pages p ON p.id = mu.page_id
     JOIN api_keys ak ON ak.id = mu.api_key_id
     WHERE mu.is_active = TRUE
       AND ak.is_active = TRUE
     ORDER BY mu.id ASC`,
  );

  return result.rows.map(rowToMonitoredUrl);
}

export async function markMonitoredUrlScheduled(id: number): Promise<void> {
  await DB.query('UPDATE monitored_urls SET last_scheduled_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
}
