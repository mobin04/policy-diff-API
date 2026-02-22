import crypto from 'crypto';

/**
 * Deterministically generates a SHA-256 hash of the content.
 *
 * This ensures that a section or page is only marked as "MODIFIED"
 * when substantive content changes, while still storing and
 * displaying the original, unmasked content.
 *
 * @param content - Content for hashing (already date-masked during normalization)
 * @returns SHA-256 hash of the content
 */
export function generateDateMaskedHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}
