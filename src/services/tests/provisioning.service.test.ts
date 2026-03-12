import { provisionApiKey, regenerateApiKey } from '../provisioning.service';
import * as apiKeyRepository from '../../repositories/apiKey.repository';
import { InvalidEmailError, ApiKeyAlreadyExistsError } from '../../errors';
import crypto from 'crypto';

jest.mock('../../repositories/apiKey.repository');

describe('ProvisioningService', () => {
  const mockInput = {
    email: 'user@example.com',
    name: 'Test User',
    tier: 'FREE' as const,
    environment: 'dev' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('happy path', () => {
    test('should provision a new API key successfully', async () => {
      (apiKeyRepository.findActiveByEmail as jest.Mock).mockResolvedValue(null);
      (apiKeyRepository.insertProvisionedKey as jest.Mock).mockResolvedValue(undefined);

      const result = await provisionApiKey(mockInput);

      expect(result.rawKey).toMatch(/^pd_dev_[a-f0-9]{64}$/);
      expect(apiKeyRepository.findActiveByEmail).toHaveBeenCalledWith(mockInput.email);
      expect(apiKeyRepository.insertProvisionedKey).toHaveBeenCalled();

      // Verify hash logic
      const rawKey = result.rawKey;
      const expectedHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      
      const lastCall = (apiKeyRepository.insertProvisionedKey as jest.Mock).mock.calls[0];
      expect(lastCall[0]).toBe(expectedHash);
      expect(lastCall[1]).toMatchObject({
        email: mockInput.email,
        name: mockInput.name,
        tier: mockInput.tier,
        environment: mockInput.environment,
        monthlyQuota: 30, // FREE tier V2
      });
    });

    test('should use pd_live_ prefix for production environment', async () => {
      (apiKeyRepository.findActiveByEmail as jest.Mock).mockResolvedValue(null);
      
      const result = await provisionApiKey({
        ...mockInput,
        environment: 'prod',
      });

      expect(result.rawKey).toMatch(/^pd_live_[a-f0-9]{64}$/);
    });

    test('should assign correct quota for STARTER tier', async () => {
      (apiKeyRepository.findActiveByEmail as jest.Mock).mockResolvedValue(null);
      
      await provisionApiKey({
        ...mockInput,
        tier: 'STARTER',
      });

      const lastCall = (apiKeyRepository.insertProvisionedKey as jest.Mock).mock.calls[0];
      expect(lastCall[1].monthlyQuota).toBe(500);
    });

    test('should assign correct quota for PRO tier', async () => {
      (apiKeyRepository.findActiveByEmail as jest.Mock).mockResolvedValue(null);
      
      await provisionApiKey({
        ...mockInput,
        tier: 'PRO',
      });

      const lastCall = (apiKeyRepository.insertProvisionedKey as jest.Mock).mock.calls[0];
      expect(lastCall[1].monthlyQuota).toBe(2500);
    });
  });

  describe('edge cases', () => {
    test('should throw InvalidEmailError for malformed email', async () => {
      const inputs = [
        { ...mockInput, email: 'notanemail' },
        { ...mockInput, email: 'user@' },
        { ...mockInput, email: '@domain.com' },
        { ...mockInput, email: '' },
      ];

      for (const input of inputs) {
        await expect(provisionApiKey(input)).rejects.toThrow(InvalidEmailError);
      }
    });

    test('should throw ApiKeyAlreadyExistsError if email is already registered', async () => {
      (apiKeyRepository.findActiveByEmail as jest.Mock).mockResolvedValue({ id: 1 });

      await expect(provisionApiKey(mockInput)).rejects.toThrow(ApiKeyAlreadyExistsError);
    });

    test('should calculate quota reset at as first day of next month', async () => {
      (apiKeyRepository.findActiveByEmail as jest.Mock).mockResolvedValue(null);
      
      // Use fake timers to control "now"
      const mockNow = new Date('2026-02-15T12:00:00Z');
      jest.useFakeTimers().setSystemTime(mockNow);

      await provisionApiKey(mockInput);

      const lastCall = (apiKeyRepository.insertProvisionedKey as jest.Mock).mock.calls[0];
      const quotaResetAt = lastCall[2];
      
      expect(quotaResetAt.getUTCFullYear()).toBe(2026);
      expect(quotaResetAt.getUTCMonth()).toBe(2); // March (0-indexed)
      expect(quotaResetAt.getUTCDate()).toBe(1);
      expect(quotaResetAt.getUTCHours()).toBe(0);

      jest.useRealTimers();
    });

    test('should handle year rollover for quota reset', async () => {
      (apiKeyRepository.findActiveByEmail as jest.Mock).mockResolvedValue(null);
      
      const mockNow = new Date('2026-12-20T12:00:00Z');
      jest.useFakeTimers().setSystemTime(mockNow);

      await provisionApiKey(mockInput);

      const lastCall = (apiKeyRepository.insertProvisionedKey as jest.Mock).mock.calls[0];
      const quotaResetAt = lastCall[2];
      
      expect(quotaResetAt.getUTCFullYear()).toBe(2027);
      expect(quotaResetAt.getUTCMonth()).toBe(0); // January
      expect(quotaResetAt.getUTCDate()).toBe(1);

      jest.useRealTimers();
    });
  });

  describe('failure scenarios', () => {
    test('should propagate repository errors', async () => {
      (apiKeyRepository.findActiveByEmail as jest.Mock).mockRejectedValue(new Error('DB_DOWN'));

      await expect(provisionApiKey(mockInput)).rejects.toThrow('DB_DOWN');
    });

    test('should propagate insertion errors', async () => {
      (apiKeyRepository.findActiveByEmail as jest.Mock).mockResolvedValue(null);
      (apiKeyRepository.insertProvisionedKey as jest.Mock).mockRejectedValue(new Error('INSERT_FAILED'));

      await expect(provisionApiKey(mockInput)).rejects.toThrow('INSERT_FAILED');
    });
  });

  describe('regenerateApiKey', () => {
    const mockEmail = 'existing@example.com';
    const mockApiKeyRecord = {
      id: 123,
      email: mockEmail,
      environment: 'prod',
      isActive: true,
    };

    test('should regenerate API key for active email', async () => {
      const mockRotatedAt = new Date();
      (apiKeyRepository.findActiveByEmail as jest.Mock).mockResolvedValue(mockApiKeyRecord);
      (apiKeyRepository.updateApiKeyHash as jest.Mock).mockResolvedValue(mockRotatedAt);

      const result = await regenerateApiKey(mockEmail);

      expect(result.rawKey).toMatch(/^pd_live_[a-f0-9]{64}$/);
      expect(result.rotatedAt).toBe(mockRotatedAt);
      expect(apiKeyRepository.findActiveByEmail).toHaveBeenCalledWith(mockEmail);
      
      const rawKey = result.rawKey;
      const expectedHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      expect(apiKeyRepository.updateApiKeyHash).toHaveBeenCalledWith(mockApiKeyRecord.id, expectedHash);
    });

    test('should use dev prefix if original key was dev', async () => {
      (apiKeyRepository.findActiveByEmail as jest.Mock).mockResolvedValue({
        ...mockApiKeyRecord,
        environment: 'dev',
      });

      const result = await regenerateApiKey(mockEmail);
      expect(result.rawKey).toMatch(/^pd_dev_/);
    });

    test('should throw error if email not found', async () => {
      (apiKeyRepository.findActiveByEmail as jest.Mock).mockResolvedValue(null);

      await expect(regenerateApiKey(mockEmail)).rejects.toThrow('API_KEY_NOT_FOUND');
    });

    test('should throw InvalidEmailError for malformed email', async () => {
      await expect(regenerateApiKey('not-an-email')).rejects.toThrow(InvalidEmailError);
    });
  });
});
