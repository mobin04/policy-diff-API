"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const concurrencyReconciliation_service_1 = require("../concurrencyReconciliation.service");
const monitorJob_repository_1 = require("../../repositories/monitorJob.repository");
const concurrencyGuard_1 = require("../../utils/concurrencyGuard");
// Mock dependencies
jest.mock('../../repositories/monitorJob.repository');
jest.mock('../../utils/concurrencyGuard');
describe('Concurrency Reconciliation Service Tests', () => {
    let mockLogger;
    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = {
            error: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            trace: jest.fn(),
            fatal: jest.fn(),
            silent: jest.fn(),
            level: 'info',
        };
        (0, concurrencyReconciliation_service_1.initReconciliation)(mockLogger);
    });
    test('should return silently when counts match', async () => {
        monitorJob_repository_1.countProcessingJobs.mockResolvedValue(5);
        concurrencyGuard_1.getActiveJobCount.mockReturnValue(5);
        await (0, concurrencyReconciliation_service_1.reconcileConcurrencyState)();
        expect(monitorJob_repository_1.countProcessingJobs).toHaveBeenCalled();
        expect(concurrencyGuard_1.getActiveJobCount).toHaveBeenCalled();
        expect(concurrencyGuard_1.resetActiveJobs).not.toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
    });
    test('should repair and log error when in-memory count is higher than DB count', async () => {
        monitorJob_repository_1.countProcessingJobs.mockResolvedValue(3);
        concurrencyGuard_1.getActiveJobCount.mockReturnValue(5);
        await (0, concurrencyReconciliation_service_1.reconcileConcurrencyState)();
        expect(concurrencyGuard_1.resetActiveJobs).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({
            event: 'concurrency_drift_detected',
            in_memory_count: 5,
            db_count: 3,
        }), expect.any(String));
        expect(mockLogger.info).toHaveBeenCalledWith(expect.objectContaining({
            event: 'concurrency_drift_repaired',
            corrected_to_db: 3,
        }), expect.any(String));
    });
    test('should repair and log error when in-memory count is lower than DB count', async () => {
        monitorJob_repository_1.countProcessingJobs.mockResolvedValue(5);
        concurrencyGuard_1.getActiveJobCount.mockReturnValue(2);
        await (0, concurrencyReconciliation_service_1.reconcileConcurrencyState)();
        expect(concurrencyGuard_1.resetActiveJobs).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({
            event: 'concurrency_drift_detected',
            in_memory_count: 2,
            db_count: 5,
        }), expect.any(String));
    });
    test('should handle repository errors gracefully without crashing', async () => {
        const error = new Error('Database connection failed');
        monitorJob_repository_1.countProcessingJobs.mockRejectedValue(error);
        await expect((0, concurrencyReconciliation_service_1.reconcileConcurrencyState)()).resolves.not.toThrow();
        expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({
            err: error,
            event: 'concurrency_reconciliation_failure',
        }), expect.any(String));
        expect(concurrencyGuard_1.resetActiveJobs).not.toHaveBeenCalled();
    });
    test('should function correctly without a logger initialized', async () => {
        // Re-initialize without logger
        concurrencyReconciliation_service_1.initReconciliation(null);
        monitorJob_repository_1.countProcessingJobs.mockResolvedValue(2);
        concurrencyGuard_1.getActiveJobCount.mockReturnValue(5);
        await (0, concurrencyReconciliation_service_1.reconcileConcurrencyState)();
        expect(concurrencyGuard_1.resetActiveJobs).toHaveBeenCalled();
        // No errors should be thrown despite logger being null
    });
    test('should handle edge case of zero jobs correctly', async () => {
        monitorJob_repository_1.countProcessingJobs.mockResolvedValue(0);
        concurrencyGuard_1.getActiveJobCount.mockReturnValue(0);
        await (0, concurrencyReconciliation_service_1.reconcileConcurrencyState)();
        expect(concurrencyGuard_1.resetActiveJobs).not.toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
    });
    test('should handle edge case of one job drift', async () => {
        monitorJob_repository_1.countProcessingJobs.mockResolvedValue(1);
        concurrencyGuard_1.getActiveJobCount.mockReturnValue(0);
        await (0, concurrencyReconciliation_service_1.reconcileConcurrencyState)();
        expect(concurrencyGuard_1.resetActiveJobs).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalled();
    });
});
