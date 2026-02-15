import { DB } from '../db';
import { Section, Change } from '../types';
import { diffSections } from '../services/differ.service';

export async function savePage(
  url: string,
  content: string,
  contentHash: string,
  sections: Section[],
): Promise<{ status: 'unchanged' | 'first_version' | 'changed'; changes?: Change[] }> {
  const pageResult = await DB.query(
    'INSERT INTO pages (url) VALUES ($1) ON CONFLICT (url) DO UPDATE SET url = EXCLUDED.url RETURNING id',
    [url],
  );

  const pageId: number = pageResult.rows[0].id;

  // Fetch latest version
  const latestVersionResult = await DB.query(
    'SELECT content_hash, sections FROM page_versions WHERE page_id = $1 ORDER BY created_at DESC LIMIT 1',
    [pageId],
  );

  if (latestVersionResult.rows.length > 0) {
    const latestHash = latestVersionResult.rows[0].content_hash;
    const latestSections = latestVersionResult.rows[0].sections as Section[];

    if (latestHash === contentHash) {
      return { status: 'unchanged' };
    }

    // Calculate diff
    const changes = diffSections(latestSections, sections);

    await DB.query(
      'INSERT INTO page_versions (page_id, content, content_hash, sections) VALUES ($1, $2, $3, $4)',
      [pageId, content, contentHash, JSON.stringify(sections)],
    );

    return { status: 'changed', changes };
  }

  // First version
  await DB.query(
    'INSERT INTO page_versions (page_id, content, content_hash, sections) VALUES ($1, $2, $3, $4)',
    [pageId, content, contentHash, JSON.stringify(sections)],
  );

  return { status: 'first_version' };
}
