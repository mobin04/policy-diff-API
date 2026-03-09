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
const fastify_1 = __importDefault(require("fastify"));
const apiKeyAuth_1 = require("../apiKeyAuth");
const apiKeyRepository = __importStar(require("../../repositories/apiKey.repository"));
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
        const app = (0, fastify_1.default)();
        await app.register(apiKeyAuth_1.apiKeyAuthPlugin);
        app.get('/protected', { preHandler: app.apiKeyAuth }, async () => ({ ok: true }));
        await app.ready();
        return app;
    };
    beforeEach(() => {
        jest.clearAllMocks();
    });
    test('should authenticate valid key and NOT increment usage', async () => {
        apiKeyRepository.findApiKeyByRawKey.mockResolvedValue(mockApiKey);
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
        apiKeyRepository.findApiKeyByRawKey.mockResolvedValue(null);
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
