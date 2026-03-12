"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const provisioning_service_1 = require("../provisioning.service");
const apiKeyRepository = __importStar(require("../../repositories/apiKey.repository"));
const errors_1 = require("../../errors");
const crypto_1 = __importDefault(require("crypto"));
jest.mock('../../repositories/apiKey.repository');
describe('ProvisioningService', () => {
    const mockInput = {
        email: 'user@example.com',
        name: 'Test User',
        tier: 'FREE',
        environment: 'dev',
    };
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('happy path', () => {
        test('should provision a new API key successfully', async () => {
            apiKeyRepository.findActiveByEmail.mockResolvedValue(null);
            apiKeyRepository.insertProvisionedKey.mockResolvedValue(undefined);
            const result = await (0, provisioning_service_1.provisionApiKey)(mockInput);
            expect(result.rawKey).toMatch(/^pd_dev_[a-f0-9]{64}$/);
            expect(apiKeyRepository.findActiveByEmail).toHaveBeenCalledWith(mockInput.email);
            expect(apiKeyRepository.insertProvisionedKey).toHaveBeenCalled();
            // Verify hash logic
            const rawKey = result.rawKey;
            const expectedHash = crypto_1.default.createHash('sha256').update(rawKey).digest('hex');
            const lastCall = apiKeyRepository.insertProvisionedKey.mock.calls[0];
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
            apiKeyRepository.findActiveByEmail.mockResolvedValue(null);
            const result = await (0, provisioning_service_1.provisionApiKey)({
                ...mockInput,
                environment: 'prod',
            });
            expect(result.rawKey).toMatch(/^pd_live_[a-f0-9]{64}$/);
        });
        test('should assign correct quota for STARTER tier', async () => {
            apiKeyRepository.findActiveByEmail.mockResolvedValue(null);
            await (0, provisioning_service_1.provisionApiKey)({
                ...mockInput,
                tier: 'STARTER',
            });
            const lastCall = apiKeyRepository.insertProvisionedKey.mock.calls[0];
            expect(lastCall[1].monthlyQuota).toBe(500);
        });
        test('should assign correct quota for PRO tier', async () => {
            apiKeyRepository.findActiveByEmail.mockResolvedValue(null);
            await (0, provisioning_service_1.provisionApiKey)({
                ...mockInput,
                tier: 'PRO',
            });
            const lastCall = apiKeyRepository.insertProvisionedKey.mock.calls[0];
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
                await expect((0, provisioning_service_1.provisionApiKey)(input)).rejects.toThrow(errors_1.InvalidEmailError);
            }
        });
        test('should throw ApiKeyAlreadyExistsError if email is already registered', async () => {
            apiKeyRepository.findActiveByEmail.mockResolvedValue({ id: 1 });
            await expect((0, provisioning_service_1.provisionApiKey)(mockInput)).rejects.toThrow(errors_1.ApiKeyAlreadyExistsError);
        });
        test('should calculate quota reset at as first day of next month', async () => {
            apiKeyRepository.findActiveByEmail.mockResolvedValue(null);
            // Use fake timers to control "now"
            const mockNow = new Date('2026-02-15T12:00:00Z');
            jest.useFakeTimers().setSystemTime(mockNow);
            await (0, provisioning_service_1.provisionApiKey)(mockInput);
            const lastCall = apiKeyRepository.insertProvisionedKey.mock.calls[0];
            const quotaResetAt = lastCall[2];
            expect(quotaResetAt.getUTCFullYear()).toBe(2026);
            expect(quotaResetAt.getUTCMonth()).toBe(2); // March (0-indexed)
            expect(quotaResetAt.getUTCDate()).toBe(1);
            expect(quotaResetAt.getUTCHours()).toBe(0);
            jest.useRealTimers();
        });
        test('should handle year rollover for quota reset', async () => {
            apiKeyRepository.findActiveByEmail.mockResolvedValue(null);
            const mockNow = new Date('2026-12-20T12:00:00Z');
            jest.useFakeTimers().setSystemTime(mockNow);
            await (0, provisioning_service_1.provisionApiKey)(mockInput);
            const lastCall = apiKeyRepository.insertProvisionedKey.mock.calls[0];
            const quotaResetAt = lastCall[2];
            expect(quotaResetAt.getUTCFullYear()).toBe(2027);
            expect(quotaResetAt.getUTCMonth()).toBe(0); // January
            expect(quotaResetAt.getUTCDate()).toBe(1);
            jest.useRealTimers();
        });
    });
    describe('failure scenarios', () => {
        test('should propagate repository errors', async () => {
            apiKeyRepository.findActiveByEmail.mockRejectedValue(new Error('DB_DOWN'));
            await expect((0, provisioning_service_1.provisionApiKey)(mockInput)).rejects.toThrow('DB_DOWN');
        });
        test('should propagate insertion errors', async () => {
            apiKeyRepository.findActiveByEmail.mockResolvedValue(null);
            apiKeyRepository.insertProvisionedKey.mockRejectedValue(new Error('INSERT_FAILED'));
            await expect((0, provisioning_service_1.provisionApiKey)(mockInput)).rejects.toThrow('INSERT_FAILED');
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
            apiKeyRepository.findActiveByEmail.mockResolvedValue(mockApiKeyRecord);
            apiKeyRepository.updateApiKeyHash.mockResolvedValue(undefined);
            const result = await (0, provisioning_service_1.regenerateApiKey)(mockEmail);
            expect(result.rawKey).toMatch(/^pd_live_[a-f0-9]{64}$/);
            expect(apiKeyRepository.findActiveByEmail).toHaveBeenCalledWith(mockEmail);
            const rawKey = result.rawKey;
            const expectedHash = crypto_1.default.createHash('sha256').update(rawKey).digest('hex');
            expect(apiKeyRepository.updateApiKeyHash).toHaveBeenCalledWith(mockApiKeyRecord.id, expectedHash);
        });
        test('should use dev prefix if original key was dev', async () => {
            apiKeyRepository.findActiveByEmail.mockResolvedValue({
                ...mockApiKeyRecord,
                environment: 'dev',
            });
            const result = await (0, provisioning_service_1.regenerateApiKey)(mockEmail);
            expect(result.rawKey).toMatch(/^pd_dev_/);
        });
        test('should throw error if email not found', async () => {
            apiKeyRepository.findActiveByEmail.mockResolvedValue(null);
            await expect((0, provisioning_service_1.regenerateApiKey)(mockEmail)).rejects.toThrow('API_KEY_NOT_FOUND');
        });
        test('should throw InvalidEmailError for malformed email', async () => {
            await expect((0, provisioning_service_1.regenerateApiKey)('not-an-email')).rejects.toThrow(errors_1.InvalidEmailError);
        });
    });
});
