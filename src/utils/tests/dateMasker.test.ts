import { maskTemporalNoise } from '../dateMasker';
import { generateDateMaskedHash } from '../../services/hash.service';

/**
 * Context-Aware Temporal Noise Masking Unit Tests
 *
 * These tests verify that our date masker correctly identifies dates
 * near anchor keywords (like 'updated' or 'effective') while protecting
 * version numbers, prices, and percentages.
 */

describe('Temporal Noise Masking (dateMasker)', () => {
  const DATE_TOKEN = '__DATE_TOKEN__';

  describe('Context-Aware Masking', () => {
    test('should mask dates when preceded by known anchors', () => {
      const anchors = ['Last Updated:', 'Effective Date:', 'published:', 'date:', 'Revised on'];
      const date = 'March 1, 2026';

      anchors.forEach((anchor) => {
        const input = `${anchor} ${date}`;
        expect(maskTemporalNoise(input)).toContain(DATE_TOKEN);
      });
    });

    test('should NOT mask dates without valid anchor keywords', () => {
      const noAnchor = 'Authorization expires on 2026-05-20';
      expect(maskTemporalNoise(noAnchor)).not.toContain(DATE_TOKEN);
      expect(maskTemporalNoise(noAnchor)).toContain('2026-05-20');
    });

    test('should handle multiple anchored dates in one document', () => {
      const input =
        'Effective Date: 2025-01-01. Then nothing happens until 2026-01-01, which is when something happens. Revised on May 10th, 2025.';
      const masked = maskTemporalNoise(input);

      expect(masked).toContain('Effective Date: __DATE_TOKEN__');
      expect(masked).toContain('2026-01-01'); // Unanchored
      expect(masked).toContain('Revised on __DATE_TOKEN__');
    });
  });

  describe('Non-Date Protection', () => {
    test('should protect version numbers (e.g., 2.2.0)', () => {
      const input = 'Policy Version 2.2.0 updated March 1, 2026';
      const masked = maskTemporalNoise(input);

      expect(masked).toContain('Version 2.2.0');
      expect(masked).toContain('updated __DATE_TOKEN__');
    });

    test('should protect monetary values', () => {
      const input = 'Total cost is $19.99 updated today';
      const masked = maskTemporalNoise(input);

      expect(masked).toContain('$19.99');
    });

    test('should protect percentages', () => {
      const input = 'Usage limit is 10% effective immediately';
      const masked = maskTemporalNoise(input);

      expect(masked).toContain('10%');
    });
  });

  describe('Hash Stability', () => {
    test('should produce identical hashes for date-only changes', () => {
      const d1 = 'Last Updated: March 1, 2026';
      const d2 = 'Last Updated: April 5, 2026';

      const masked1 = maskTemporalNoise(d1);
      const masked2 = maskTemporalNoise(d2);

      expect(masked1).toBe(masked2);
      expect(generateDateMaskedHash(masked1)).toBe(generateDateMaskedHash(masked2));
    });
  });

  describe('Format Support', () => {
    test('should support various date formats near anchors', () => {
      const formats = ['2024-12-01', '12/01/2024', 'May 10th, 2025', 'March 1, 2026'];

      formats.forEach((format) => {
        const input = `Updated on ${format}`;
        expect(maskTemporalNoise(input)).toBe('Updated on __DATE_TOKEN__');
      });
    });
  });
});
