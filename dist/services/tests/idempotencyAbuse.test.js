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
const idempotency_service_1 = require("../idempotency.service");
const idempotencyRepository = __importStar(require("../../repositories/idempotency.repository"));
const requestAbuseService = __importStar(require("../requestAbuse.service"));
const hash_1 = require("../../utils/hash");
const errors_1 = require("../../errors");
jest.mock('../../repositories/idempotency.repository');
jest.mock('../requestAbuse.service');
jest.mock('../../utils/hash');
describe('Idempotency Abuse Instrumentation', () => {
    const mockApiKeyId = 1;
    const mockKey = 'test-key';
    const mockBody = { url: 'test' };
    const mockHash = 'hash123';
    beforeEach(() => {
        jest.clearAllMocks();
        hash_1.generateHash.mockReturnValue(mockHash);
    });
    test('should record IDEMPOTENCY_REUSE when payload matches', async () => {
        idempotencyRepository.getIdempotencyRecord.mockResolvedValue({
            requestHash: mockHash,
            responseBody: { ok: true },
        });
        const result = await (0, idempotency_service_1.checkIdempotency)(mockApiKeyId, mockKey, mockBody);
        expect(result).toEqual({ ok: true });
        expect(requestAbuseService.recordAbuseEvent).toHaveBeenCalledWith('IDEMPOTENCY_REUSE', mockApiKeyId, undefined, { idempotency_key: mockKey });
    });
    test('should record IDEMPOTENCY_CONFLICT when payload differs', async () => {
        idempotencyRepository.getIdempotencyRecord.mockResolvedValue({
            requestHash: 'different-hash',
            responseBody: { ok: true },
        });
        const mockLogger = { info: jest.fn(), warn: jest.fn() };
        await expect((0, idempotency_service_1.checkIdempotency)(mockApiKeyId, mockKey, mockBody, mockLogger))
            .rejects.toThrow(errors_1.ConflictError);
        expect(requestAbuseService.recordAbuseEvent).toHaveBeenCalledWith('IDEMPOTENCY_CONFLICT', mockApiKeyId, undefined, { idempotency_key: mockKey });
        expect(mockLogger.warn).toHaveBeenCalledWith({ api_key_id: mockApiKeyId, idempotency_key: mockKey }, 'IDEMPOTENCY_CONFLICT');
    });
});
