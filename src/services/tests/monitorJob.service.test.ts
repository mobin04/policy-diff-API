import * as monitorJobService from '../monitorJob.service';
import { DB } from '../../db';
import { canonicalizeUrl } from '../../utils/canonicalizeUrl';
import * as pageRepository from '../../repositories/page.repository';
import * as monitorJobRepository from '../../repositories/monitorJob.repository';
import * as apiKeyRepository from '../../repositories/apiKey.repository';
import * as idempotencyRepository from '../../repositories/idempotency.repository';
import * as usageService from '../usage.service';
import { QuotaExceededError } from '../../errors';

jest.mock('../../db');
jest.mock('../../utils/canonicalizeUrl');
jest.mock('../../repositories/page.repository');
jest.mock('../../repositories/monitorJob.repository');
jest.mock('../../repositories/apiKey.repository');
jest.mock('../../repositories/idempotency.repository');
jest.mock('../usage.service');

// We need to mock the module but keep createMonitorJob original
jest.mock('../monitorJob.service', () => {
  const actual = jest.requireActual('../monitorJob.service');
  return {
    ...actual,
    enqueueMonitorJobProcessing: jest.fn(),
  };
});

describe('MonitorJobService', () => {
  const mockApiKeyId = 1;
  const mockUrl = 'https://example.com';
  const mockCanonicalUrl = 'https://example.com/';
  const mockJob = { id: 'job-123', status: 'PENDING' };
  
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      query: jest.fn().mockImplementation((sql) => {
        if (sql.includes('SELECT id FROM pages')) return { rows: [] };
        if (sql.includes('SELECT 1 FROM monitor_jobs')) return { rows: [] };
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    (DB.connect as jest.Mock).mockResolvedValue(mockClient);
    (canonicalizeUrl as jest.Mock).mockReturnValue(mockCanonicalUrl);
    (usageService.consumeJobsWithClient as jest.Mock).mockResolvedValue({
      tier: 'FREE',
      monthlyUsage: 1,
      monthlyQuota: 100,
      remaining: 99
    });
    (apiKeyRepository.countDistinctUrlsForKey as jest.Mock).mockResolvedValue(0);
    (pageRepository.ensurePageExists as jest.Mock).mockResolvedValue(1);
    (monitorJobRepository.createJob as jest.Mock).mockResolvedValue(mockJob);
  });

  describe('createMonitorJob', () => {
    describe('happy path', () => {
      test('should create job successfully and enqueue for processing', async () => {
        const result = await monitorJobService.createMonitorJob(mockApiKeyId, mockUrl);

        expect(result).toEqual(mockJob);
        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
        expect(mockClient.release).toHaveBeenCalled();
        
        expect(canonicalizeUrl).toHaveBeenCalledWith(mockUrl);
        expect(usageService.consumeJobsWithClient).toHaveBeenCalled();
        expect(pageRepository.ensurePageExists).toHaveBeenCalledWith(mockCanonicalUrl, mockClient);
        expect(monitorJobRepository.createJob).toHaveBeenCalledWith(1, mockApiKeyId, null, mockClient);
      });

      test('should store idempotency if requested', async () => {
        const idem = { key: 'k', requestHash: 'h' };
        await monitorJobService.createMonitorJob(mockApiKeyId, mockUrl, undefined, idem);

        expect(idempotencyRepository.saveIdempotencyRecord).toHaveBeenCalledWith(
          mockApiKeyId,
          idem.key,
          idem.requestHash,
          { job_id: mockJob.id, status: mockJob.status },
          mockClient
        );
      });
    });

    describe('failure scenarios', () => {
      test('should throw QuotaExceededError if limit reached', async () => {
        (usageService.consumeJobsWithClient as jest.Mock).mockRejectedValue(new QuotaExceededError());

        await expect(monitorJobService.createMonitorJob(mockApiKeyId, mockUrl)).rejects.toThrow(QuotaExceededError);
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      });

      test('should rollback on error', async () => {
        (monitorJobRepository.createJob as jest.Mock).mockRejectedValue(new Error('DB_FAIL'));

        await expect(monitorJobService.createMonitorJob(mockApiKeyId, mockUrl)).rejects.toThrow('DB_FAIL');
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
      });
    });
  });
});
