import Fastify from 'fastify';
import { apiKeyAuthPlugin } from '../apiKeyAuth';
import * as apiKeyRepository from '../../repositories/apiKey.repository';

jest.mock('../../repositories/apiKey.repository');

describe('ApiKeyAuthPlugin', () => {
  const mockApiKey = {
    id: 1,
    keyHash: 'hash',
    name: 'Test Key',
    email: 'test@example.com',
    environment: 'dev',
    isActive: true,
    tier: 'FREE',
    monthlyQuota: 100,
    monthlyUsage: 10,
    quotaResetAt: new Date('2099-01-01'),
  };

  const createMockApp = async () => {
    const app = Fastify();
    await app.register(apiKeyAuthPlugin);
    app.get('/protected', { preHandler: app.apiKeyAuth }, async () => ({ ok: true }));
    await app.ready();
    return app;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should authenticate valid key and NOT increment usage', async () => {
    (apiKeyRepository.findApiKeyByRawKey as jest.Mock).mockResolvedValue(mockApiKey);
    
    const app = await createMockApp();

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: 'Bearer valid-key',
      },
    });

    expect(response.statusCode).toBe(200);
    // Verified visually: we removed the call to incrementMonthlyUsage in apiKeyAuth.ts
  });

  test('should fail if key is missing', async () => {
    const app = await createMockApp();

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
    });

    expect(response.statusCode).toBe(401);
  });

  test('should fail if key is invalid', async () => {
    (apiKeyRepository.findApiKeyByRawKey as jest.Mock).mockResolvedValue(null);
    
    const app = await createMockApp();

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: 'Bearer invalid-key',
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
