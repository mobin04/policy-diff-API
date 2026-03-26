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
const monitorBatch_service_1 = require("../monitorBatch.service");
const db_1 = require("../../db");
const canonicalizeUrl_1 = require("../../utils/canonicalizeUrl");
const monitorBatchRepository = __importStar(require("../../repositories/monitorBatch.repository"));
const monitorJobRepository = __importStar(require("../../repositories/monitorJob.repository"));
const apiKeyRepository = __importStar(require("../../repositories/apiKey.repository"));
const idempotencyRepository = __importStar(require("../../repositories/idempotency.repository"));
const pageRepository = __importStar(require("../../repositories/page.repository"));
const usageService = __importStar(require("../usage.service"));
const monitorJobService = __importStar(require("../monitorJob.service"));
const errors_1 = require("../../errors");
jest.mock('../../db');
jest.mock('../../utils/canonicalizeUrl');
jest.mock('../../repositories/monitorBatch.repository');
jest.mock('../../repositories/monitorJob.repository');
jest.mock('../../repositories/apiKey.repository');
jest.mock('../../repositories/idempotency.repository');
jest.mock('../../repositories/page.repository');
jest.mock('../usage.service');
jest.mock('../monitorJob.service');
describe('MonitorBatchService', () => {
    const mockApiKeyId = 1;
    const mockUrls = ['https://a.com', 'https://b.com'];
    const mockBatchId = 'batch-123';
    let mockClient;
    beforeEach(() => {
        jest.clearAllMocks();
        monitorJobService.canAcceptNewJobs.mockReturnValue(true);
        monitorJobService.enqueueMonitorJobProcessing.mockReturnValue(undefined);
        mockClient = {
            query: jest.fn().mockImplementation((sql) => {
                if (sql.includes('SELECT id FROM pages'))
                    return { rows: [] };
                if (sql.includes('SELECT 1 FROM monitor_jobs'))
                    return { rows: [] };
                return { rows: [] };
            }),
            release: jest.fn(),
        };
        db_1.DB.connect.mockResolvedValue(mockClient);
        canonicalizeUrl_1.canonicalizeUrl.mockImplementation((url) => url + '/');
        usageService.loadUsageRowForUpdate.mockResolvedValue({
            tier: 'FREE',
            monthly_usage: 0,
            monthly_quota: 100,
        });
        usageService.consumeJobsWithClient.mockResolvedValue({
            tier: 'FREE',
            monthlyUsage: 2,
            monthlyQuota: 100,
            remaining: 98,
        });
        apiKeyRepository.countDistinctUrlsForKey.mockResolvedValue(0);
        monitorBatchRepository.createBatch.mockResolvedValue({ id: mockBatchId });
        pageRepository.ensurePageExists.mockResolvedValue(1);
        monitorJobRepository.createJob.mockResolvedValue({ id: 'j', status: 'PENDING' });
    });
    describe('createMonitorBatch', () => {
        describe('happy path', () => {
            test('should create batch successfully', async () => {
                const result = await (0, monitorBatch_service_1.createMonitorBatch)(mockApiKeyId, mockUrls);
                expect(result.batch_id).toBe(mockBatchId);
                expect(result.total_jobs).toBe(2);
                expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
                expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            });
            test('should deduplicate URLs by canonical identity', async () => {
                const urls = ['https://a.com', 'https://a.com/', 'HTTPS://A.COM'];
                canonicalizeUrl_1.canonicalizeUrl.mockReturnValue('https://a.com/');
                const result = await (0, monitorBatch_service_1.createMonitorBatch)(mockApiKeyId, urls);
                expect(result.total_jobs).toBe(1);
            });
            test('should store idempotency record if provided', async () => {
                const idempotency = { key: 'k', requestHash: 'h' };
                await (0, monitorBatch_service_1.createMonitorBatch)(mockApiKeyId, mockUrls, undefined, idempotency);
                expect(idempotencyRepository.saveIdempotencyRecord).toHaveBeenCalled();
            });
        });
        describe('failure scenarios & edge cases', () => {
            test('should throw BadRequestError for empty urls', async () => {
                await expect((0, monitorBatch_service_1.createMonitorBatch)(mockApiKeyId, [])).rejects.toThrow(errors_1.BadRequestError);
            });
            test('should throw TooManyRequestsError if server is overloaded', async () => {
                monitorJobService.canAcceptNewJobs.mockReturnValue(false);
                await expect((0, monitorBatch_service_1.createMonitorBatch)(mockApiKeyId, mockUrls)).rejects.toThrow(errors_1.TooManyRequestsError);
            });
            test('should rollback transaction on error', async () => {
                monitorBatchRepository.createBatch.mockRejectedValue(new Error('CRASH'));
                await expect((0, monitorBatch_service_1.createMonitorBatch)(mockApiKeyId, mockUrls)).rejects.toThrow('CRASH');
                expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
                expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            });
        });
    });
});
