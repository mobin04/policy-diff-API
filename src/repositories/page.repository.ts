import { DB } from '../db';

export async function savePage(url: string, content: string) {
  const pageResult = await DB.query(
    'INSERT INTO pages (url) VALUES ($1) ON CONFLICT (url) DO UPDATE SET url = EXCLUDED.url RETURNING id',
    [url],
  );

  const pageId: number = pageResult.rows[0].id;

  await DB.query('INSERT INTO page_versions (page_id, content) VALUES ($1, $2)', [pageId, content]);
}
