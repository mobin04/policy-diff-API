/**
 * Context-Aware Temporal Noise Masking (V2)
 *
 * Deterministically replaces date patterns with a constant token __DATE_TOKEN__
 * only if they appear within a 5-word window of anchor keywords.
 *
 * This version supports multi-format detection and explicitly protects
 * version numbers (e.g., 2.2.0, v1.3) from being masked.
 */

const DATE_TOKEN = '__DATE_TOKEN__';

const ANCHOR_KEYWORDS = [
  'updated',
  'last updated',
  'revised',
  'effective',
  'published',
  'modified',
  'date',
];

const VERSION_WHITELIST = [
  /\b\d+\.\d+\.\d+\b/gi,
  /\bv\d+\.\d+\b/gi,
  /\bversion\s+\d+\.\d+\b/gi,
];

// Composite Regex covering ISO, Alpha month formats, and Numeric formats
const DATE_PATTERNS = [
  // ISO: YYYY-MM-DD
  /\b\d{4}-\d{2}-\d{2}\b/gi,
  // Alpha: March 1, 2026 or Mar 1st, 2026
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/gi,
  // Numeric: DD/MM/YYYY or DD-MM-YYYY
  /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/gi,
];

/**
 * Checks if a detected date match is actually a protected version number.
 */
function isProtectedVersion(text: string, start: number, end: number): boolean {
  for (const pattern of VERSION_WHITELIST) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;
      // If there's any overlap, it's protected
      if (start < matchEnd && end > matchStart) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks if any anchor keyword exists within a 5-word radius of the date match.
 */
function isNearAnchor(text: string, matchStart: number, matchEnd: number): boolean {
  // Get text before and after the match
  const beforeText = text.slice(0, matchStart);
  const afterText = text.slice(matchEnd);

  // Tokenize using whitespace, filtering out empty tokens
  const beforeTokens = beforeText.trim().split(/\s+/).filter(Boolean).slice(-5);
  const afterTokens = afterText.trim().split(/\s+/).filter(Boolean).slice(0, 5);

  // Re-join to search for keywords in the context of the window
  const beforeContext = beforeTokens.join(' ').toLowerCase();
  const afterContext = afterTokens.join(' ').toLowerCase();

  for (const anchor of ANCHOR_KEYWORDS) {
    const anchorLower = anchor.toLowerCase();
    
    // Check if anchor exists in beforeContext or afterContext
    // Use word boundaries for single-word anchors to avoid partial matches
    if (!anchorLower.includes(' ')) {
      const regex = new RegExp(`\\b${anchorLower}\\b`, 'i');
      if (regex.test(beforeContext) || regex.test(afterContext)) {
        return true;
      }
    } else {
      // Multi-word anchors
      if (beforeContext.includes(anchorLower) || afterContext.includes(anchorLower)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Mask temporal noise while preserving context and protecting versions.
 */
export function maskTemporalNoise(input: string): string {
  if (!input) return input;

  let result = input;
  const matches: { start: number; end: number; length: number }[] = [];

  // Collect all potential date matches
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(input)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        length: match[0].length,
      });
    }
  }

  // Sort matches by start position descending to replace without shifting indices
  matches.sort((a, b) => b.start - a.start);

  // Remove overlapping matches (if any from different patterns)
  const uniqueMatches: typeof matches = [];
  let lastStart = Infinity;
  for (const m of matches) {
    if (m.end <= lastStart) {
      uniqueMatches.push(m);
      lastStart = m.start;
    }
  }

  for (const match of uniqueMatches) {
    // 1. Version Protection
    if (isProtectedVersion(input, match.start, match.end)) {
      continue;
    }

    // 2. Context-Aware Scoping
    if (isNearAnchor(input, match.start, match.end)) {
      result = result.slice(0, match.start) + DATE_TOKEN + result.slice(match.end);
    }
  }

  return result;
}
