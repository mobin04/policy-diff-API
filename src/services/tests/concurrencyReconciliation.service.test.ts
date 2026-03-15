import { reconcileConcurrencyState, initReconciliation } from '../concurrencyReconciliation.service';
import { countProcessingJobs } from '../../repositories/monitorJob.repository';
import { getActiveJobCount, resetActiveJobs } from '../../utils/concurrencyGuard';
import { FastifyBaseLogger } from 'fastify';

// Mock dependencies
jest.mock('../../repositories/monitorJob.repository');
jest.mock('../../utils/concurrencyGuard');

describe('Concurrency Reconciliation Service Tests', () => {
  let mockLogger: jest.Mocked<FastifyBaseLogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn(),
      silent: jest.fn(),
      level: 'info',
    } as any;
    initReconciliation(mockLogger);
  });

  test('should return silently when counts match', async () => {
    (countProcessingJobs as jest.Mock).mockResolvedValue(5);
    (getActiveJobCount as jest.Mock).mockReturnValue(5);

    await reconcileConcurrencyState();

    expect(countProcessingJobs).toHaveBeenCalled();
    expect(getActiveJobCount).toHaveBeenCalled();
    expect(resetActiveJobs).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  test('should repair and log error when in-memory count is higher than DB count', async () => {
    (countProcessingJobs as jest.Mock).mockResolvedValue(3);
    (getActiveJobCount as jest.Mock).mockReturnValue(5);

    await reconcileConcurrencyState();

    expect(resetActiveJobs).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'concurrency_drift_detected',
        in_memory_count: 5,
        db_count: 3,
      }),
      expect.any(String),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'concurrency_drift_repaired',
        corrected_to_db: 3,
      }),
      expect.any(String),
    );
  });

  test('should repair and log error when in-memory count is lower than DB count', async () => {
    (countProcessingJobs as jest.Mock).mockResolvedValue(5);
    (getActiveJobCount as jest.Mock).mockReturnValue(2);

    await reconcileConcurrencyState();

    expect(resetActiveJobs).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'concurrency_drift_detected',
        in_memory_count: 2,
        db_count: 5,
      }),
      expect.any(String),
    );
  });

  test('should handle repository errors gracefully without crashing', async () => {
    const error = new Error('Database connection failed');
    (countProcessingJobs as jest.Mock).mockRejectedValue(error);

    await expect(reconcileConcurrencyState()).resolves.not.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: error,
        event: 'concurrency_reconciliation_failure',
      }),
      expect.any(String),
    );
    expect(resetActiveJobs).not.toHaveBeenCalled();
  });

  test('should function correctly without a logger initialized', async () => {
    // Re-initialize without logger
    (initReconciliation as any)(null);

    (countProcessingJobs as jest.Mock).mockResolvedValue(2);
    (getActiveJobCount as jest.Mock).mockReturnValue(5);

    await reconcileConcurrencyState();

    expect(resetActiveJobs).toHaveBeenCalled();
    // No errors should be thrown despite logger being null
  });

  test('should handle edge case of zero jobs correctly', async () => {
    (countProcessingJobs as jest.Mock).mockResolvedValue(0);
    (getActiveJobCount as jest.Mock).mockReturnValue(0);

    await reconcileConcurrencyState();

    expect(resetActiveJobs).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  test('should handle edge case of one job drift', async () => {
    (countProcessingJobs as jest.Mock).mockResolvedValue(1);
    (getActiveJobCount as jest.Mock).mockReturnValue(0);

    await reconcileConcurrencyState();

    expect(resetActiveJobs).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
