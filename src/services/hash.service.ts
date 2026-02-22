import crypto from 'crypto';
import { maskTemporalNoise } from '../utils/dateMasker';

/**
 * Deterministically generates a SHA-256 hash of the content after
 * masking temporal noise (dates, etc.).
 *
 * This ensures that a section or page is only marked as "MODIFIED"
 * when substantive content changes, while still storing and
 * displaying the original, unmasked content.
 *
 * @param content - Original content for hashing
 * @returns SHA-256 hash of the date-masked content
 */
export function generateDateMaskedHash(content: string): string {
  const hashInput = maskTemporalNoise(content);
  return crypto.createHash('sha256').update(hashInput).digest('hex');
}
