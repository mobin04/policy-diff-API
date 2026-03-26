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
const monitorJobService = __importStar(require("../monitorJob.service"));
const db_1 = require("../../db");
const canonicalizeUrl_1 = require("../../utils/canonicalizeUrl");
const pageRepository = __importStar(require("../../repositories/page.repository"));
const monitorJobRepository = __importStar(require("../../repositories/monitorJob.repository"));
const apiKeyRepository = __importStar(require("../../repositories/apiKey.repository"));
const idempotencyRepository = __importStar(require("../../repositories/idempotency.repository"));
const usageService = __importStar(require("../usage.service"));
const errors_1 = require("../../errors");
jest.mock('../../db');
jest.mock('../../utils/canonicalizeUrl');
jest.mock('../../repositories/page.repository');
jest.mock('../../repositories/monitorJob.repository');
jest.mock('../../repositories/apiKey.repository');
jest.mock('../../repositories/idempotency.repository');
jest.mock('../usage.service');
// We need to mock the module but keep createMonitorJob original
jest.mock('../monitorJob.service', () => {
    const actual = jest.requireActual('../monitorJob.service');
    return {
        ...actual,
        enqueueMonitorJobProcessing: jest.fn(),
    };
});
describe('MonitorJobService', () => {
    const mockApiKeyId = 1;
    const mockUrl = 'https://example.com';
    const mockCanonicalUrl = 'https://example.com/';
    const mockJob = { id: 'job-123', status: 'PENDING' };
    let mockClient;
    beforeEach(() => {
        jest.clearAllMocks();
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
        canonicalizeUrl_1.canonicalizeUrl.mockReturnValue(mockCanonicalUrl);
        usageService.consumeJobsWithClient.mockResolvedValue({
            tier: 'FREE',
            monthlyUsage: 1,
            monthlyQuota: 100,
            remaining: 99,
        });
        apiKeyRepository.countDistinctUrlsForKey.mockResolvedValue(0);
        pageRepository.ensurePageExists.mockResolvedValue(1);
        monitorJobRepository.createJob.mockResolvedValue(mockJob);
    });
    describe('createMonitorJob', () => {
        describe('happy path', () => {
            test('should create job successfully and enqueue for processing', async () => {
                const result = await monitorJobService.createMonitorJob(mockApiKeyId, mockUrl);
                expect(result).toEqual(mockJob);
                expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
                expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
                expect(mockClient.release).toHaveBeenCalled();
                expect(canonicalizeUrl_1.canonicalizeUrl).toHaveBeenCalledWith(mockUrl);
                expect(usageService.consumeJobsWithClient).toHaveBeenCalled();
                expect(pageRepository.ensurePageExists).toHaveBeenCalledWith(mockCanonicalUrl, mockClient);
                expect(monitorJobRepository.createJob).toHaveBeenCalledWith(1, mockApiKeyId, null, mockClient);
            });
            test('should store idempotency if requested', async () => {
                const idem = { key: 'k', requestHash: 'h' };
                await monitorJobService.createMonitorJob(mockApiKeyId, mockUrl, undefined, idem);
                expect(idempotencyRepository.saveIdempotencyRecord).toHaveBeenCalledWith(mockApiKeyId, idem.key, idem.requestHash, { job_id: mockJob.id, status: mockJob.status }, mockClient);
            });
        });
        describe('failure scenarios', () => {
            test('should throw QuotaExceededError if limit reached', async () => {
                usageService.consumeJobsWithClient.mockRejectedValue(new errors_1.QuotaExceededError());
                await expect(monitorJobService.createMonitorJob(mockApiKeyId, mockUrl)).rejects.toThrow(errors_1.QuotaExceededError);
                expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            });
            test('should rollback on error', async () => {
                monitorJobRepository.createJob.mockRejectedValue(new Error('DB_FAIL'));
                await expect(monitorJobService.createMonitorJob(mockApiKeyId, mockUrl)).rejects.toThrow('DB_FAIL');
                expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
                expect(mockClient.release).toHaveBeenCalled();
            });
        });
    });
});
