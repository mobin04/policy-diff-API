import { captureReplaySnapshot } from '../replaySnapshot.service';
import { canonicalizeUrl } from '../../utils/canonicalizeUrl';
import { fetchPage } from '../../utils/fetchPage';
import { createReplaySnapshot } from '../../repositories/replaySnapshot.repository';
import { FetchError } from '../../errors';

jest.mock('../../utils/canonicalizeUrl');
jest.mock('../../utils/fetchPage');
jest.mock('../../repositories/replaySnapshot.repository');

describe('ReplaySnapshotService', () => {
  const mockUrl = 'https://example.com';
  const mockCanonicalUrl = 'https://example.com/';
  const mockHtml = '<html><body>Test</body></html>';
  const mockId = 'uuid-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('happy path', () => {
    test('should capture and store snapshot successfully', async () => {
      (canonicalizeUrl as jest.Mock).mockReturnValue(mockCanonicalUrl);
      (fetchPage as jest.Mock).mockResolvedValue(mockHtml);
      (createReplaySnapshot as jest.Mock).mockResolvedValue({ id: mockId });

      const result = await captureReplaySnapshot(mockUrl);

      expect(result).toEqual({
        snapshotId: mockId,
        canonicalUrl: mockCanonicalUrl
      });

      expect(canonicalizeUrl).toHaveBeenCalledWith(mockUrl);
      expect(fetchPage).toHaveBeenCalledWith(mockCanonicalUrl);
      expect(createReplaySnapshot).toHaveBeenCalledWith(mockCanonicalUrl, mockHtml);
    });
  });

  describe('failure scenarios', () => {
    test('should propagate canonicalization errors', async () => {
      (canonicalizeUrl as jest.Mock).mockImplementation(() => {
        throw new Error('INVALID_URL');
      });

      await expect(captureReplaySnapshot('bad-url')).rejects.toThrow('INVALID_URL');
    });

    test('should propagate fetch errors (ApiError)', async () => {
      (canonicalizeUrl as jest.Mock).mockReturnValue(mockCanonicalUrl);
      const fetchError = new FetchError('Failed to fetch', 'dns');
      (fetchPage as jest.Mock).mockRejectedValue(fetchError);

      await expect(captureReplaySnapshot(mockUrl)).rejects.toThrow(FetchError);
    });

    test('should propagate repository errors', async () => {
      (canonicalizeUrl as jest.Mock).mockReturnValue(mockCanonicalUrl);
      (fetchPage as jest.Mock).mockResolvedValue(mockHtml);
      (createReplaySnapshot as jest.Mock).mockRejectedValue(new Error('DB_FAIL'));

      await expect(captureReplaySnapshot(mockUrl)).rejects.toThrow('DB_FAIL');
    });
  });

  describe('edge cases', () => {
    test('should handle very large HTML content', async () => {
      const largeHtml = 'a'.repeat(10 * 1024 * 1024); // 10MB
      (canonicalizeUrl as jest.Mock).mockReturnValue(mockCanonicalUrl);
      (fetchPage as jest.Mock).mockResolvedValue(largeHtml);
      (createReplaySnapshot as jest.Mock).mockResolvedValue({ id: mockId });

      const result = await captureReplaySnapshot(mockUrl);
      expect(result.snapshotId).toBe(mockId);
      expect(createReplaySnapshot).toHaveBeenCalledWith(mockCanonicalUrl, largeHtml);
    });
  });
});
