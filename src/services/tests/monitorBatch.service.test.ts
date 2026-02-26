import { createMonitorBatch, getBatchStatus } from '../monitorBatch.service';
import { DB } from '../../db';
import { canonicalizeUrl } from '../../utils/canonicalizeUrl';
import * as pageRepository from '../../repositories/page.repository';
import * as monitorJobRepository from '../../repositories/monitorJob.repository';
import * as monitorBatchRepository from '../../repositories/monitorBatch.repository';
import * as idempotencyRepository from '../../repositories/idempotency.repository';
import * as monitorJobService from '../monitorJob.service';
import * as usageService from '../usage.service';
import { BadRequestError, TooManyRequestsError, BatchLimitExceededError, QuotaExceededError } from '../../errors';

jest.mock('../../db');
jest.mock('../../utils/canonicalizeUrl');
jest.mock('../../repositories/page.repository');
jest.mock('../../repositories/monitorJob.repository');
jest.mock('../../repositories/monitorBatch.repository');
jest.mock('../../repositories/idempotency.repository');
jest.mock('../monitorJob.service');
jest.mock('../usage.service');

describe('MonitorBatchService', () => {
  const mockApiKeyId = 1;
  const mockUrls = ['https://a.com', 'https://b.com'];
  const mockBatchId = 'batch-123';
  
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    (DB.connect as jest.Mock).mockResolvedValue(mockClient);
    (canonicalizeUrl as jest.Mock).mockImplementation((url) => url + '/');
    (monitorJobService.canAcceptNewJobs as jest.Mock).mockReturnValue(true);
    (usageService.loadUsageRowForUpdate as jest.Mock).mockResolvedValue({
      tier: 'FREE',
      monthly_usage: 0,
      monthly_quota: 100
    });
    (monitorBatchRepository.createBatch as jest.Mock).mockResolvedValue({ id: mockBatchId });
    (pageRepository.ensurePageExists as jest.Mock).mockResolvedValue(10);
    (monitorJobRepository.createJob as jest.Mock).mockImplementation((pageId, apiKeyId, batchId) => ({
      id: `job-${pageId}`
    }));
  });

  describe('createMonitorBatch', () => {
    describe('happy path', () => {
      test('should create batch successfully', async () => {
        const result = await createMonitorBatch(mockApiKeyId, mockUrls);

        expect(result.batch_id).toBe(mockBatchId);
        expect(result.total_jobs).toBe(2);
        expect(result.jobs).toHaveLength(2);
        
        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
        expect(mockClient.release).toHaveBeenCalled();
        
        expect(monitorJobService.enqueueMonitorJobProcessing).toHaveBeenCalledTimes(2);
      });

      test('should deduplicate URLs by canonical identity', async () => {
        const urls = ['https://a.com', 'https://a.com/'];
        (canonicalizeUrl as jest.Mock).mockReturnValue('https://a.com/');

        const result = await createMonitorBatch(mockApiKeyId, urls);

        expect(result.total_jobs).toBe(1);
        expect(monitorJobRepository.createJob).toHaveBeenCalledTimes(1);
      });

      test('should store idempotency record if provided', async () => {
        const idempotencyOptions = { key: 'idem-key', requestHash: 'hash' };
        await createMonitorBatch(mockApiKeyId, mockUrls, undefined, idempotencyOptions);

        expect(idempotencyRepository.saveIdempotencyRecord).toHaveBeenCalledWith(
          mockApiKeyId,
          idempotencyOptions.key,
          idempotencyOptions.requestHash,
          expect.any(Object),
          mockClient
        );
      });
    });

    describe('failure scenarios & edge cases', () => {
      test('should throw BadRequestError for empty urls', async () => {
        await expect(createMonitorBatch(mockApiKeyId, [])).rejects.toThrow(BadRequestError);
        await expect(createMonitorBatch(mockApiKeyId, null as any)).rejects.toThrow(BadRequestError);
      });

      test('should throw TooManyRequestsError if server is overloaded', async () => {
        (monitorJobService.canAcceptNewJobs as jest.Mock).mockReturnValue(false);
        await expect(createMonitorBatch(mockApiKeyId, mockUrls)).rejects.toThrow(TooManyRequestsError);
      });

      test('should throw BatchLimitExceededError if exceeds tier limit', async () => {
        (usageService.loadUsageRowForUpdate as jest.Mock).mockResolvedValue({
          tier: 'FREE', // limit is 5
          monthly_usage: 0,
          monthly_quota: 100
        });

        const manyUrls = Array(6).fill('http://test.com').map((u, i) => `${u}/${i}`);
        await expect(createMonitorBatch(mockApiKeyId, manyUrls)).rejects.toThrow(BatchLimitExceededError);
      });

      test('should throw QuotaExceededError if exceeds monthly quota', async () => {
        (usageService.loadUsageRowForUpdate as jest.Mock).mockResolvedValue({
          tier: 'FREE',
          monthly_usage: 99,
          monthly_quota: 100
        });

        await expect(createMonitorBatch(mockApiKeyId, mockUrls)).rejects.toThrow(QuotaExceededError);
      });

      test('should rollback transaction on error', async () => {
        (monitorBatchRepository.createBatch as jest.Mock).mockRejectedValue(new Error('CRASH'));

        await expect(createMonitorBatch(mockApiKeyId, mockUrls)).rejects.toThrow('CRASH');
        
        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
      });
    });
  });

  describe('getBatchStatus', () => {
    test('should return batch status and job list', async () => {
      (monitorBatchRepository.getBatchByIdForApiKey as jest.Mock).mockResolvedValue({
        id: mockBatchId,
        totalJobs: 2
      });
      (monitorBatchRepository.getBatchJobCounts as jest.Mock).mockResolvedValue({
        completed: 1,
        processing: 1,
        failed: 0
      });
      (monitorBatchRepository.listBatchJobs as jest.Mock).mockResolvedValue([
        { jobId: 'j1', status: 'COMPLETED' },
        { jobId: 'j2', status: 'PROCESSING' }
      ]);

      const status = await getBatchStatus(mockBatchId, mockApiKeyId);
      
      expect(status).toEqual({
        batch_id: mockBatchId,
        total: 2,
        completed: 1,
        processing: 1,
        failed: 0,
        jobs: [
          { job_id: 'j1', status: 'COMPLETED' },
          { job_id: 'j2', status: 'PROCESSING' }
        ]
      });
    });

    test('should return null if batch not found', async () => {
      (monitorBatchRepository.getBatchByIdForApiKey as jest.Mock).mockResolvedValue(null);
      const status = await getBatchStatus(mockBatchId, mockApiKeyId);
      expect(status).toBeNull();
    });
  });
});
