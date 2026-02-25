export type ParsedNumericToken = {
  raw: string;
  normalized: string;
  numericValue: number;
};

/**
 * Extracts and normalizes numeric tokens from text for deterministic comparison.
 *
 * Rules:
 * - Match integers, decimals, percentages, currency amounts.
 * - Ignore version numbers like 1.2.3 (digit dot digit dot digit).
 * - Normalize: remove commas, currency symbols, and percentage symbols.
 * - numericValue must be parsed using Number().
 *
 * @param text - The content to parse
 * @returns An array of parsed numeric tokens in their order of appearance
 */
export function extractNumericTokens(text: string): ParsedNumericToken[] {
  // Regex explanation:
  // ([$€£]\s?\d+(?:[.,]\d+)*|\d+(?:[.,]\d+)*\s?%|\b\d+(?:[.,]\d+)*\b)
  // This version uses (?:[.,]\d+)* to allow matching sequences of digits separated by dots or commas,
  // which allows us to capture version numbers like 1.2.3 in a single token for filtering.
  const NUMERIC_TOKEN_REGEX = /([$€£]\s?\d+(?:[.,]\d+)*|\d+(?:[.,]\d+)*\s?%|\b\d+(?:[.,]\d+)*\b)/gi;

  const matches = text.match(NUMERIC_TOKEN_REGEX) || [];
  const results: ParsedNumericToken[] = [];

  for (const raw of matches) {
    // Ignore version numbers and tokens containing multiple dots (digit.digit.digit)
    if ((raw.match(/\./g) || []).length > 1) {
      continue;
    }

    // Normalization: Remove commas, currency symbols, and percentage symbols
    const normalized = raw.replace(/[,$€£%]/g, '').replace(/\s+/g, '');

    const numericValue = Number(normalized);

    // Ensure we have a valid number and it's not just a standalone punctuation captured by regex
    if (!isNaN(numericValue) && normalized !== '' && normalized !== '.') {
      results.push({
        raw,
        normalized,
        numericValue,
      });
    }
  }

  return results;
}
