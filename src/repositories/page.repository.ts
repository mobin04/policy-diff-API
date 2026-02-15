import { DB } from '../db';

export async function savePage(url: string, content: string, contentHash: string): Promise<{ changed: boolean }> {
  const pageResult = await DB.query(
    'INSERT INTO pages (url) VALUES ($1) ON CONFLICT (url) DO UPDATE SET url = EXCLUDED.url RETURNING id',
    [url],
  );

  const pageId: number = pageResult.rows[0].id;

  // Fetch latest version
  const latestVersionResult = await DB.query(
    'SELECT content_hash FROM page_versions WHERE page_id = $1 ORDER BY created_at DESC LIMIT 1',
    [pageId],
  );

  if (latestVersionResult.rows.length > 0) {
    const latestHash = latestVersionResult.rows[0].content_hash;
    if (latestHash === contentHash) {
      return { changed: false };
    }
  }

  await DB.query(
    'INSERT INTO page_versions (page_id, content, content_hash) VALUES ($1, $2, $3)',
    [pageId, content, contentHash],
  );

  return { changed: true };
}
