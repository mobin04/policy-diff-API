import { DB } from '../db';

/**
 * Retrieve the raw HTML for a specific replay snapshot
 *
 * @param id UUID of the snapshot
 * @returns raw_html string or null if not found
 */
export async function getSnapshotRawHtml(id: string): Promise<string | null> {
  const result = await DB.query('SELECT raw_html FROM replay_snapshots WHERE id = $1', [id]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].raw_html;
}

/**
 * Insert a new replay snapshot into the database
 *
 * @param url - Canonicalized URL of the page
 * @param rawHtml - Raw HTML content fetched from the page
 * @returns Generated snapshot UUID
 */
export async function createReplaySnapshot(url: string, rawHtml: string): Promise<{ id: string }> {
  const result = await DB.query<{ id: string }>(
    'INSERT INTO replay_snapshots (url, raw_html) VALUES ($1, $2) RETURNING id',
    [url, rawHtml],
  );

  return { id: result.rows[0].id };
}
