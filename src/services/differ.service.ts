import { Section, Change, DiffDetail } from '../types';
import { diffWords, Change as DiffChange } from 'diff';

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
 * Calculate change ratio and return diff parts between two strings
 * Uses word-based Myers diff algorithm using diff library.
 * Improves insertion/deletion accuracy and prevents false high ratios from character shifting.
 *
 * @returns Object with ratio of change and the diff parts
 */
function calculateChangeRatio(
  oldText: string,
  newText: string,
): { ratio: number; diff: DiffChange[] } {
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
function getMeaningfulChange(
  oldContent: string,
  newContent: string,
): { isMeaningful: boolean; diff?: DiffChange[] } {
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
