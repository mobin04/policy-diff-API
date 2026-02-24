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
