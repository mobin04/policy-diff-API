"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensurePageExists = ensurePageExists;
exports.getPageInfo = getPageInfo;
exports.checkCooldown = checkCooldown;
exports.updatePageCache = updatePageCache;
exports.savePage = savePage;
const db_1 = require("../db");
const differ_service_1 = require("../services/differ.service");
/**
 * Ensure a page row exists for a canonical URL and return its ID.
 *
 * This is used by async monitoring jobs to create jobs without fetching content.
 *
 * @param url - Canonical URL (must be pre-canonicalized!)
 * @param client - Optional DB client for transaction
 * @returns Page ID
 */
async function ensurePageExists(url, client) {
    const db = client || db_1.DB;
    const result = await db.query('INSERT INTO pages (url) VALUES ($1) ON CONFLICT (url) DO UPDATE SET url = EXCLUDED.url RETURNING id', [url]);
    return result.rows[0].id;
}
/**
 * Get page info including last check time and cached result
 *
 * @param url - Canonical URL
 * @returns Page info or null if page doesn't exist
 */
async function getPageInfo(url) {
    const result = await db_1.DB.query('SELECT id, last_checked_at, last_result, isolation_fingerprint FROM pages WHERE url = $1', [url]);
    if (result.rows.length === 0) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row.id,
        lastCheckedAt: row.last_checked_at,
        lastResult: row.last_result,
        isolationFingerprint: row.isolation_fingerprint,
    };
}
/**
 * Check if page is within cooldown period
 *
 * @param pageId - Page ID
 * @param minIntervalMinutes - Minimum minutes between checks
 * @returns Object with cooldown status and last check time
 */
async function checkCooldown(pageId, minIntervalMinutes) {
    const result = await db_1.DB.query('SELECT last_checked_at, last_result, isolation_fingerprint FROM pages WHERE id = $1', [pageId]);
    if (result.rows.length === 0) {
        return { inCooldown: false, lastCheckedAt: null, lastResult: null, isolationFingerprint: null };
    }
    const lastCheckedAt = result.rows[0].last_checked_at;
    const lastResult = result.rows[0].last_result;
    const isolationFingerprint = result.rows[0].isolation_fingerprint;
    if (!lastCheckedAt) {
        return { inCooldown: false, lastCheckedAt: null, lastResult, isolationFingerprint };
    }
    const cooldownMs = minIntervalMinutes * 60 * 1000;
    const timeSinceLastCheck = Date.now() - lastCheckedAt.getTime();
    return {
        inCooldown: timeSinceLastCheck < cooldownMs,
        lastCheckedAt,
        lastResult,
        isolationFingerprint,
    };
}
/**
 * Update page's last check time and cached result
 */
async function updatePageCache(pageId, result, isolationFingerprint) {
    if (isolationFingerprint) {
        await db_1.DB.query('UPDATE pages SET last_checked_at = NOW(), last_result = $2, isolation_fingerprint = $3 WHERE id = $1', [
            pageId,
            JSON.stringify(result),
            isolationFingerprint,
        ]);
    }
    else {
        await db_1.DB.query('UPDATE pages SET last_checked_at = NOW(), last_result = $2 WHERE id = $1', [
            pageId,
            JSON.stringify(result),
        ]);
    }
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
async function savePage(url, content, contentHash, sections) {
    // Upsert page record - RETURNING id works for both insert and conflict
    const pageResult = await db_1.DB.query('INSERT INTO pages (url) VALUES ($1) ON CONFLICT (url) DO UPDATE SET url = EXCLUDED.url RETURNING id', [url]);
    const pageId = pageResult.rows[0].id;
    // SAFETY CHECK: Explicitly check if ANY versions exist for this page
    // This prevents the "first snapshot" bug where a race condition or
    // failed previous insert could cause us to treat an existing page as new
    const versionCountResult = await db_1.DB.query('SELECT COUNT(*)::int as count FROM page_versions WHERE page_id = $1', [
        pageId,
    ]);
    const versionCount = versionCountResult.rows[0].count;
    // Fetch latest version for comparison
    const latestVersionResult = await db_1.DB.query('SELECT content_hash, sections FROM page_versions WHERE page_id = $1 ORDER BY created_at DESC LIMIT 1', [pageId]);
    // If versions exist, compare with latest
    if (versionCount > 0 && latestVersionResult.rows.length > 0) {
        const latestHash = latestVersionResult.rows[0].content_hash;
        const latestSections = latestVersionResult.rows[0].sections;
        // OPTIMIZATION: Skip diff if hash is identical
        // This avoids expensive section comparison when nothing changed
        if (latestHash === contentHash) {
            return { status: 'unchanged', pageId };
        }
        // Calculate diff between old and new sections
        const changes = (0, differ_service_1.diffSections)(latestSections, sections, { url });
        const metadata = changes;
        const numericOverrideTriggered = metadata.numeric_override_triggered === true;
        // OPTIMIZATION: If no meaningful changes detected, treat as unchanged
        // This handles cases where hash differs but content is semantically same
        if (changes.length === 0) {
            return {
                status: 'unchanged',
                pageId,
                numericOverrideTriggered,
                fuzzyMatchCount: metadata.fuzzy_match_count,
                lowConfidenceFuzzyMatchCount: metadata.low_confidence_fuzzy_match_count,
                fuzzyCollisionCount: metadata.fuzzy_collision_count,
                titleRenameCount: metadata.title_rename_count,
            };
        }
        await db_1.DB.query('INSERT INTO page_versions (page_id, content, content_hash, sections) VALUES ($1, $2, $3, $4)', [
            pageId,
            content,
            contentHash,
            JSON.stringify(sections),
        ]);
        return {
            status: 'changed',
            pageId,
            changes,
            oldSections: latestSections,
            numericOverrideTriggered,
            fuzzyMatchCount: metadata.fuzzy_match_count,
            lowConfidenceFuzzyMatchCount: metadata.low_confidence_fuzzy_match_count,
            fuzzyCollisionCount: metadata.fuzzy_collision_count,
            titleRenameCount: metadata.title_rename_count,
        };
    }
    // First version - only when NO versions exist for this page_id
    await db_1.DB.query('INSERT INTO page_versions (page_id, content, content_hash, sections) VALUES ($1, $2, $3, $4)', [
        pageId,
        content,
        contentHash,
        JSON.stringify(sections),
    ]);
    return { status: 'first_version', pageId };
}
