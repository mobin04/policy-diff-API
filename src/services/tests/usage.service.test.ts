import { consumeJobs, consumeJobsWithClient, getUsageSnapshot, loadUsageRowForUpdate } from '../usage.service';
import { DB } from '../../db';
import { QuotaExceededError, BatchLimitExceededError } from '../../errors';

jest.mock('../../db');

describe('UsageService', () => {
  const mockApiKeyId = 1;
  const mockUsageRow = {
    id: mockApiKeyId,
    tier: 'FREE' as const,
    monthly_quota: 100,
    monthly_usage: 10,
    quota_reset_at: new Date('2099-01-01')
  };

  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    (DB.connect as jest.Mock).mockResolvedValue(mockClient);
  });

  describe('loadUsageRowForUpdate', () => {
    test('should load row and not reset if quota_reset_at is in future', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [mockUsageRow] });
      
      const row = await loadUsageRowForUpdate(mockClient, mockApiKeyId);
      
      expect(row).toEqual(mockUsageRow);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'), [mockApiKeyId]);
      expect(mockClient.query).toHaveBeenCalledTimes(1);
    });

    test('should reset usage and update quota_reset_at if expired', async () => {
      const expiredRow = { ...mockUsageRow, quota_reset_at: new Date('2020-01-01') };
      mockClient.query.mockResolvedValueOnce({ rows: [expiredRow] });
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // UPDATE call

      const row = await loadUsageRowForUpdate(mockClient, mockApiKeyId);
      
      expect(row.monthly_usage).toBe(0);
      expect(row.quota_reset_at.getTime()).toBeGreaterThan(Date.now());
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE'), expect.any(Array));
    });

    test('should throw error if API key not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      await expect(loadUsageRowForUpdate(mockClient, mockApiKeyId)).rejects.toThrow('API key not found');
    });
  });

  describe('consumeJobs', () => {
    test('should consume jobs and return snapshot', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [mockUsageRow] }); // SELECT
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // UPDATE
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const snapshot = await consumeJobs(mockApiKeyId, 5);

      expect(snapshot.monthlyUsage).toBe(15);
      expect(snapshot.remaining).toBe(85);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE'), [mockApiKeyId, 15]);
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should throw BatchLimitExceededError if limit enforced', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [mockUsageRow] }); // SELECT

      await expect(consumeJobs(mockApiKeyId, 10, { enforceBatchLimit: true }))
        .rejects.toThrow(BatchLimitExceededError);
      
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should throw QuotaExceededError if quota reached', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [mockUsageRow] }); // SELECT

      await expect(consumeJobs(mockApiKeyId, 91)).rejects.toThrow(QuotaExceededError);
    });

    test('should rollback on error', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClient.query.mockRejectedValue(new Error('TRANS_FAIL'));

      await expect(consumeJobs(mockApiKeyId, 1)).rejects.toThrow('TRANS_FAIL');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
    });

    describe('consumeJobsWithClient', () => {
    test('should consume jobs using provided client', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [mockUsageRow] }); // SELECT
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // UPDATE

      const snapshot = await consumeJobsWithClient(mockClient, mockApiKeyId, 5);

      expect(snapshot.monthlyUsage).toBe(15);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE'), [mockApiKeyId, 15]);
      // Client should not be released by the service
      expect(mockClient.release).not.toHaveBeenCalled();
    });
    });

    describe('getUsageSnapshot', () => {

    test('should return current usage without consuming', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [mockUsageRow] }); // SELECT
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

      const snapshot = await getUsageSnapshot(mockApiKeyId);
      
      expect(snapshot.monthlyUsage).toBe(10);
      expect(snapshot.remaining).toBe(90);
    });
  });
});
