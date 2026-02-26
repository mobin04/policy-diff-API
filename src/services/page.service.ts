import { fetchPage } from '../utils/fetchPage';
import { savePage, getPageInfo, checkCooldown, updatePageCache } from '../repositories/page.repository';
import { recordCooldownHit } from '../repositories/cooldown.repository';
import { normalizeContent, normalizeHtml } from './normalizer.service';
import { extractSections } from './sectionExtractor.service';
import { extractMainContent } from '../utils/mainContentExtractor';
import { generateDateMaskedHash } from './hash.service';
import { canonicalizeUrl } from '../utils/canonicalizeUrl';
import { DiffResult, CheckResult } from '../types';
import { analyzeRisk } from './riskEngine.service';
import { detectIsolationDrift } from './isolationStability.service';

/**
 * Logger interface for debug output
 */
type Logger = {
  debug: (obj: object, msg: string) => void;
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
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
    logger.debug({ rawUrl, canonical_url: canonicalUrl, minInterval }, 'URL canonicalized');
  }

  const pageInfo = await getPageInfo(canonicalUrl);

  // OPTIMIZATION 1: Check cooldown if minInterval specified
  if (minInterval && minInterval > 0 && pageInfo) {
    const cooldownStatus = await checkCooldown(pageInfo.id, minInterval);

    if (cooldownStatus.inCooldown) {
      if (logger) {
        logger.info(
          {
            canonical_url: canonicalUrl,
            last_checked_at: cooldownStatus.lastCheckedAt?.toISOString(),
            cooldown_window_ms: minInterval * 60 * 1000,
          },
          'COOLDOWN_CACHE_HIT',
        );
      }

      // Validation: Ensure isolation_fingerprint exists and last_result is not null
      const hasIntegrity = pageInfo.isolationFingerprint !== null && cooldownStatus.lastResult !== null;
      if (!hasIntegrity && logger) {
        logger.warn({ canonical_url: canonicalUrl }, 'COOLDOWN_CACHE_INTEGRITY_WARNING');
      }

      // Drift Surface: If previous isolation_drift_detected was true
      const previousDrift = cooldownStatus.lastResult?.isolation_drift === true;
      if (previousDrift && logger) {
        logger.warn({ canonical_url: canonicalUrl }, 'COOLDOWN_AFTER_ISOLATION_DRIFT');
      }

      // Record hit for metrics
      await recordCooldownHit(pageInfo.id, !hasIntegrity, previousDrift);

      // Return cached result if available, otherwise generic skip response
      return {
        status: 'skipped',
        reason: 'Cooldown active',
        last_checked: cooldownStatus.lastCheckedAt?.toISOString(),
        result: cooldownStatus.lastResult ?? undefined,
      };
    }
  }

  const previousFingerprint = pageInfo?.isolationFingerprint ?? null;

  // Fetch and process page
  const rawHtml = await fetchPage(canonicalUrl);

  // Structural Normalization Layer
  const cleanedHtml = normalizeHtml(rawHtml);

  // Content Isolation Layer
  const isolationResult = extractMainContent(cleanedHtml);
  const isolatedHtml = isolationResult.content;
  const isolationStatus = isolationResult.usedFallback ? 'fallback' : 'success';

  const driftDetected = detectIsolationDrift(previousFingerprint, isolationResult.fingerprint);

  if (driftDetected && logger) {
    logger.warn(
      {
        previous_fingerprint: previousFingerprint,
        current_fingerprint: isolationResult.fingerprint,
        canonical_url: canonicalUrl,
      },
      'ISOLATION_CONTAINER_DRIFT_DETECTED',
    );
  }

  const normalizedContent = normalizeContent(isolatedHtml);
  const sections = extractSections(isolatedHtml);
  const contentHash = generateDateMaskedHash(normalizedContent);

  // Save using ONLY the canonical URL
  const saveResult = await savePage(canonicalUrl, normalizedContent, contentHash, sections);

  if (logger) {
    logger.debug(
      { canonical_url: canonicalUrl, pageId: saveResult.pageId, status: saveResult.status, isolationStatus },
      'Page processed',
    );
  }

  // Build the diff result
  let diffResult: DiffResult;

  if (saveResult.status === 'first_version') {
    diffResult = {
      message: 'First snapshot stored',
      content_isolation: isolationStatus,
      isolation_drift: driftDetected,
    };
  } else if (saveResult.status === 'unchanged') {
    diffResult = {
      message: 'No meaningful change detected',
      content_isolation: isolationStatus,
      isolation_drift: driftDetected,
      numeric_override_triggered: saveResult.numericOverrideTriggered,
      fuzzy_match_count: saveResult.fuzzyMatchCount,
      low_confidence_fuzzy_match_count: saveResult.lowConfidenceFuzzyMatchCount,
      fuzzy_collision_count: saveResult.fuzzyCollisionCount,
      title_rename_count: saveResult.titleRenameCount,
    };
  } else {
    const changes = saveResult.changes || [];
    const riskAnalysis = analyzeRisk(changes, sections);

    diffResult = {
      message: 'Changes detected',
      risk_level: riskAnalysis.risk_level,
      changes: riskAnalysis.changes,
      content_isolation: isolationStatus,
      isolation_drift: driftDetected,
      numeric_override_triggered: saveResult.numericOverrideTriggered,
      fuzzy_match_count: saveResult.fuzzyMatchCount,
      low_confidence_fuzzy_match_count: saveResult.lowConfidenceFuzzyMatchCount,
      fuzzy_collision_count: saveResult.fuzzyCollisionCount,
      title_rename_count: saveResult.titleRenameCount,
    };
  }

  // Cache the result for future cooldown checks
  await updatePageCache(saveResult.pageId, diffResult, isolationResult.fingerprint);

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
