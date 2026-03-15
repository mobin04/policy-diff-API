import { trackJobPolling, trackErrorRate, recordAbuseEvent } from '../requestAbuse.service';
import { DB } from '../../db';

// Mock DB
jest.mock('../../db', () => ({
  DB: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  },
}));

describe('Request Abuse Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // We cannot easily reset the internal private SlidingWindowCounter instances
    // without exporting them or adding a reset method.
    // For testing purposes, we'll use unique keys.
  });

  describe('SlidingWindowCounter', () => {
    test('should detect high frequency job polling', () => {
      const apiKeyId = 999;
      const jobId = 'test-job-uuid';
      const key = `${apiKeyId}:${jobId}`;

      // Threshold is 20. Record 20 times.
      for (let i = 0; i < 20; i++) {
        expect(trackJobPolling(apiKeyId, jobId)).toBe(false);
      }

      // 21st time should return true
      expect(trackJobPolling(apiKeyId, jobId)).toBe(true);
    });

    test('should detect high error rates', () => {
      const apiKeyId = 888;

      // Threshold is 10. Record 10 times.
      for (let i = 0; i < 10; i++) {
        expect(trackErrorRate(apiKeyId)).toBe(false);
      }

      // 11th time should return true
      expect(trackErrorRate(apiKeyId)).toBe(true);
    });
  });

  describe('recordAbuseEvent', () => {
    test('should record event to database', async () => {
      await recordAbuseEvent('IDEMPOTENCY_CONFLICT', 123, '127.0.0.1', { key: 'val' });

      expect(DB.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO request_abuse_events'), [
        'IDEMPOTENCY_CONFLICT',
        123,
        '127.0.0.1',
        JSON.stringify({ key: 'val' }),
      ]);
    });

    test('should handle null apiKeyId', async () => {
      await recordAbuseEvent('INVALID_INTERNAL_TOKEN_ATTEMPT', null, '192.168.1.1');

      expect(DB.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO request_abuse_events'), [
        'INVALID_INTERNAL_TOKEN_ATTEMPT',
        null,
        '192.168.1.1',
        null,
      ]);
    });
  });
});
