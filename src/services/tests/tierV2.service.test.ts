import { createMonitorJob } from '../monitorJob.service';
import { createMonitorBatch } from '../monitorBatch.service';
import * as monitorJobRepository from '../../repositories/monitorJob.repository';
import * as apiKeyRepository from '../../repositories/apiKey.repository';
import * as pageRepository from '../../repositories/page.repository';
import { DB } from '../../db';
import { QuotaExceededError, UrlLimitExceededError, BatchLimitExceededError } from '../../errors';

jest.mock('../../repositories/monitorJob.repository');
jest.mock('../../repositories/apiKey.repository');
jest.mock('../../repositories/page.repository');
jest.mock('../../db');

describe('Tier System V2 Enforcement', () => {
  const mockApiKeyId = 1;
  const mockUrl = 'https://example.com';

  beforeEach(() => {
    jest.clearAllMocks();
    (DB.connect as jest.Mock).mockResolvedValue({
      query: jest.fn(),
      release: jest.fn(),
    });
  });

  describe('URL Limit Enforcement', () => {
    test('FREE tier should not exceed 3 unique URLs', async () => {
      const mockUsage = { id: mockApiKeyId, tier: 'FREE', monthly_usage: 0, monthly_quota: 30 };

      // Mock repository calls
      (apiKeyRepository.countDistinctUrlsForKey as jest.Mock).mockResolvedValue(3);
      (DB.connect as jest.Mock).mockResolvedValue({
        query: jest.fn().mockImplementation((sql, params) => {
          if (sql.includes('FROM api_keys')) return { rows: [mockUsage] };
          if (sql.includes('SELECT id FROM pages')) return { rows: [] }; // URL not already monitored
          if (sql.includes('BEGIN') || sql.includes('COMMIT')) return {};
          return { rows: [] };
        }),
        release: jest.fn(),
      });

      await expect(createMonitorJob(mockApiKeyId, mockUrl)).rejects.toThrow(UrlLimitExceededError);
    });

    test('STARTER tier should not exceed 10 unique URLs', async () => {
      const mockUsage = { id: mockApiKeyId, tier: 'STARTER', monthly_usage: 0, monthly_quota: 500 };

      (apiKeyRepository.countDistinctUrlsForKey as jest.Mock).mockResolvedValue(10);
      (DB.connect as jest.Mock).mockResolvedValue({
        query: jest.fn().mockImplementation((sql, params) => {
          if (sql.includes('FROM api_keys')) return { rows: [mockUsage] };
          if (sql.includes('SELECT id FROM pages')) return { rows: [] };
          if (sql.includes('BEGIN') || sql.includes('COMMIT')) return {};
          return { rows: [] };
        }),
        release: jest.fn(),
      });

      await expect(createMonitorJob(mockApiKeyId, mockUrl)).rejects.toThrow(UrlLimitExceededError);
    });

    test('PRO tier should not exceed 25 unique URLs', async () => {
      const mockUsage = { id: mockApiKeyId, tier: 'PRO', monthly_usage: 0, monthly_quota: 2500 };

      (apiKeyRepository.countDistinctUrlsForKey as jest.Mock).mockResolvedValue(25);
      (DB.connect as jest.Mock).mockResolvedValue({
        query: jest.fn().mockImplementation((sql, params) => {
          if (sql.includes('FROM api_keys')) return { rows: [mockUsage] };
          if (sql.includes('SELECT id FROM pages')) return { rows: [] };
          if (sql.includes('BEGIN') || sql.includes('COMMIT')) return {};
          return { rows: [] };
        }),
        release: jest.fn(),
      });

      await expect(createMonitorJob(mockApiKeyId, mockUrl)).rejects.toThrow(UrlLimitExceededError);
    });

    test('should allow monitoring an ALREADY monitored URL even if limit reached', async () => {
      const mockUsage = { id: mockApiKeyId, tier: 'FREE', monthly_usage: 0, monthly_quota: 30 };

      (apiKeyRepository.countDistinctUrlsForKey as jest.Mock).mockResolvedValue(3);
      (DB.connect as jest.Mock).mockResolvedValue({
        query: jest.fn().mockImplementation((sql, params) => {
          if (sql.includes('FROM api_keys')) return { rows: [mockUsage] };
          if (sql.includes('SELECT id FROM pages')) return { rows: [{ id: 100 }] };
          if (sql.includes('SELECT 1 FROM monitor_jobs')) return { rows: [{ 1: 1 }] }; // Already monitored
          if (sql.includes('BEGIN') || sql.includes('COMMIT')) return {};
          if (sql.includes('UPDATE api_keys')) return { rowCount: 1 };
          return { rows: [] };
        }),
        release: jest.fn(),
      });

      (pageRepository.ensurePageExists as jest.Mock).mockResolvedValue(100);
      (monitorJobRepository.createJob as jest.Mock).mockResolvedValue({ id: 'job-1', status: 'PENDING' });

      const result = await createMonitorJob(mockApiKeyId, mockUrl);
      expect(result.id).toBe('job-1');
    });
  });

  describe('Batch Limit Enforcement', () => {
    test('FREE tier should reject more than 3 URLs', async () => {
      const mockUsage = { id: mockApiKeyId, tier: 'FREE', monthly_usage: 0, monthly_quota: 30 };
      const urls = ['http://1.com', 'http://2.com', 'http://3.com', 'http://4.com'];

      (DB.connect as jest.Mock).mockResolvedValue({
        query: jest.fn().mockImplementation((sql) => {
          if (sql.includes('FROM api_keys')) return { rows: [mockUsage] };
          if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return {};
          return { rows: [] };
        }),
        release: jest.fn(),
      });

      await expect(createMonitorBatch(mockApiKeyId, urls)).rejects.toThrow(BatchLimitExceededError);
    });

    test('PRO tier should allow 25 URLs', async () => {
      const mockUsage = { id: mockApiKeyId, tier: 'PRO', monthly_usage: 0, monthly_quota: 2500 };
      const urls = Array.from({ length: 25 }, (_, i) => `http://${i}.com`);

      (DB.connect as jest.Mock).mockResolvedValue({
        query: jest.fn().mockImplementation((sql) => {
          if (sql.includes('FROM api_keys')) return { rows: [mockUsage] };
          if (sql.includes('BEGIN') || sql.includes('COMMIT')) return {};
          if (sql.includes('UPDATE api_keys')) return { rowCount: 1 };
          if (sql.includes('INSERT INTO monitor_batches')) return { rows: [{ id: 'b1' }] };
          if (sql.includes('SELECT id FROM pages')) return { rows: [] };
          if (sql.includes('SELECT 1 FROM monitor_jobs')) return { rows: [] };
          return { rows: [] };
        }),
        release: jest.fn(),
      });

      (apiKeyRepository.countDistinctUrlsForKey as jest.Mock).mockResolvedValue(0);
      (pageRepository.ensurePageExists as jest.Mock).mockResolvedValue(1);
      (monitorJobRepository.createJob as jest.Mock).mockResolvedValue({ id: 'j', status: 'PENDING' });

      const result = await createMonitorBatch(mockApiKeyId, urls);
      expect(result.total_jobs).toBe(25);
    });
  });

  describe('Concurrency Limit Enforcement', () => {
    test('FREE tier should enforce 1 concurrent job', async () => {
      const mockUsage = { id: mockApiKeyId, tier: 'FREE' };
      const jobId = 'job-1';

      (monitorJobRepository.getJobById as jest.Mock).mockResolvedValue({
        id: jobId,
        apiKeyId: mockApiKeyId,
        pageId: 10,
      });
      (monitorJobRepository.getActiveJobCountForKey as jest.Mock).mockResolvedValue(1);

      (DB.query as jest.Mock).mockResolvedValue({ rows: [mockUsage] });

      const { processMonitorJob } = require('../monitorJob.service');
      const { acquireJob, releaseJob } = require('../../utils/concurrencyGuard');

      // Setup guard mock
      const guard = require('../../utils/concurrencyGuard');
      jest.spyOn(guard, 'acquireJob').mockReturnValue(true);
      jest.spyOn(guard, 'releaseJob').mockReturnValue(true);

      await processMonitorJob(jobId);

      // Should release job and re-enqueue if limit reached
      expect(guard.releaseJob).toHaveBeenCalledWith(jobId);
    });
  });
});
