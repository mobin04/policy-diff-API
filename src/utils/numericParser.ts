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
  // ([$€£]\s?\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:,\d{3})*(?:\.\d+)?\s?%|\b\d+(?:,\d{3})*(?:\.\d+)?\b)
  // 1. Currency: Symbol, optional space, digits with commas, optional decimal.
  // 2. Percentage: Digits with commas, optional decimal, optional space, %.
  // 3. Standalone numbers: Digits with commas, optional decimal.
  const NUMERIC_TOKEN_REGEX = /([$€£]\s?\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:,\d{3})*(?:\.\d+)?\s?%|\b\d+(?:,\d{3})*(?:\.\d+)?\b)/gi;

  const matches = text.match(NUMERIC_TOKEN_REGEX) || [];
  const results: ParsedNumericToken[] = [];

  for (const raw of matches) {
    // Version detection rule: If token matches pattern: digit dot digit dot digit Ignore token entirely.
    // Also ignore any token containing more than one dot.
    if ((raw.match(/\./g) || []).length > 1) {
      continue;
    }

    // Normalization: Remove commas, currency symbols, and percentage symbols
    const normalized = raw
      .replace(/[,$€£%]/g, '')
      .replace(/\s+/g, '');

    const numericValue = Number(normalized);

    if (!isNaN(numericValue) && normalized !== '') {
      results.push({
        raw,
        normalized,
        numericValue,
      });
    }
  }

  return results;
}
