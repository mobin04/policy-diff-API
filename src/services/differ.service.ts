import { Section, Change } from '../types';

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
 * Normalize text for comparison
 * Strips punctuation and extra whitespace to focus on actual content
 */
function normalizeForComparison(text: string): string {
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
 * Calculate change ratio between two strings
 * Uses simple length difference after normalization
 *
 * @returns Ratio of change (0.0 = identical, 1.0 = completely different)
 */
function calculateChangeRatio(oldText: string, newText: string): number {
  const normalizedOld = normalizeForComparison(oldText);
  const normalizedNew = normalizeForComparison(newText);

  // If identical after normalization, no change
  if (normalizedOld === normalizedNew) {
    return 0;
  }

  // Calculate based on length difference
  const oldLength = normalizedOld.length;
  const newLength = normalizedNew.length;

  if (oldLength === 0) {
    return newLength > 0 ? 1 : 0;
  }

  // Use Levenshtein-like approximation: difference in length + character changes
  // For performance, we use a simpler heuristic
  const lengthDiff = Math.abs(newLength - oldLength);

  // Count character differences (simple approximation)
  let charDiffs = 0;
  const minLen = Math.min(oldLength, newLength);
  for (let i = 0; i < minLen; i++) {
    if (normalizedOld[i] !== normalizedNew[i]) {
      charDiffs++;
    }
  }

  const totalDiff = lengthDiff + charDiffs;
  return Math.min(totalDiff / oldLength, 1.0);
}

/**
 * Check if a modification is meaningful based on change threshold
 */
function isMeaningfulChange(oldContent: string, newContent: string): boolean {
  const ratio = calculateChangeRatio(oldContent, newContent);
  return ratio >= MEANINGFUL_CHANGE_THRESHOLD;
}

/**
 * Compare old and new sections to detect changes
 *
 * Uses section hashes for fast comparison, then applies
 * meaningful change filter to reduce noise from minor edits.
 *
 * @param oldSections - Sections from previous version
 * @param newSections - Sections from current version
 * @returns Array of meaningful changes
 */
export function diffSections(oldSections: Section[], newSections: Section[]): Change[] {
  const changes: Change[] = [];

  // Build maps for O(1) lookup using both hash and content
  const oldMap = new Map(oldSections.map((s) => [s.title, s]));
  const newMap = new Map(newSections.map((s) => [s.title, s]));

  // Check for ADDED and MODIFIED
  for (const newSection of newSections) {
    const oldSection = oldMap.get(newSection.title);

    if (oldSection === undefined) {
      // Section is completely new
      changes.push({ section: newSection.title, type: 'ADDED' });
    } else if (oldSection.hash !== newSection.hash) {
      // Hash changed - check if modification is meaningful
      // This filters out minor punctuation/whitespace changes
      if (isMeaningfulChange(oldSection.content, newSection.content)) {
        changes.push({ section: newSection.title, type: 'MODIFIED' });
      }
      // If not meaningful, silently ignore the change
    }
    // If hash identical, no change - skip entirely
  }

  // Check for REMOVED sections
  for (const oldSection of oldSections) {
    if (!newMap.has(oldSection.title)) {
      changes.push({ section: oldSection.title, type: 'REMOVED' });
    }
  }

  return changes;
}
