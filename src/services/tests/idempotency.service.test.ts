import { checkIdempotency, storeIdempotency } from '../idempotency.service';
import * as idempotencyRepository from '../../repositories/idempotency.repository';
import * as requestAbuseService from '../requestAbuse.service';
import { generateHash } from '../../utils/hash';

jest.mock('../../repositories/idempotency.repository');
jest.mock('../requestAbuse.service');
jest.mock('../../utils/hash');

describe('IdempotencyService', () => {
  const mockApiKeyId = 1;
  const mockKey = 'test-key';
  const mockBody = { url: 'test' };
  const mockHash = 'hash123';

  beforeEach(() => {
    jest.clearAllMocks();
    (generateHash as jest.Mock).mockReturnValue(mockHash);
  });

  describe('checkIdempotency', () => {
    test('should return null if idempotencyKey is undefined', async () => {
      const result = await checkIdempotency(mockApiKeyId, undefined, mockBody);
      expect(result).toBeNull();
      expect(idempotencyRepository.getIdempotencyRecord).not.toHaveBeenCalled();
    });

    test('should return null if no record exists', async () => {
      (idempotencyRepository.getIdempotencyRecord as jest.Mock).mockResolvedValue(null);
      const result = await checkIdempotency(mockApiKeyId, mockKey, mockBody);
      expect(result).toBeNull();
    });

    test('should propagate repository errors', async () => {
      (idempotencyRepository.getIdempotencyRecord as jest.Mock).mockRejectedValue(new Error('DB_FAIL'));
      await expect(checkIdempotency(mockApiKeyId, mockKey, mockBody)).rejects.toThrow('DB_FAIL');
    });
  });

  describe('storeIdempotency', () => {
    const mockResponse = { result: 'ok' };

    test('should store record if key is provided', async () => {
      await storeIdempotency(mockApiKeyId, mockKey, mockBody, mockResponse);
      expect(idempotencyRepository.saveIdempotencyRecord).toHaveBeenCalledWith(
        mockApiKeyId,
        mockKey,
        mockHash,
        mockResponse,
      );
    });

    test('should do nothing if key is undefined', async () => {
      await storeIdempotency(mockApiKeyId, undefined, mockBody, mockResponse);
      expect(idempotencyRepository.saveIdempotencyRecord).not.toHaveBeenCalled();
    });

    test('should propagate repository errors', async () => {
      (idempotencyRepository.saveIdempotencyRecord as jest.Mock).mockRejectedValue(new Error('SAVE_FAIL'));
      await expect(storeIdempotency(mockApiKeyId, mockKey, mockBody, mockResponse)).rejects.toThrow('SAVE_FAIL');
    });
  });
});
