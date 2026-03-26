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
Object.defineProperty(exports, "__esModule", { value: true });
const monitorJob_service_1 = require("../monitorJob.service");
const monitorBatch_service_1 = require("../monitorBatch.service");
const monitorJobRepository = __importStar(require("../../repositories/monitorJob.repository"));
const apiKeyRepository = __importStar(require("../../repositories/apiKey.repository"));
const pageRepository = __importStar(require("../../repositories/page.repository"));
const db_1 = require("../../db");
const errors_1 = require("../../errors");
jest.mock('../../repositories/monitorJob.repository');
jest.mock('../../repositories/apiKey.repository');
jest.mock('../../repositories/page.repository');
jest.mock('../../db');
describe('Tier System V2 Enforcement', () => {
    const mockApiKeyId = 1;
    const mockUrl = 'https://example.com';
    beforeEach(() => {
        jest.clearAllMocks();
        db_1.DB.connect.mockResolvedValue({
            query: jest.fn(),
            release: jest.fn(),
        });
    });
    describe('URL Limit Enforcement', () => {
        test('FREE tier should not exceed 3 unique URLs', async () => {
            const mockUsage = { id: mockApiKeyId, tier: 'FREE', monthly_usage: 0, monthly_quota: 30 };
            // Mock repository calls
            apiKeyRepository.countDistinctUrlsForKey.mockResolvedValue(3);
            db_1.DB.connect.mockResolvedValue({
                query: jest.fn().mockImplementation((sql, params) => {
                    if (sql.includes('FROM api_keys'))
                        return { rows: [mockUsage] };
                    if (sql.includes('SELECT id FROM pages'))
                        return { rows: [] }; // URL not already monitored
                    if (sql.includes('BEGIN') || sql.includes('COMMIT'))
                        return {};
                    return { rows: [] };
                }),
                release: jest.fn(),
            });
            await expect((0, monitorJob_service_1.createMonitorJob)(mockApiKeyId, mockUrl)).rejects.toThrow(errors_1.UrlLimitExceededError);
        });
        test('STARTER tier should not exceed 10 unique URLs', async () => {
            const mockUsage = { id: mockApiKeyId, tier: 'STARTER', monthly_usage: 0, monthly_quota: 500 };
            apiKeyRepository.countDistinctUrlsForKey.mockResolvedValue(10);
            db_1.DB.connect.mockResolvedValue({
                query: jest.fn().mockImplementation((sql, params) => {
                    if (sql.includes('FROM api_keys'))
                        return { rows: [mockUsage] };
                    if (sql.includes('SELECT id FROM pages'))
                        return { rows: [] };
                    if (sql.includes('BEGIN') || sql.includes('COMMIT'))
                        return {};
                    return { rows: [] };
                }),
                release: jest.fn(),
            });
            await expect((0, monitorJob_service_1.createMonitorJob)(mockApiKeyId, mockUrl)).rejects.toThrow(errors_1.UrlLimitExceededError);
        });
        test('PRO tier should not exceed 25 unique URLs', async () => {
            const mockUsage = { id: mockApiKeyId, tier: 'PRO', monthly_usage: 0, monthly_quota: 2500 };
            apiKeyRepository.countDistinctUrlsForKey.mockResolvedValue(25);
            db_1.DB.connect.mockResolvedValue({
                query: jest.fn().mockImplementation((sql, params) => {
                    if (sql.includes('FROM api_keys'))
                        return { rows: [mockUsage] };
                    if (sql.includes('SELECT id FROM pages'))
                        return { rows: [] };
                    if (sql.includes('BEGIN') || sql.includes('COMMIT'))
                        return {};
                    return { rows: [] };
                }),
                release: jest.fn(),
            });
            await expect((0, monitorJob_service_1.createMonitorJob)(mockApiKeyId, mockUrl)).rejects.toThrow(errors_1.UrlLimitExceededError);
        });
        test('should allow monitoring an ALREADY monitored URL even if limit reached', async () => {
            const mockUsage = { id: mockApiKeyId, tier: 'FREE', monthly_usage: 0, monthly_quota: 30 };
            apiKeyRepository.countDistinctUrlsForKey.mockResolvedValue(3);
            db_1.DB.connect.mockResolvedValue({
                query: jest.fn().mockImplementation((sql, params) => {
                    if (sql.includes('FROM api_keys'))
                        return { rows: [mockUsage] };
                    if (sql.includes('SELECT id FROM pages'))
                        return { rows: [{ id: 100 }] };
                    if (sql.includes('SELECT 1 FROM monitor_jobs'))
                        return { rows: [{ 1: 1 }] }; // Already monitored
                    if (sql.includes('BEGIN') || sql.includes('COMMIT'))
                        return {};
                    if (sql.includes('UPDATE api_keys'))
                        return { rowCount: 1 };
                    return { rows: [] };
                }),
                release: jest.fn(),
            });
            pageRepository.ensurePageExists.mockResolvedValue(100);
            monitorJobRepository.createJob.mockResolvedValue({ id: 'job-1', status: 'PENDING' });
            const result = await (0, monitorJob_service_1.createMonitorJob)(mockApiKeyId, mockUrl);
            expect(result.id).toBe('job-1');
        });
    });
    describe('Batch Limit Enforcement', () => {
        test('FREE tier should reject more than 3 URLs', async () => {
            const mockUsage = { id: mockApiKeyId, tier: 'FREE', monthly_usage: 0, monthly_quota: 30 };
            const urls = ['http://1.com', 'http://2.com', 'http://3.com', 'http://4.com'];
            db_1.DB.connect.mockResolvedValue({
                query: jest.fn().mockImplementation((sql) => {
                    if (sql.includes('FROM api_keys'))
                        return { rows: [mockUsage] };
                    if (sql.includes('BEGIN') || sql.includes('ROLLBACK'))
                        return {};
                    return { rows: [] };
                }),
                release: jest.fn(),
            });
            await expect((0, monitorBatch_service_1.createMonitorBatch)(mockApiKeyId, urls)).rejects.toThrow(errors_1.BatchLimitExceededError);
        });
        test('PRO tier should allow 25 URLs', async () => {
            const mockUsage = { id: mockApiKeyId, tier: 'PRO', monthly_usage: 0, monthly_quota: 2500 };
            const urls = Array.from({ length: 25 }, (_, i) => `http://${i}.com`);
            db_1.DB.connect.mockResolvedValue({
                query: jest.fn().mockImplementation((sql) => {
                    if (sql.includes('FROM api_keys'))
                        return { rows: [mockUsage] };
                    if (sql.includes('BEGIN') || sql.includes('COMMIT'))
                        return {};
                    if (sql.includes('UPDATE api_keys'))
                        return { rowCount: 1 };
                    if (sql.includes('INSERT INTO monitor_batches'))
                        return { rows: [{ id: 'b1' }] };
                    if (sql.includes('SELECT id FROM pages'))
                        return { rows: [] };
                    if (sql.includes('SELECT 1 FROM monitor_jobs'))
                        return { rows: [] };
                    return { rows: [] };
                }),
                release: jest.fn(),
            });
            apiKeyRepository.countDistinctUrlsForKey.mockResolvedValue(0);
            pageRepository.ensurePageExists.mockResolvedValue(1);
            monitorJobRepository.createJob.mockResolvedValue({ id: 'j', status: 'PENDING' });
            const result = await (0, monitorBatch_service_1.createMonitorBatch)(mockApiKeyId, urls);
            expect(result.total_jobs).toBe(25);
        });
    });
    describe('Concurrency Limit Enforcement', () => {
        test('FREE tier should enforce 1 concurrent job', async () => {
            const mockUsage = { id: mockApiKeyId, tier: 'FREE' };
            const jobId = 'job-1';
            monitorJobRepository.getJobById.mockResolvedValue({
                id: jobId,
                apiKeyId: mockApiKeyId,
                pageId: 10,
            });
            monitorJobRepository.getActiveJobCountForKey.mockResolvedValue(1);
            db_1.DB.query.mockResolvedValue({ rows: [mockUsage] });
            const { processMonitorJob } = require('../monitorJob.service');
            const { acquireJob, releaseJob } = require('../../utils/concurrencyGuard');
            // Setup guard mock
            const guard = require('../../utils/concurrencyGuard');
            jest.spyOn(guard, 'acquireJob').mockReturnValue(true);
            jest.spyOn(guard, 'releaseJob').mockReturnValue(true);
            await processMonitorJob(jobId);
            // Should release job and re-enqueue if limit reached
            expect(guard.releaseJob).toHaveBeenCalledWith(jobId);
        });
    });
});
