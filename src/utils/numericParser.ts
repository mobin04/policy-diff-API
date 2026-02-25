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
  // ([$€£]\s?[\d.,]*\d[\d.,]*|[\d.,]*\d[\d.,]*\s?%|(?:\b|^)[\d.,]*\d[\d.,]*)
  // 1. Currency: Symbol, optional space, digits with potential dots/commas.
  // 2. Percentage: Digits with potential dots/commas, optional space, %.
  // 3. Numeric sequences: Starts at word boundary or start of string, captures digits and dots/commas.
  // We use [\d.,]*\d[\d.,]* to ensure at least one digit is present in the match.
  const NUMERIC_TOKEN_REGEX = /([$€£]\s?[\d.,]*\d[\d.,]*|[\d.,]*\d[\d.,]*\s?%|(?:\b|^)[\d.,]*\d[\d.,]*)/gi;

  const matches = text.match(NUMERIC_TOKEN_REGEX) || [];
  const results: ParsedNumericToken[] = [];

  for (const raw of matches) {
    // Ignore version numbers and tokens containing multiple dots (digit.digit.digit)
    // This also handles tokens like '..123' or '1.2.3.4' captured by the greedy regex.
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
