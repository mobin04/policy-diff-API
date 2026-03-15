import { recordAbuseEvent } from '../requestAbuse.service';
import app from '../../app';
import { INTERNAL_METRICS_TOKEN } from '../../config';

// We need to test the internal route directly to verify validateInternalToken instrumentation
// Since validateInternalToken is private to the route file, we test via HTTP
jest.mock('../requestAbuse.service');

describe('Internal Endpoint Abuse Instrumentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should record INVALID_INTERNAL_TOKEN_ATTEMPT when token mismatch', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/internal/metrics',
      headers: {
        'x-internal-token': 'wrong-token',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(recordAbuseEvent).toHaveBeenCalledWith('INVALID_INTERNAL_TOKEN_ATTEMPT', null, expect.any(String));
  });
});
