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
const replayValidator_service_1 = require("../replayValidator.service");
const replaySnapshotRepository = __importStar(require("../../repositories/replaySnapshot.repository"));
const pipelineSnapshotService = __importStar(require("../pipelineSnapshot.service"));
jest.mock('../../repositories/replaySnapshot.repository');
jest.mock('../pipelineSnapshot.service');
describe('ReplayValidatorService', () => {
    const mockSnapshotId = '123e4567-e89b-12d3-a456-426614174000';
    const mockRawHtml = '<html><body><h1>Policy</h1></body></html>';
    const mockPipelineResult = {
        normalizedContent: 'Policy',
        sections: [{ title: 'Main', content: 'Policy', hash: 'hash1' }],
        metadata: { title: 'Policy' }
    };
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('happy path', () => {
        test('should validate successfully when pipeline is deterministic', async () => {
            replaySnapshotRepository.getSnapshotRawHtml.mockResolvedValue(mockRawHtml);
            pipelineSnapshotService.processSnapshot.mockReturnValue(mockPipelineResult);
            await expect((0, replayValidator_service_1.validateSnapshotDeterminism)(mockSnapshotId, 3)).resolves.not.toThrow();
            expect(replaySnapshotRepository.getSnapshotRawHtml).toHaveBeenCalledWith(mockSnapshotId);
            expect(pipelineSnapshotService.processSnapshot).toHaveBeenCalledTimes(3);
            expect(pipelineSnapshotService.processSnapshot).toHaveBeenCalledWith(mockRawHtml);
        });
        test('should pass with 1 run', async () => {
            replaySnapshotRepository.getSnapshotRawHtml.mockResolvedValue(mockRawHtml);
            pipelineSnapshotService.processSnapshot.mockReturnValue(mockPipelineResult);
            await expect((0, replayValidator_service_1.validateSnapshotDeterminism)(mockSnapshotId, 1)).resolves.not.toThrow();
            expect(pipelineSnapshotService.processSnapshot).toHaveBeenCalledTimes(1);
        });
        test('should pass with 0 runs (no-op)', async () => {
            replaySnapshotRepository.getSnapshotRawHtml.mockResolvedValue(mockRawHtml);
            await expect((0, replayValidator_service_1.validateSnapshotDeterminism)(mockSnapshotId, 0)).resolves.not.toThrow();
            expect(pipelineSnapshotService.processSnapshot).not.toHaveBeenCalled();
        });
    });
    describe('failure scenarios', () => {
        test('should throw SNAPSHOT_NOT_FOUND if snapshot does not exist', async () => {
            replaySnapshotRepository.getSnapshotRawHtml.mockResolvedValue(null);
            await expect((0, replayValidator_service_1.validateSnapshotDeterminism)(mockSnapshotId, 1)).rejects.toThrow('SNAPSHOT_NOT_FOUND');
        });
        test('should throw NON_DETERMINISTIC_PIPELINE_DETECTED if output drifts', async () => {
            replaySnapshotRepository.getSnapshotRawHtml.mockResolvedValue(mockRawHtml);
            // First run returns baseline
            // Second run returns slightly different result
            pipelineSnapshotService.processSnapshot
                .mockReturnValueOnce(mockPipelineResult)
                .mockReturnValueOnce({
                ...mockPipelineResult,
                normalizedContent: 'Policy Drifted'
            });
            await expect((0, replayValidator_service_1.validateSnapshotDeterminism)(mockSnapshotId, 2))
                .rejects.toThrow('NON_DETERMINISTIC_PIPELINE_DETECTED');
            expect(pipelineSnapshotService.processSnapshot).toHaveBeenCalledTimes(2);
        });
        test('should throw if even minor metadata difference occurs', async () => {
            replaySnapshotRepository.getSnapshotRawHtml.mockResolvedValue(mockRawHtml);
            pipelineSnapshotService.processSnapshot
                .mockReturnValueOnce(mockPipelineResult)
                .mockReturnValueOnce({
                ...mockPipelineResult,
                metadata: { title: 'Policy Changed' }
            });
            await expect((0, replayValidator_service_1.validateSnapshotDeterminism)(mockSnapshotId, 2))
                .rejects.toThrow('NON_DETERMINISTIC_PIPELINE_DETECTED');
        });
    });
    describe('edge cases', () => {
        test('should handle very large HTML content', async () => {
            const largeHtml = 'a'.repeat(1024 * 1024);
            replaySnapshotRepository.getSnapshotRawHtml.mockResolvedValue(largeHtml);
            pipelineSnapshotService.processSnapshot.mockReturnValue(mockPipelineResult);
            await expect((0, replayValidator_service_1.validateSnapshotDeterminism)(mockSnapshotId, 2)).resolves.not.toThrow();
        });
        test('should propagate repository errors', async () => {
            replaySnapshotRepository.getSnapshotRawHtml.mockRejectedValue(new Error('DB_ERROR'));
            await expect((0, replayValidator_service_1.validateSnapshotDeterminism)(mockSnapshotId, 1)).rejects.toThrow('DB_ERROR');
        });
        test('should propagate pipeline errors', async () => {
            replaySnapshotRepository.getSnapshotRawHtml.mockResolvedValue(mockRawHtml);
            pipelineSnapshotService.processSnapshot.mockImplementation(() => {
                throw new Error('PIPELINE_CRASH');
            });
            await expect((0, replayValidator_service_1.validateSnapshotDeterminism)(mockSnapshotId, 1)).rejects.toThrow('PIPELINE_CRASH');
        });
    });
    describe('deterministic behavior guarantees', () => {
        test('calling with same data multiple times results in same behavior', async () => {
            replaySnapshotRepository.getSnapshotRawHtml.mockResolvedValue(mockRawHtml);
            pipelineSnapshotService.processSnapshot.mockReturnValue(mockPipelineResult);
            // Call 1
            await (0, replayValidator_service_1.validateSnapshotDeterminism)(mockSnapshotId, 2);
            // Call 2
            await (0, replayValidator_service_1.validateSnapshotDeterminism)(mockSnapshotId, 2);
            expect(pipelineSnapshotService.processSnapshot).toHaveBeenCalledTimes(4);
        });
    });
});
