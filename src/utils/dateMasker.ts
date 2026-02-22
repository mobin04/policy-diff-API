/**
 * Deterministically replaces date patterns with a constant token.
 * Used to eliminate false-positive "MODIFIED" events caused solely by date changes.
 */
export function maskTemporalNoise(input: string): string {
  const DATE_TOKEN = '__DATE_MASK__';

  const monthNames =
    'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec';

  const prefixPart = '(?:Last Updated|Effective Date|Updated|Revised):\\s*';

  // 1. Month name formats: January 1, 2024, Jan 1, 2024, 1 January 2024
  const monthRegex = new RegExp(
    `(?:${prefixPart})?\\b(?:(?:${monthNames})\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})|(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${monthNames})\\s+\\d{4})\\b`,
    'gi',
  );

  // 2. ISO format: 2024-01-01
  const isoRegex = new RegExp(`(?:${prefixPart})?\\b\\d{4}-\\d{2}-\\d{2}\\b`, 'gi');

  // 3. Slash format: 01/02/2024, 1/2/24
  const slashRegex = new RegExp(`(?:${prefixPart})?\\b\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}\\b`, 'gi');

  let masked = input;

  masked = masked.replace(monthRegex, DATE_TOKEN);
  masked = masked.replace(isoRegex, DATE_TOKEN);
  masked = masked.replace(slashRegex, DATE_TOKEN);

  return masked;
}
