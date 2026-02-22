import { fetchPage } from '../utils/fetchPage';
import { savePage, getPageInfo, checkCooldown, updatePageCache } from '../repositories/page.repository';
import { normalizeContent, normalizeHtml } from './normalizer.service';
import { extractSections } from './sectionExtractor.service';
import { extractMainContent } from '../utils/mainContentExtractor';
import { generateHash } from '../utils/hash';
import { canonicalizeUrl } from '../utils/canonicalizeUrl';
import { DiffResult, CheckResult } from '../types';
import { analyzeRisk } from './riskEngine.service';

/**
 * Logger interface for debug output
 */
type Logger = {
  debug: (obj: object, msg: string) => void;
};

/**
 * Options for checkPage function
 */
export type CheckPageOptions = {
  /** Minimum interval in minutes between checks (cooldown) */
  minInterval?: number;
  /** Optional logger for debug tracing */
  logger?: Logger;
};

/**
 * Check a page for policy changes with optional cooldown
 *
 * PERFORMANCE OPTIMIZATIONS:
 * 1. Cooldown check - Skip processing if checked recently
 * 2. Hash comparison - Skip diff if content hash unchanged
 * 3. Section hashing - Fast comparison via hashes
 * 4. Meaningful change filter - Ignore trivial edits
 * 5. Result caching - Return cached result when appropriate
 *
 * @param rawUrl - User-provided URL (will be canonicalized)
 * @param options - Check options including minInterval and logger
 * @returns CheckResult with status and result/skip info
 */
export async function checkPage(rawUrl: string, options: CheckPageOptions = {}): Promise<CheckResult> {
  const { minInterval, logger } = options;

  // CRITICAL: Canonicalize URL BEFORE any database operation
  const canonicalUrl = canonicalizeUrl(rawUrl);

  if (logger) {
    logger.debug({ rawUrl, canonicalUrl, minInterval }, 'URL canonicalized');
  }

  // OPTIMIZATION 1: Check cooldown if minInterval specified
  if (minInterval && minInterval > 0) {
    const pageInfo = await getPageInfo(canonicalUrl);

    if (pageInfo) {
      const cooldownStatus = await checkCooldown(pageInfo.id, minInterval);

      if (cooldownStatus.inCooldown) {
        if (logger) {
          logger.debug(
            { canonicalUrl, lastCheckedAt: cooldownStatus.lastCheckedAt },
            'Cooldown active, returning cached result',
          );
        }

        // Return cached result if available, otherwise generic skip response
        return {
          status: 'skipped',
          reason: 'Cooldown active',
          last_checked: cooldownStatus.lastCheckedAt?.toISOString(),
          result: cooldownStatus.lastResult ?? undefined,
        };
      }
    }
  }

  // Fetch and process page
  const rawHtml = await fetchPage(canonicalUrl);

  // Structural Normalization Layer
  const cleanedHtml = normalizeHtml(rawHtml);

  // Content Isolation Layer
  const { html: isolatedHtml, status: isolationStatus } = extractMainContent(cleanedHtml);

  const normalizedContent = normalizeContent(isolatedHtml);
  const sections = extractSections(isolatedHtml);
  const contentHash = generateHash(normalizedContent);

  // Save using ONLY the canonical URL
  const saveResult = await savePage(canonicalUrl, normalizedContent, contentHash, sections);

  if (logger) {
    logger.debug(
      { canonicalUrl, pageId: saveResult.pageId, status: saveResult.status, isolationStatus },
      'Page processed',
    );
  }

  // Build the diff result
  let diffResult: DiffResult;

  if (saveResult.status === 'first_version') {
    diffResult = {
      message: 'First snapshot stored',
      content_isolation: isolationStatus,
    };
  } else if (saveResult.status === 'unchanged') {
    diffResult = {
      message: 'No meaningful change detected',
      content_isolation: isolationStatus,
    };
  } else {
    const changes = saveResult.changes || [];
    const riskAnalysis = analyzeRisk(changes, sections);

    diffResult = {
      message: 'Changes detected',
      risk_level: riskAnalysis.risk_level,
      changes: riskAnalysis.changes,
      content_isolation: isolationStatus,
    };
  }

  // Cache the result for future cooldown checks
  await updatePageCache(saveResult.pageId, diffResult);

  return {
    status: 'processed',
    result: diffResult,
  };
}

/**
 * Legacy wrapper for backwards compatibility
 * Returns DiffResult directly instead of CheckResult
 */
export async function checkPageLegacy(rawUrl: string, logger?: Logger): Promise<DiffResult> {
  const result = await checkPage(rawUrl, { logger });
  return result.result ?? { message: 'Unknown status' };
}
