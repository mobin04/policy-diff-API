import { createMonitorBatch } from '../monitorBatch.service';
import { DB } from '../../db';
import { canonicalizeUrl } from '../../utils/canonicalizeUrl';
import * as monitorBatchRepository from '../../repositories/monitorBatch.repository';
import * as monitorJobRepository from '../../repositories/monitorJob.repository';
import * as apiKeyRepository from '../../repositories/apiKey.repository';
import * as idempotencyRepository from '../../repositories/idempotency.repository';
import * as pageRepository from '../../repositories/page.repository';
import * as usageService from '../usage.service';
import * as monitorJobService from '../monitorJob.service';
import { BadRequestError, TooManyRequestsError } from '../../errors';

jest.mock('../../db');
jest.mock('../../utils/canonicalizeUrl');
jest.mock('../../repositories/monitorBatch.repository');
jest.mock('../../repositories/monitorJob.repository');
jest.mock('../../repositories/apiKey.repository');
jest.mock('../../repositories/idempotency.repository');
jest.mock('../../repositories/page.repository');
jest.mock('../usage.service');
jest.mock('../monitorJob.service');

describe('MonitorBatchService', () => {
  const mockApiKeyId = 1;
  const mockUrls = ['https://a.com', 'https://b.com'];
  const mockBatchId = 'batch-123';

  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    (monitorJobService.canAcceptNewJobs as jest.Mock).mockReturnValue(true);
    (monitorJobService.enqueueMonitorJobProcessing as jest.Mock).mockReturnValue(undefined);

    mockClient = {
      query: jest.fn().mockImplementation((sql) => {
        if (sql.includes('SELECT id FROM pages')) return { rows: [] };
        if (sql.includes('SELECT 1 FROM monitor_jobs')) return { rows: [] };
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    (DB.connect as jest.Mock).mockResolvedValue(mockClient);
    (canonicalizeUrl as jest.Mock).mockImplementation((url) => url + '/');
    (usageService.loadUsageRowForUpdate as jest.Mock).mockResolvedValue({
      tier: 'FREE',
      monthly_usage: 0,
      monthly_quota: 100,
    });
    (usageService.consumeJobsWithClient as jest.Mock).mockResolvedValue({
      tier: 'FREE',
      monthlyUsage: 2,
      monthlyQuota: 100,
      remaining: 98,
    });
    (apiKeyRepository.countDistinctUrlsForKey as jest.Mock).mockResolvedValue(0);
    (monitorBatchRepository.createBatch as jest.Mock).mockResolvedValue({ id: mockBatchId });
    (pageRepository.ensurePageExists as jest.Mock).mockResolvedValue(1);
    (monitorJobRepository.createJob as jest.Mock).mockResolvedValue({ id: 'j', status: 'PENDING' });
  });

  describe('createMonitorBatch', () => {
    describe('happy path', () => {
      test('should create batch successfully', async () => {
        const result = await createMonitorBatch(mockApiKeyId, mockUrls);

        expect(result.batch_id).toBe(mockBatchId);
        expect(result.total_jobs).toBe(2);
        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      });

      test('should deduplicate URLs by canonical identity', async () => {
        const urls = ['https://a.com', 'https://a.com/', 'HTTPS://A.COM'];
        (canonicalizeUrl as jest.Mock).mockReturnValue('https://a.com/');

        const result = await createMonitorBatch(mockApiKeyId, urls);
        expect(result.total_jobs).toBe(1);
      });

      test('should store idempotency record if provided', async () => {
        const idempotency = { key: 'k', requestHash: 'h' };
        await createMonitorBatch(mockApiKeyId, mockUrls, undefined, idempotency);

        expect(idempotencyRepository.saveIdempotencyRecord).toHaveBeenCalled();
      });
    });

    describe('failure scenarios & edge cases', () => {
      test('should throw BadRequestError for empty urls', async () => {
        await expect(createMonitorBatch(mockApiKeyId, [])).rejects.toThrow(BadRequestError);
      });

      test('should throw TooManyRequestsError if server is overloaded', async () => {
        (monitorJobService.canAcceptNewJobs as jest.Mock).mockReturnValue(false);

        await expect(createMonitorBatch(mockApiKeyId, mockUrls)).rejects.toThrow(TooManyRequestsError);
      });

      test('should rollback transaction on error', async () => {
        (monitorBatchRepository.createBatch as jest.Mock).mockRejectedValue(new Error('CRASH'));

        await expect(createMonitorBatch(mockApiKeyId, mockUrls)).rejects.toThrow('CRASH');

        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      });
    });
  });
});
