import { generateDateMaskedHash } from '../hash.service';

/**
 * Hash Service Unit Tests
 */

describe('HashService', () => {
  describe('happy path', () => {
    test('should generate a valid SHA-256 hex hash', () => {
      const content = 'test content';
      const hash = generateDateMaskedHash(content);
      // SHA-256 hex hash is 64 characters long
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('deterministic behavior guarantees', () => {
    test('should return the same hash for the same input multiple times', () => {
      const content = 'consistent content';
      const hash1 = generateDateMaskedHash(content);
      const hash2 = generateDateMaskedHash(content);
      const hash3 = generateDateMaskedHash(content);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    test('should return different hashes for different inputs', () => {
      const content1 = 'content 1';
      const content2 = 'content 2';
      const hash1 = generateDateMaskedHash(content1);
      const hash2 = generateDateMaskedHash(content2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('edge cases', () => {
    test('should handle empty string', () => {
      const hash = generateDateMaskedHash('');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      // Expected SHA-256 for empty string:
      // e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    test('should be sensitive to whitespace', () => {
      const content1 = 'content';
      const content2 = ' content ';
      const hash1 = generateDateMaskedHash(content1);
      const hash2 = generateDateMaskedHash(content2);

      expect(hash1).not.toBe(hash2);
    });

    test('should be sensitive to case', () => {
      const content1 = 'Content';
      const content2 = 'content';
      const hash1 = generateDateMaskedHash(content1);
      const hash2 = generateDateMaskedHash(content2);

      expect(hash1).not.toBe(hash2);
    });

    test('should handle very large content', () => {
      const largeContent = 'a'.repeat(1024 * 1024); // 1MB
      const hash = generateDateMaskedHash(largeContent);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should handle special characters and emojis', () => {
      const content = '🚀 PolicyDiff $100 & More!';
      const hash = generateDateMaskedHash(content);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
