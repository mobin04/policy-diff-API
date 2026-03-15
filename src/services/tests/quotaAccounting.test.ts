import Fastify from 'fastify';
import { usageRoutes } from '../../routes/usage.route';
import { getUsageSnapshot } from '../usage.service';
import * as usageService from '../usage.service';

jest.mock('../usage.service');

describe('Quota Accounting', () => {
  const mockApiKey = {
    id: 1,
    keyHash: 'hash',
    name: 'Test Key',
    email: 'test@example.com',
    environment: 'dev',
    isActive: true,
    tier: 'FREE',
    monthlyQuota: 30,
    monthlyUsage: 5,
    quotaResetAt: new Date('2099-01-01'),
  };

  const createMockApp = async () => {
    const app = Fastify();
    // Mock the apiKeyAuth decoration
    app.decorate('apiKeyAuth', async (request: any) => {
      request.apiKey = mockApiKey;
    });
    app.register(usageRoutes);
    await app.ready();
    return app;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calling /v1/usage should NOT increment monthly usage', async () => {
    const mockSnapshot = {
      tier: 'FREE',
      monthlyQuota: 30,
      monthlyUsage: 5,
      remaining: 25,
      quotaResetAt: new Date('2099-01-01'),
    };

    (usageService.getUsageSnapshot as jest.Mock).mockResolvedValue(mockSnapshot);

    const app = await createMockApp();

    const response = await app.inject({
      method: 'GET',
      url: '/usage',
      headers: {
        authorization: 'Bearer valid-key',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      monthly_usage: 5,
    });

    // Verify that getUsageSnapshot was called (to show current status)
    expect(usageService.getUsageSnapshot).toHaveBeenCalledWith(mockApiKey.id);

    // Verify that consumeJobs or any increment logic was NOT called
    // (Since we mocked the whole service, we can check other functions)
    const consumeJobs = require('../usage.service').consumeJobs;
    const consumeJobsWithClient = require('../usage.service').consumeJobsWithClient;

    expect(consumeJobs).not.toHaveBeenCalled();
    expect(consumeJobsWithClient).not.toHaveBeenCalled();
  });
});
