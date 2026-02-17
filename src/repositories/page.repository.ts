import { DB } from '../db';
import { Section, Change, DiffResult } from '../types';
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
 * Page info returned from getPageInfo
 */
export type PageInfo = {
  id: number;
  lastCheckedAt: Date | null;
  lastResult: DiffResult | null;
};

/**
 * Ensure a page row exists for a canonical URL and return its ID.
 *
 * This is used by async monitoring jobs to create jobs without fetching content.
 *
 * @param url - Canonical URL (must be pre-canonicalized!)
 * @returns Page ID
 */
export async function ensurePageExists(url: string): Promise<number> {
  const result = await DB.query<{ id: number }>(
    'INSERT INTO pages (url) VALUES ($1) ON CONFLICT (url) DO UPDATE SET url = EXCLUDED.url RETURNING id',
    [url],
  );

  return result.rows[0].id;
}

/**
 * Get page info including last check time and cached result
 *
 * @param url - Canonical URL
 * @returns Page info or null if page doesn't exist
 */
export async function getPageInfo(url: string): Promise<PageInfo | null> {
  const result = await DB.query('SELECT id, last_checked_at, last_result FROM pages WHERE url = $1', [url]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    lastCheckedAt: row.last_checked_at,
    lastResult: row.last_result as DiffResult | null,
  };
}

/**
 * Check if page is within cooldown period
 *
 * @param pageId - Page ID
 * @param minIntervalMinutes - Minimum minutes between checks
 * @returns Object with cooldown status and last check time
 */
export async function checkCooldown(
  pageId: number,
  minIntervalMinutes: number,
): Promise<{ inCooldown: boolean; lastCheckedAt: Date | null; lastResult: DiffResult | null }> {
  const result = await DB.query('SELECT last_checked_at, last_result FROM pages WHERE id = $1', [pageId]);

  if (result.rows.length === 0) {
    return { inCooldown: false, lastCheckedAt: null, lastResult: null };
  }

  const lastCheckedAt = result.rows[0].last_checked_at as Date | null;
  const lastResult = result.rows[0].last_result as DiffResult | null;

  if (!lastCheckedAt) {
    return { inCooldown: false, lastCheckedAt: null, lastResult };
  }

  const cooldownMs = minIntervalMinutes * 60 * 1000;
  const timeSinceLastCheck = Date.now() - lastCheckedAt.getTime();

  return {
    inCooldown: timeSinceLastCheck < cooldownMs,
    lastCheckedAt,
    lastResult,
  };
}

/**
 * Update page's last check time and cached result
 */
export async function updatePageCache(pageId: number, result: DiffResult): Promise<void> {
  await DB.query('UPDATE pages SET last_checked_at = NOW(), last_result = $2 WHERE id = $1', [
    pageId,
    JSON.stringify(result),
  ]);
}

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

    // OPTIMIZATION: Skip diff if hash is identical
    // This avoids expensive section comparison when nothing changed
    if (latestHash === contentHash) {
      return { status: 'unchanged', pageId };
    }

    // Calculate diff between old and new sections
    const changes = diffSections(latestSections, sections);

    // OPTIMIZATION: If no meaningful changes detected, treat as unchanged
    // This handles cases where hash differs but content is semantically same
    if (changes.length === 0) {
      return { status: 'unchanged', pageId };
    }

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
