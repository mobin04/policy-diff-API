import Fastify from 'fastify';
import { requestLoggerPlugin } from '../requestLogger';
import { requestIdPlugin } from '../requestId';
import * as apiLogRepository from '../../repositories/apiLog.repository';

// Mock the repository to verify calls
jest.mock('../../repositories/apiLog.repository', () => ({
  logApiRequest: jest.fn().mockResolvedValue(undefined),
}));

describe('requestLoggerPlugin', () => {
  let server: any;

  beforeEach(async () => {
    server = Fastify();
    // Register requestId as it's a dependency for requestLogger
    await server.register(requestIdPlugin);
    await server.register(requestLoggerPlugin);
    
    server.get('/test', async () => ({ ok: true }));
    server.get('/health', async () => ({ status: 'ok' }));
    server.get('/ready', async () => ({ status: 'ready' }));
    
    await server.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await server.close();
  });

  it('should log regular requests to the database', async () => {
    await server.inject({
      method: 'GET',
      url: '/test',
    });

    // Wait for the fire-and-forget logApiRequest to be called
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(apiLogRepository.logApiRequest).toHaveBeenCalledWith(
      null,
      '/test',
      200,
      expect.any(Number)
    );
  });

  it('should NOT log /health requests even with query parameters', async () => {
    await server.inject({
      method: 'GET',
      url: '/health?t=12345',
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(apiLogRepository.logApiRequest).not.toHaveBeenCalled();
  });

  it('should NOT log /ready requests to the database', async () => {
    await server.inject({
      method: 'GET',
      url: '/ready',
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    // This will fail before the fix
    expect(apiLogRepository.logApiRequest).not.toHaveBeenCalled();
  });
});
