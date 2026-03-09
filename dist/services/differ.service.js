"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeText = normalizeText;
exports.diffSections = diffSections;
const diff_1 = require("diff");
const fast_levenshtein_1 = __importDefault(require("fast-levenshtein"));
const numericParser_1 = require("../utils/numericParser");
/**
 * WHY SMALL-CHANGE THRESHOLD REDUCES NOISE:
 * - Minor punctuation/whitespace changes don't affect meaning
 * - Reduces false positives from formatting changes
 * - Users only see meaningful policy changes
 * - Prevents alert fatigue from trivial updates
 */
/** Minimum change ratio to consider a modification meaningful */
const MEANINGFUL_CHANGE_THRESHOLD = 0.05; // 5%
/**
 * Threshold for fuzzy title matching to prevent DELETED + ADDED misclassification
 * when titles are slightly reworded.
 */
const TITLE_SIMILARITY_THRESHOLD = 0.85;
/**
 * Normalize text for comparison
 * Strips punctuation and extra whitespace to focus on actual content
 */
function normalizeText(text) {
    return (text
        .toLowerCase()
        // Remove punctuation
        .replace(/[.,!?;:"'()\[\]{}\-–—]/g, '')
        // Collapse whitespace
        .replace(/\s+/g, ' ')
        .trim());
}
/**
 * Calculate similarity between two titles using Levenshtein distance
 *
 * @returns Similarity score between 0 and 1
 */
function calculateTitleSimilarity(a, b) {
    const normalizedA = normalizeText(a);
    const normalizedB = normalizeText(b);
    if (normalizedA.length === 0 && normalizedB.length === 0) {
        return 1;
    }
    const distance = fast_levenshtein_1.default.get(normalizedA, normalizedB);
    const maxLength = Math.max(normalizedA.length, normalizedB.length);
    if (maxLength === 0) {
        return 1;
    }
    return 1 - distance / maxLength;
}
/**
 * Calculate change ratio and return diff parts between two strings
 * Uses word-based Myers diff algorithm using diff library.
 * Improves insertion/deletion accuracy and prevents false high ratios from character shifting.
 *
 * @returns Object with ratio of change and the diff parts
 */
function calculateChangeRatio(oldText, newText) {
    const normalizedOld = normalizeText(oldText);
    const normalizedNew = normalizeText(newText);
    if (normalizedOld.length === 0) {
        return { ratio: 1, diff: [{ value: normalizedNew, added: true, removed: false, count: 1 }] };
    }
    const diff = (0, diff_1.diffWords)(normalizedOld, normalizedNew);
    let changedCharacters = 0;
    for (const part of diff) {
        if (part.added || part.removed) {
            changedCharacters += part.value.length;
        }
    }
    const ratio = changedCharacters / normalizedOld.length;
    return {
        ratio: Math.min(1, ratio),
        diff,
    };
}
/**
 * Check if a modification is meaningful and return diff parts if so.
 * Implements a refined override for numeric changes to ensure high-impact numeric updates
 * are always flagged while ignoring formatting, currency shifts, and version numbers.
 *
 * Deterministic index-based comparison:
 * - Trigger ONLY when length of numeric values changes OR any numericValue at same index differs.
 */
function getMeaningfulChange(oldContent, newContent, context) {
    const { ratio, diff } = calculateChangeRatio(oldContent, newContent);
    const oldTokens = (0, numericParser_1.extractNumericTokens)(oldContent);
    const newTokens = (0, numericParser_1.extractNumericTokens)(newContent);
    // Compare normalized numericValue arrays using index-based comparison
    const numericChangeDetected = oldTokens.length !== newTokens.length ||
        oldTokens.some((token, i) => token.numericValue !== newTokens[i].numericValue);
    if (numericChangeDetected) {
        if (context?.logger) {
            context.logger.info({
                canonical_url: context.url,
                section_title: context.title,
                previous_values: oldTokens.map((t) => t.numericValue),
                new_values: newTokens.map((t) => t.numericValue),
            }, 'NUMERIC_OVERRIDE_TRIGGERED');
        }
        return { isMeaningful: true, diff, numericOverrideTriggered: true };
    }
    if (ratio >= MEANINGFUL_CHANGE_THRESHOLD) {
        return { isMeaningful: true, diff };
    }
    return { isMeaningful: false };
}
/**
 * Compare old and new sections to detect changes
 *
 * Uses section hashes for fast comparison, then applies
 * meaningful change filter to reduce noise from minor edits.
 *
 * Implements deterministic fuzzy section title matching to prevent
 * minor title edits from being classified as DELETED + ADDED.
 *
 * Implements Pass 3B for deterministic title rename detection via exact
 * content hash match.
 *
 * @param oldSections - Sections from previous version
 * @param newSections - Sections from current version
 * @param context - Optional context including url and logger for telemetry
 * @returns Array of meaningful changes with instrumentation metadata
 */
function diffSections(oldSections, newSections, context) {
    const changes = [];
    const metadata = {
        fuzzy_match_count: 0,
        low_confidence_fuzzy_match_count: 0,
        fuzzy_collision_count: 0,
        title_rename_count: 0,
    };
    let anyNumericOverride = false;
    // Tracks which old sections are still available for matching
    const unmatchedOldSections = new Map(oldSections.map((s) => [s.title, s]));
    const pendingNewSections = [];
    // PASS 1: Exact Title Matching
    for (const newSection of newSections) {
        const oldSection = unmatchedOldSections.get(newSection.title);
        if (oldSection) {
            unmatchedOldSections.delete(newSection.title);
            if (oldSection.hash !== newSection.hash) {
                // Hash changed - check if modification is meaningful
                const meaningfulChange = getMeaningfulChange(oldSection.content, newSection.content, {
                    url: context?.url || 'unknown',
                    title: newSection.title,
                    logger: context?.logger,
                });
                if (meaningfulChange.isMeaningful && meaningfulChange.diff) {
                    if (meaningfulChange.numericOverrideTriggered) {
                        anyNumericOverride = true;
                    }
                    const details = meaningfulChange.diff.map((part) => ({
                        value: part.value,
                        added: part.added === true,
                        removed: part.removed === true,
                    }));
                    changes.push({
                        section: newSection.title,
                        type: 'MODIFIED',
                        details,
                    });
                }
            }
            // If hash identical, no change - skip entirely
        }
        else {
            pendingNewSections.push(newSection);
        }
    }
    // PASS 2: Fuzzy Title Matching for remaining new sections
    const remainingAfterFuzzy = [];
    for (const newSection of pendingNewSections) {
        let bestMatchTitle = null;
        let bestScore = 0;
        const candidates = [];
        // Find all matches exceeding threshold
        for (const [oldTitle] of unmatchedOldSections) {
            const score = calculateTitleSimilarity(newSection.title, oldTitle);
            if (score >= TITLE_SIMILARITY_THRESHOLD) {
                candidates.push({ title: oldTitle, score });
                if (score > bestScore) {
                    bestScore = score;
                    bestMatchTitle = oldTitle;
                }
            }
        }
        if (bestMatchTitle) {
            metadata.fuzzy_match_count++;
            // STEP 1: Instrument Fuzzy Match Score (low confidence logging)
            if (bestScore >= 0.85 && bestScore < 0.9) {
                metadata.low_confidence_fuzzy_match_count++;
                if (context?.logger) {
                    context.logger.info({
                        old_title: bestMatchTitle,
                        new_title: newSection.title,
                        similarity_score: bestScore,
                    }, 'LOW_CONFIDENCE_FUZZY_MATCH');
                }
            }
            // STEP 2: Detect Multiple Candidates (collision detection)
            if (candidates.length > 1) {
                metadata.fuzzy_collision_count++;
                if (context?.logger) {
                    context.logger.info({
                        new_title: newSection.title,
                        candidate_titles: candidates.map((c) => c.title),
                        candidate_scores: candidates.map((c) => c.score),
                    }, 'FUZZY_MATCH_COLLISION_DETECTED');
                }
            }
            const oldSection = unmatchedOldSections.get(bestMatchTitle);
            unmatchedOldSections.delete(bestMatchTitle);
            // Similarity threshold met -> check content
            if (oldSection.hash !== newSection.hash) {
                const meaningfulChange = getMeaningfulChange(oldSection.content, newSection.content, {
                    url: context?.url || 'unknown',
                    title: newSection.title,
                    logger: context?.logger,
                });
                if (meaningfulChange.isMeaningful && meaningfulChange.diff) {
                    if (meaningfulChange.numericOverrideTriggered) {
                        anyNumericOverride = true;
                    }
                    const details = meaningfulChange.diff.map((part) => ({
                        value: part.value,
                        added: part.added === true,
                        removed: part.removed === true,
                    }));
                    changes.push({
                        section: newSection.title,
                        type: 'MODIFIED',
                        details,
                    });
                }
            }
            // If hash identical or change not meaningful, treat as no change
        }
        else {
            // No fuzzy match found -> move to next pass
            remainingAfterFuzzy.push(newSection);
        }
    }
    // PASS 3B: CONTENT HASH MATCH (Rename Detection)
    const remainingAfterHash = [];
    for (const newSection of remainingAfterFuzzy) {
        let matchedOldTitle = null;
        // Search for exact content hash match among remaining old sections
        for (const [oldTitle, oldSection] of unmatchedOldSections) {
            if (oldSection.hash === newSection.hash) {
                matchedOldTitle = oldTitle;
                break;
            }
        }
        if (matchedOldTitle) {
            metadata.title_rename_count++;
            if (context?.logger) {
                context.logger.info({
                    previous_title: matchedOldTitle,
                    new_title: newSection.title,
                }, 'SECTION_TITLE_RENAMED');
            }
            unmatchedOldSections.delete(matchedOldTitle);
            changes.push({
                type: 'TITLE_RENAMED',
                oldTitle: matchedOldTitle,
                newTitle: newSection.title,
                contentHash: newSection.hash,
            });
        }
        else {
            remainingAfterHash.push(newSection);
        }
    }
    // FINAL PASS: Classify remaining as ADDED or DELETED
    for (const newSection of remainingAfterHash) {
        changes.push({ section: newSection.title, type: 'ADDED' });
    }
    // Remaining unmatched old sections -> DELETED
    for (const [oldTitle] of unmatchedOldSections) {
        changes.push({ section: oldTitle, type: 'DELETED' });
    }
    // Use a type-safe intersection to return all metadata
    const resultsWithMetadata = changes;
    resultsWithMetadata.numeric_override_triggered = anyNumericOverride;
    resultsWithMetadata.fuzzy_match_count = metadata.fuzzy_match_count;
    resultsWithMetadata.low_confidence_fuzzy_match_count = metadata.low_confidence_fuzzy_match_count;
    resultsWithMetadata.fuzzy_collision_count = metadata.fuzzy_collision_count;
    resultsWithMetadata.title_rename_count = metadata.title_rename_count;
    return resultsWithMetadata;
}
