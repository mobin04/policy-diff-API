import { detectIsolationDrift } from '../isolationStability.service';

describe('isolationStability.service', () => {
  describe('detectIsolationDrift', () => {
    it('should return false if previous fingerprint is null', () => {
      const current = 'fingerprint-123';
      expect(detectIsolationDrift(null, current)).toBe(false);
    });

    it('should return false if fingerprints are identical', () => {
      const fingerprint = 'stable-fingerprint';
      expect(detectIsolationDrift(fingerprint, fingerprint)).toBe(false);
    });

    it('should return true if fingerprints differ', () => {
      const previous = 'old-fingerprint';
      const current = 'new-fingerprint';
      expect(detectIsolationDrift(previous, current)).toBe(true);
    });
  });
});
