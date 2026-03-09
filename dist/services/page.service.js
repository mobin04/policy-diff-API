"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPage = checkPage;
exports.checkPageLegacy = checkPageLegacy;
const fetchPage_1 = require("../utils/fetchPage");
const page_repository_1 = require("../repositories/page.repository");
const cooldown_repository_1 = require("../repositories/cooldown.repository");
const normalizer_service_1 = require("./normalizer.service");
const sectionExtractor_service_1 = require("./sectionExtractor.service");
const mainContentExtractor_1 = require("../utils/mainContentExtractor");
const hash_service_1 = require("./hash.service");
const canonicalizeUrl_1 = require("../utils/canonicalizeUrl");
const riskEngine_service_1 = require("./riskEngine.service");
const isolationStability_service_1 = require("./isolationStability.service");
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
async function checkPage(rawUrl, options = {}) {
    const { minInterval, logger } = options;
    // CRITICAL: Canonicalize URL BEFORE any database operation
    const canonicalUrl = (0, canonicalizeUrl_1.canonicalizeUrl)(rawUrl);
    if (logger) {
        logger.debug({ rawUrl, canonical_url: canonicalUrl, minInterval }, 'URL canonicalized');
    }
    const pageInfo = await (0, page_repository_1.getPageInfo)(canonicalUrl);
    // OPTIMIZATION 1: Check cooldown if minInterval specified
    if (minInterval && minInterval > 0 && pageInfo) {
        const cooldownStatus = await (0, page_repository_1.checkCooldown)(pageInfo.id, minInterval);
        if (cooldownStatus.inCooldown) {
            if (logger) {
                logger.info({
                    canonical_url: canonicalUrl,
                    last_checked_at: cooldownStatus.lastCheckedAt?.toISOString(),
                    cooldown_window_ms: minInterval * 60 * 1000,
                }, 'COOLDOWN_CACHE_HIT');
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
            await (0, cooldown_repository_1.recordCooldownHit)(pageInfo.id, !hasIntegrity, previousDrift);
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
    const rawHtml = await (0, fetchPage_1.fetchPage)(canonicalUrl);
    // Structural Normalization Layer
    const cleanedHtml = (0, normalizer_service_1.normalizeHtml)(rawHtml);
    // Content Isolation Layer
    const isolationResult = (0, mainContentExtractor_1.extractMainContent)(cleanedHtml);
    const isolatedHtml = isolationResult.content;
    const isolationStatus = isolationResult.usedFallback ? 'fallback' : 'success';
    const driftDetected = (0, isolationStability_service_1.detectIsolationDrift)(previousFingerprint, isolationResult.fingerprint);
    if (driftDetected && logger) {
        logger.warn({
            previous_fingerprint: previousFingerprint,
            current_fingerprint: isolationResult.fingerprint,
            canonical_url: canonicalUrl,
        }, 'ISOLATION_CONTAINER_DRIFT_DETECTED');
    }
    const normalizedContent = (0, normalizer_service_1.normalizeContent)(isolatedHtml);
    const sections = (0, sectionExtractor_service_1.extractSections)(isolatedHtml);
    const contentHash = (0, hash_service_1.generateDateMaskedHash)(normalizedContent);
    // Save using ONLY the canonical URL
    const saveResult = await (0, page_repository_1.savePage)(canonicalUrl, normalizedContent, contentHash, sections);
    if (logger) {
        logger.debug({ canonical_url: canonicalUrl, pageId: saveResult.pageId, status: saveResult.status, isolationStatus }, 'Page processed');
    }
    // Build the diff result
    let diffResult;
    if (saveResult.status === 'first_version') {
        diffResult = {
            message: 'First snapshot stored',
            content_isolation: isolationStatus,
            isolation_drift: driftDetected,
        };
    }
    else if (saveResult.status === 'unchanged') {
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
    }
    else {
        const changes = saveResult.changes || [];
        const riskAnalysis = (0, riskEngine_service_1.analyzeRisk)(changes, sections, saveResult.oldSections);
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
    await (0, page_repository_1.updatePageCache)(saveResult.pageId, diffResult, isolationResult.fingerprint);
    return {
        status: 'processed',
        result: diffResult,
    };
}
/**
 * Legacy wrapper for backwards compatibility
 * Returns DiffResult directly instead of CheckResult
 */
async function checkPageLegacy(rawUrl, logger) {
    const result = await checkPage(rawUrl, { logger });
    return result.result ?? { message: 'Unknown status' };
}
