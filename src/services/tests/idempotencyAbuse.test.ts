import { checkIdempotency } from '../idempotency.service';
import * as idempotencyRepository from '../../repositories/idempotency.repository';
import * as requestAbuseService from '../requestAbuse.service';
import { generateHash } from '../../utils/hash';
import { ConflictError } from '../../errors';

jest.mock('../../repositories/idempotency.repository');
jest.mock('../requestAbuse.service');
jest.mock('../../utils/hash');

describe('Idempotency Abuse Instrumentation', () => {
  const mockApiKeyId = 1;
  const mockKey = 'test-key';
  const mockBody = { url: 'test' };
  const mockHash = 'hash123';

  beforeEach(() => {
    jest.clearAllMocks();
    (generateHash as jest.Mock).mockReturnValue(mockHash);
  });

  test('should record IDEMPOTENCY_REUSE when payload matches', async () => {
    (idempotencyRepository.getIdempotencyRecord as jest.Mock).mockResolvedValue({
      requestHash: mockHash,
      responseBody: { ok: true },
    });

    const result = await checkIdempotency(mockApiKeyId, mockKey, mockBody);

    expect(result).toEqual({ ok: true });
    expect(requestAbuseService.recordAbuseEvent).toHaveBeenCalledWith('IDEMPOTENCY_REUSE', mockApiKeyId, undefined, {
      idempotency_key: mockKey,
    });
  });

  test('should record IDEMPOTENCY_CONFLICT when payload differs', async () => {
    (idempotencyRepository.getIdempotencyRecord as jest.Mock).mockResolvedValue({
      requestHash: 'different-hash',
      responseBody: { ok: true },
    });

    const mockLogger = { info: jest.fn(), warn: jest.fn() };

    await expect(checkIdempotency(mockApiKeyId, mockKey, mockBody, mockLogger)).rejects.toThrow(ConflictError);

    expect(requestAbuseService.recordAbuseEvent).toHaveBeenCalledWith('IDEMPOTENCY_CONFLICT', mockApiKeyId, undefined, {
      idempotency_key: mockKey,
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { api_key_id: mockApiKeyId, idempotency_key: mockKey },
      'IDEMPOTENCY_CONFLICT',
    );
  });
});
