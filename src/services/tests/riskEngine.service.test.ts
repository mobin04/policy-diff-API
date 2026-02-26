import { analyzeRisk } from '../riskEngine.service';
import { Change, Section } from '../../types';

describe('RiskEngineService', () => {
  const mockSections: Section[] = [
    { title: 'Privacy', content: 'We share data with third party affiliates.', hash: 'h1' },
    { title: 'Billing', content: 'Subscription renewal is automatic.', hash: 'h2' },
    { title: 'Intro', content: 'Welcome to our service.', hash: 'h3' },
    { title: 'Data Rights', content: 'You can request biometric data deletion.', hash: 'h4' }
  ];

  describe('happy path', () => {
    test('should classify ADDED change with low risk content as LOW', () => {
      const changes: Change[] = [{ type: 'ADDED', section: 'Intro' }];
      const result = analyzeRisk(changes, mockSections);

      expect(result.risk_level).toBe('LOW');
      expect(result.changes[0].risk).toBe('LOW');
      expect(result.changes[0].reason).toBe('Minor wording change');
    });

    test('should classify MODIFIED change with high risk keyword as HIGH', () => {
      const changes: Change[] = [{ type: 'MODIFIED', section: 'Privacy', details: [] }];
      const result = analyzeRisk(changes, mockSections);

      expect(result.risk_level).toBe('HIGH');
      expect(result.changes[0].risk).toBe('HIGH');
      expect(result.changes[0].reason).toContain('High risk keyword');
    });

    test('should classify MODIFIED change with medium risk keyword as MEDIUM', () => {
      const changes: Change[] = [{ type: 'MODIFIED', section: 'Billing', details: [] }];
      const result = analyzeRisk(changes, mockSections);

      expect(result.risk_level).toBe('MEDIUM');
      expect(result.changes[0].risk).toBe('MEDIUM');
      expect(result.changes[0].reason).toContain('Medium risk keyword');
    });
  });

  describe('failure scenarios & edge cases', () => {
    test('should handle empty changes array', () => {
      const result = analyzeRisk([], []);
      expect(result.risk_level).toBe('LOW');
      expect(result.changes).toHaveLength(0);
    });

    test('should return LOW risk if section is not found in newSections (fallback)', () => {
      const changes: Change[] = [{ type: 'ADDED', section: 'Missing' }];
      const result = analyzeRisk(changes, []);

      expect(result.changes[0].risk).toBe('LOW');
    });

    test('should detect high risk keywords regardless of case', () => {
      const sections: Section[] = [{ title: 'X', content: 'WE SELL DATA', hash: 'h' }];
      const changes: Change[] = [{ type: 'ADDED', section: 'X' }];
      const result = analyzeRisk(changes, sections);

      expect(result.changes[0].risk).toBe('HIGH');
    });

    test('should prioritize HIGH over MEDIUM risk in multiple changes', () => {
      const changes: Change[] = [
        { type: 'MODIFIED', section: 'Billing', details: [] }, // MEDIUM
        { type: 'MODIFIED', section: 'Privacy', details: [] }  // HIGH
      ];
      const result = analyzeRisk(changes, mockSections);

      expect(result.risk_level).toBe('HIGH');
    });
  });

  describe('DELETED changes', () => {
    test('should classify DELETED high-risk title as HIGH', () => {
      const changes: Change[] = [{ type: 'DELETED', section: 'Privacy Policy' }];
      const result = analyzeRisk(changes, []);

      expect(result.changes[0].risk).toBe('HIGH');
      expect(result.changes[0].reason).toBe('Critical section removed');
    });

    test('should classify DELETED low-risk title as LOW', () => {
      const changes: Change[] = [{ type: 'DELETED', section: 'Introduction' }];
      const result = analyzeRisk(changes, []);

      expect(result.changes[0].risk).toBe('LOW');
      expect(result.changes[0].reason).toBe('Low-impact informational section removed');
    });

    test('should classify DELETED unknown title as MEDIUM', () => {
      const changes: Change[] = [{ type: 'DELETED', section: 'Arbitrary Section' }];
      const result = analyzeRisk(changes, []);

      expect(result.changes[0].risk).toBe('MEDIUM');
      expect(result.changes[0].reason).toBe('Section removed');
    });

    test('should use normalized title for low risk detection', () => {
      const changes: Change[] = [{ type: 'DELETED', section: '  IntroDUCtion... ' }];
      const result = analyzeRisk(changes, []);

      expect(result.changes[0].risk).toBe('LOW');
    });
  });

  describe('TITLE_RENAMED changes', () => {
    test('should always classify TITLE_RENAMED as LOW risk', () => {
      const changes: Change[] = [{
        type: 'TITLE_RENAMED',
        oldTitle: 'Old',
        newTitle: 'New',
        contentHash: 'h'
      }];
      const result = analyzeRisk(changes, []);

      expect(result.changes[0].risk).toBe('LOW');
      expect(result.changes[0].reason).toBe('Section title renamed with identical content');
    });
  });

  describe('deterministic behavior guarantees', () => {
    test('multiple calls with same input return identical risk evaluation', () => {
      const changes: Change[] = [{ type: 'MODIFIED', section: 'Privacy', details: [] }];
      const res1 = analyzeRisk(changes, mockSections);
      const res2 = analyzeRisk(changes, mockSections);

      expect(res1).toEqual(res2);
    });
  });

  describe('comprehensive keyword checks', () => {
    test.each([
      ['share data', 'HIGH'],
      ['sell data', 'HIGH'],
      ['biometric', 'HIGH'],
      ['gps', 'HIGH'],
      ['sole discretion', 'HIGH'],
      ['analytics', 'MEDIUM'],
      ['cookies', 'MEDIUM'],
      ['governing law', 'MEDIUM'],
      ['force majeure', 'MEDIUM']
    ])('should detect %s as %s risk', (keyword, expectedRisk) => {
      const sections: Section[] = [{ title: 'S', content: `Some text with ${keyword} in it`, hash: 'h' }];
      const changes: Change[] = [{ type: 'ADDED', section: 'S' }];
      const result = analyzeRisk(changes, sections);
      expect(result.changes[0].risk).toBe(expectedRisk);
    });
  });
});
