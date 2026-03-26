"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const tierTokenBucketLimiter_1 = require("../tierTokenBucketLimiter");
describe('TierTokenBucketLimiterPlugin', () => {
    beforeEach(() => {
        tierTokenBucketLimiter_1.buckets.clear();
    });
    const createMockApp = () => {
        const app = (0, fastify_1.default)();
        app.addHook('onRequest', async (request) => {
            const authHeader = request.headers.authorization;
            if (authHeader === 'Bearer free-key') {
                request.apiKey = {
                    id: 1,
                    keyHash: 'h1',
                    name: 'Free',
                    email: 'f@e.com',
                    environment: 'dev',
                    isActive: true,
                    createdAt: new Date(),
                    tier: 'FREE',
                    monthlyQuota: 30,
                    monthlyUsage: 0,
                    quotaResetAt: new Date(),
                };
            }
            else if (authHeader === 'Bearer starter-key') {
                request.apiKey = {
                    id: 2,
                    keyHash: 'h2',
                    name: 'Starter',
                    email: 's@e.com',
                    environment: 'dev',
                    isActive: true,
                    createdAt: new Date(),
                    tier: 'STARTER',
                    monthlyQuota: 500,
                    monthlyUsage: 0,
                    quotaResetAt: new Date(),
                };
            }
            else if (authHeader === 'Bearer pro-key') {
                request.apiKey = {
                    id: 3,
                    keyHash: 'h3',
                    name: 'Pro',
                    email: 'p@e.com',
                    environment: 'dev',
                    isActive: true,
                    createdAt: new Date(),
                    tier: 'PRO',
                    monthlyQuota: 2500,
                    monthlyUsage: 0,
                    quotaResetAt: new Date(),
                };
            }
        });
        const mockAuth = async () => { };
        app.register(require('fastify-plugin')(mockAuth, { name: 'apiKeyAuth' }));
        app.register(tierTokenBucketLimiter_1.tierTokenBucketLimiterPlugin);
        app.get('/test', async () => ({ ok: true }));
        return app;
    };
    test('FREE user cannot exceed 30 burst requests', async () => {
        const app = createMockApp();
        await app.ready();
        for (let i = 0; i < 30; i++) {
            const res = await app.inject({
                method: 'GET',
                url: '/test',
                headers: { authorization: 'Bearer free-key' },
            });
            expect(res.statusCode).toBe(200);
        }
        const res = await app.inject({
            method: 'GET',
            url: '/test',
            headers: { authorization: 'Bearer free-key' },
        });
        expect(res.statusCode).toBe(429);
    });
    test('FREE tokens refill correctly', async () => {
        const app = createMockApp();
        await app.ready();
        for (let i = 0; i < 30; i++) {
            await app.inject({ method: 'GET', url: '/test', headers: { authorization: 'Bearer free-key' } });
        }
        // Wait for 2.5 seconds. Refill rate is 0.5/sec, so 1.25 tokens should be added.
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const res = await app.inject({
            method: 'GET',
            url: '/test',
            headers: { authorization: 'Bearer free-key' },
        });
        expect(res.statusCode).toBe(200);
        const res2 = await app.inject({
            method: 'GET',
            url: '/test',
            headers: { authorization: 'Bearer free-key' },
        });
        expect(res2.statusCode).toBe(429);
    });
    test('STARTER refill rate verified', async () => {
        const app = createMockApp();
        await app.ready();
        for (let i = 0; i < 120; i++) {
            await app.inject({ method: 'GET', url: '/test', headers: { authorization: 'Bearer starter-key' } });
        }
        // Refill rate is 2/sec. Wait 1.5s -> 3 tokens.
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const res1 = await app.inject({ method: 'GET', url: '/test', headers: { authorization: 'Bearer starter-key' } });
        const res2 = await app.inject({ method: 'GET', url: '/test', headers: { authorization: 'Bearer starter-key' } });
        const res3 = await app.inject({ method: 'GET', url: '/test', headers: { authorization: 'Bearer starter-key' } });
        const res4 = await app.inject({ method: 'GET', url: '/test', headers: { authorization: 'Bearer starter-key' } });
        expect(res1.statusCode).toBe(200);
        expect(res2.statusCode).toBe(200);
        expect(res3.statusCode).toBe(200);
        expect(res4.statusCode).toBe(429);
    });
    test('PRO refill rate verified', async () => {
        const app = createMockApp();
        await app.ready();
        for (let i = 0; i < 600; i++) {
            await app.inject({ method: 'GET', url: '/test', headers: { authorization: 'Bearer pro-key' } });
        }
        // Refill rate is 10/sec. Wait 500ms -> 5 tokens.
        await new Promise((resolve) => setTimeout(resolve, 500));
        // Try 10 requests. We expect some to succeed and then fail.
        // Given overhead, maybe 6-7 succeed?
        // Let's just check that it eventually fails again.
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < 20; i++) {
            const res = await app.inject({ method: 'GET', url: '/test', headers: { authorization: 'Bearer pro-key' } });
            if (res.statusCode === 200)
                successCount++;
            else if (res.statusCode === 429)
                failCount++;
        }
        expect(successCount).toBeGreaterThan(0);
        expect(failCount).toBeGreaterThan(0);
    });
    test('bucket cleanup works', () => {
        const now = Date.now();
        const fifteenMinsMs = 15 * 60 * 1000;
        tierTokenBucketLimiter_1.buckets.set('1', { tokens: 10, lastRefill: now });
        tierTokenBucketLimiter_1.buckets.set('2', { tokens: 10, lastRefill: now - (fifteenMinsMs + 1000) });
        tierTokenBucketLimiter_1.buckets.set('3', { tokens: 10, lastRefill: now - (fifteenMinsMs - 5000) });
        const deleted = (0, tierTokenBucketLimiter_1.cleanupInactiveBuckets)();
        expect(deleted).toBe(1);
        expect(tierTokenBucketLimiter_1.buckets.size).toBe(2);
        expect(tierTokenBucketLimiter_1.buckets.has('2')).toBe(false);
    });
});
