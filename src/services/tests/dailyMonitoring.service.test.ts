import { runDailyMonitoring } from '../dailyMonitoring.service';
import * as monitoredUrlRepository from '../../repositories/monitoredUrl.repository';
import * as monitorJobRepository from '../../repositories/monitorJob.repository';
import * as monitorJobService from '../monitorJob.service';

jest.mock('../../repositories/monitoredUrl.repository');
jest.mock('../../repositories/monitorJob.repository');
jest.mock('../monitorJob.service');

describe('DailyMonitoringService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (monitorJobService.canAcceptNewJob as jest.Mock).mockReturnValue(true);
    (monitorJobService.enqueueMonitorJobProcessing as jest.Mock).mockReturnValue(undefined);
  });

  test('should schedule active monitored URLs through the existing job queue', async () => {
    (monitoredUrlRepository.listActiveMonitoredUrls as jest.Mock).mockResolvedValue([
      {
        id: 1,
        apiKeyId: 10,
        pageId: 20,
        url: 'https://example.com/privacy',
        email: 'user@example.com',
        lastScheduledAt: null,
      },
    ]);
    (monitorJobRepository.createJob as jest.Mock).mockResolvedValue({ id: 'job-1', status: 'PENDING' });

    const result = await runDailyMonitoring();

    expect(result).toEqual({ scheduled: 1, skipped: 0, failed: 0 });
    expect(monitorJobRepository.createJob).toHaveBeenCalledWith(20, 10);
    expect(monitoredUrlRepository.markMonitoredUrlScheduled).toHaveBeenCalledWith(1);
    expect(monitorJobService.enqueueMonitorJobProcessing).toHaveBeenCalledWith('job-1', undefined);
  });

  test('should skip scheduling when the queue is at capacity', async () => {
    (monitorJobService.canAcceptNewJob as jest.Mock).mockReturnValue(false);
    (monitoredUrlRepository.listActiveMonitoredUrls as jest.Mock).mockResolvedValue([
      {
        id: 1,
        apiKeyId: 10,
        pageId: 20,
        url: 'https://example.com/privacy',
        email: 'user@example.com',
        lastScheduledAt: null,
      },
    ]);

    const result = await runDailyMonitoring();

    expect(result).toEqual({ scheduled: 0, skipped: 1, failed: 0 });
    expect(monitorJobRepository.createJob).not.toHaveBeenCalled();
  });
});
