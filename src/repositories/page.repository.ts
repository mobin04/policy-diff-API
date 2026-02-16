import { DB } from '../db';
import { Section, Change } from '../types';
import { diffSections } from '../services/differ.service';

/**
 * Result type for savePage operation
 * Includes pageId for debugging and logging
 */
export type SavePageResult = {
  status: 'unchanged' | 'first_version' | 'changed';
  pageId: number;
  changes?: Change[];
};

/**
 * Save or update a page and create a new version if content changed
 *
 * Uses ON CONFLICT to ensure idempotent page creation.
 * The RETURNING id clause works for both INSERT and UPDATE cases,
 * guaranteeing we always get the correct page ID.
 *
 * @param url - Canonical URL (must be pre-canonicalized!)
 * @param content - Normalized page content
 * @param contentHash - SHA-256 hash of content for fast comparison
 * @param sections - Extracted sections from HTML
 */
export async function savePage(
  url: string,
  content: string,
  contentHash: string,
  sections: Section[],
): Promise<SavePageResult> {
  // Upsert page record - RETURNING id works for both insert and conflict
  const pageResult = await DB.query(
    'INSERT INTO pages (url) VALUES ($1) ON CONFLICT (url) DO UPDATE SET url = EXCLUDED.url RETURNING id',
    [url],
  );

  const pageId: number = pageResult.rows[0].id;

  // SAFETY CHECK: Explicitly check if ANY versions exist for this page
  // This prevents the "first snapshot" bug where a race condition or
  // failed previous insert could cause us to treat an existing page as new
  const versionCountResult = await DB.query('SELECT COUNT(*)::int as count FROM page_versions WHERE page_id = $1', [
    pageId,
  ]);
  const versionCount: number = versionCountResult.rows[0].count;

  // Fetch latest version for comparison
  const latestVersionResult = await DB.query(
    'SELECT content_hash, sections FROM page_versions WHERE page_id = $1 ORDER BY created_at DESC LIMIT 1',
    [pageId],
  );

  // If versions exist, compare with latest
  if (versionCount > 0 && latestVersionResult.rows.length > 0) {
    const latestHash = latestVersionResult.rows[0].content_hash;
    const latestSections = latestVersionResult.rows[0].sections as Section[];

    if (latestHash === contentHash) {
      return { status: 'unchanged', pageId };
    }

    // Calculate diff between old and new sections
    const changes = diffSections(latestSections, sections);

    await DB.query('INSERT INTO page_versions (page_id, content, content_hash, sections) VALUES ($1, $2, $3, $4)', [
      pageId,
      content,
      contentHash,
      JSON.stringify(sections),
    ]);

    return { status: 'changed', pageId, changes };
  }

  // First version - only when NO versions exist for this page_id
  await DB.query('INSERT INTO page_versions (page_id, content, content_hash, sections) VALUES ($1, $2, $3, $4)', [
    pageId,
    content,
    contentHash,
    JSON.stringify(sections),
  ]);

  return { status: 'first_version', pageId };
}
