import { Section, Change, DiffDetail } from '../types';
import { diffWords, Change as DiffChange } from 'diff';
import levenshtein from 'fast-levenshtein';

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
 * Threshold for fuzzy title matching to prevent REMOVED + ADDED misclassification
 * when titles are slightly reworded.
 */
const TITLE_SIMILARITY_THRESHOLD = 0.85;

/**
 * Normalize text for comparison
 * Strips punctuation and extra whitespace to focus on actual content
 */
function normalizeText(text: string): string {
  return (
    text
      .toLowerCase()
      // Remove punctuation
      .replace(/[.,!?;:"'()\[\]{}\-–—]/g, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Calculate similarity between two titles using Levenshtein distance
 *
 * @returns Similarity score between 0 and 1
 */
function calculateTitleSimilarity(a: string, b: string): number {
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);

  if (normalizedA.length === 0 && normalizedB.length === 0) {
    return 1;
  }

  const distance = levenshtein.get(normalizedA, normalizedB);
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
function calculateChangeRatio(oldText: string, newText: string): { ratio: number; diff: DiffChange[] } {
  const normalizedOld = normalizeText(oldText);
  const normalizedNew = normalizeText(newText);

  if (normalizedOld.length === 0) {
    return { ratio: 1, diff: [{ value: normalizedNew, added: true, removed: false, count: 1 }] };
  }

  const diff = diffWords(normalizedOld, normalizedNew);

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
 * Check if a modification is meaningful and return diff parts if so
 */
function getMeaningfulChange(oldContent: string, newContent: string): { isMeaningful: boolean; diff?: DiffChange[] } {
  const { ratio, diff } = calculateChangeRatio(oldContent, newContent);
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
 * minor title edits from being classified as REMOVED + ADDED.
 *
 * @param oldSections - Sections from previous version
 * @param newSections - Sections from current version
 * @returns Array of meaningful changes
 */
export function diffSections(oldSections: Section[], newSections: Section[]): Change[] {
  const changes: Change[] = [];

  // Tracks which old sections are still available for matching
  const unmatchedOldSections = new Map(oldSections.map((s) => [s.title, s]));
  const pendingNewSections: Section[] = [];

  // PASS 1: Exact Title Matching
  for (const newSection of newSections) {
    const oldSection = unmatchedOldSections.get(newSection.title);

    if (oldSection) {
      unmatchedOldSections.delete(newSection.title);

      if (oldSection.hash !== newSection.hash) {
        // Hash changed - check if modification is meaningful
        const meaningfulChange = getMeaningfulChange(oldSection.content, newSection.content);

        if (meaningfulChange.isMeaningful && meaningfulChange.diff) {
          const details: DiffDetail[] = meaningfulChange.diff.map((part) => ({
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
    } else {
      pendingNewSections.push(newSection);
    }
  }

  // PASS 2: Fuzzy Title Matching for remaining new sections
  for (const newSection of pendingNewSections) {
    let bestMatchTitle: string | null = null;
    let bestScore = 0;

    // Find best match among remaining old sections
    for (const [oldTitle] of unmatchedOldSections) {
      const score = calculateTitleSimilarity(newSection.title, oldTitle);
      if (score > bestScore) {
        bestScore = score;
        bestMatchTitle = oldTitle;
      }
    }

    if (bestMatchTitle && bestScore >= TITLE_SIMILARITY_THRESHOLD) {
      const oldSection = unmatchedOldSections.get(bestMatchTitle)!;
      unmatchedOldSections.delete(bestMatchTitle);

      // Similarity threshold met -> check content
      if (oldSection.hash !== newSection.hash) {
        const meaningfulChange = getMeaningfulChange(oldSection.content, newSection.content);

        if (meaningfulChange.isMeaningful && meaningfulChange.diff) {
          const details: DiffDetail[] = meaningfulChange.diff.map((part) => ({
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
    } else {
      // No match found -> ADDED
      changes.push({ section: newSection.title, type: 'ADDED' });
    }
  }

  // Remaining unmatched old sections -> REMOVED
  for (const [oldTitle] of unmatchedOldSections) {
    changes.push({ section: oldTitle, type: 'REMOVED' });
  }

  return changes;
}
