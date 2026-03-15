import { validateSnapshotDeterminism } from '../replayValidator.service';
import * as replaySnapshotRepository from '../../repositories/replaySnapshot.repository';
import * as pipelineSnapshotService from '../pipelineSnapshot.service';

jest.mock('../../repositories/replaySnapshot.repository');
jest.mock('../pipelineSnapshot.service');

describe('ReplayValidatorService', () => {
  const mockSnapshotId = '123e4567-e89b-12d3-a456-426614174000';
  const mockRawHtml = '<html><body><h1>Policy</h1></body></html>';
  const mockPipelineResult = {
    normalizedContent: 'Policy',
    sections: [{ title: 'Main', content: 'Policy', hash: 'hash1' }],
    metadata: { title: 'Policy' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('happy path', () => {
    test('should validate successfully when pipeline is deterministic', async () => {
      (replaySnapshotRepository.getSnapshotRawHtml as jest.Mock).mockResolvedValue(mockRawHtml);
      (pipelineSnapshotService.processSnapshot as jest.Mock).mockReturnValue(mockPipelineResult);

      await expect(validateSnapshotDeterminism(mockSnapshotId, 3)).resolves.not.toThrow();

      expect(replaySnapshotRepository.getSnapshotRawHtml).toHaveBeenCalledWith(mockSnapshotId);
      expect(pipelineSnapshotService.processSnapshot).toHaveBeenCalledTimes(3);
      expect(pipelineSnapshotService.processSnapshot).toHaveBeenCalledWith(mockRawHtml);
    });

    test('should pass with 1 run', async () => {
      (replaySnapshotRepository.getSnapshotRawHtml as jest.Mock).mockResolvedValue(mockRawHtml);
      (pipelineSnapshotService.processSnapshot as jest.Mock).mockReturnValue(mockPipelineResult);

      await expect(validateSnapshotDeterminism(mockSnapshotId, 1)).resolves.not.toThrow();
      expect(pipelineSnapshotService.processSnapshot).toHaveBeenCalledTimes(1);
    });

    test('should pass with 0 runs (no-op)', async () => {
      (replaySnapshotRepository.getSnapshotRawHtml as jest.Mock).mockResolvedValue(mockRawHtml);

      await expect(validateSnapshotDeterminism(mockSnapshotId, 0)).resolves.not.toThrow();
      expect(pipelineSnapshotService.processSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('failure scenarios', () => {
    test('should throw SNAPSHOT_NOT_FOUND if snapshot does not exist', async () => {
      (replaySnapshotRepository.getSnapshotRawHtml as jest.Mock).mockResolvedValue(null);

      await expect(validateSnapshotDeterminism(mockSnapshotId, 1)).rejects.toThrow('SNAPSHOT_NOT_FOUND');
    });

    test('should throw NON_DETERMINISTIC_PIPELINE_DETECTED if output drifts', async () => {
      (replaySnapshotRepository.getSnapshotRawHtml as jest.Mock).mockResolvedValue(mockRawHtml);

      // First run returns baseline
      // Second run returns slightly different result
      (pipelineSnapshotService.processSnapshot as jest.Mock)
        .mockReturnValueOnce(mockPipelineResult)
        .mockReturnValueOnce({
          ...mockPipelineResult,
          normalizedContent: 'Policy Drifted',
        });

      await expect(validateSnapshotDeterminism(mockSnapshotId, 2)).rejects.toThrow(
        'NON_DETERMINISTIC_PIPELINE_DETECTED',
      );

      expect(pipelineSnapshotService.processSnapshot).toHaveBeenCalledTimes(2);
    });

    test('should throw if even minor metadata difference occurs', async () => {
      (replaySnapshotRepository.getSnapshotRawHtml as jest.Mock).mockResolvedValue(mockRawHtml);

      (pipelineSnapshotService.processSnapshot as jest.Mock)
        .mockReturnValueOnce(mockPipelineResult)
        .mockReturnValueOnce({
          ...mockPipelineResult,
          metadata: { title: 'Policy Changed' },
        });

      await expect(validateSnapshotDeterminism(mockSnapshotId, 2)).rejects.toThrow(
        'NON_DETERMINISTIC_PIPELINE_DETECTED',
      );
    });
  });

  describe('edge cases', () => {
    test('should handle very large HTML content', async () => {
      const largeHtml = 'a'.repeat(1024 * 1024);
      (replaySnapshotRepository.getSnapshotRawHtml as jest.Mock).mockResolvedValue(largeHtml);
      (pipelineSnapshotService.processSnapshot as jest.Mock).mockReturnValue(mockPipelineResult);

      await expect(validateSnapshotDeterminism(mockSnapshotId, 2)).resolves.not.toThrow();
    });

    test('should propagate repository errors', async () => {
      (replaySnapshotRepository.getSnapshotRawHtml as jest.Mock).mockRejectedValue(new Error('DB_ERROR'));

      await expect(validateSnapshotDeterminism(mockSnapshotId, 1)).rejects.toThrow('DB_ERROR');
    });

    test('should propagate pipeline errors', async () => {
      (replaySnapshotRepository.getSnapshotRawHtml as jest.Mock).mockResolvedValue(mockRawHtml);
      (pipelineSnapshotService.processSnapshot as jest.Mock).mockImplementation(() => {
        throw new Error('PIPELINE_CRASH');
      });

      await expect(validateSnapshotDeterminism(mockSnapshotId, 1)).rejects.toThrow('PIPELINE_CRASH');
    });
  });

  describe('deterministic behavior guarantees', () => {
    test('calling with same data multiple times results in same behavior', async () => {
      (replaySnapshotRepository.getSnapshotRawHtml as jest.Mock).mockResolvedValue(mockRawHtml);
      (pipelineSnapshotService.processSnapshot as jest.Mock).mockReturnValue(mockPipelineResult);

      // Call 1
      await validateSnapshotDeterminism(mockSnapshotId, 2);
      // Call 2
      await validateSnapshotDeterminism(mockSnapshotId, 2);

      expect(pipelineSnapshotService.processSnapshot).toHaveBeenCalledTimes(4);
    });
  });
});
