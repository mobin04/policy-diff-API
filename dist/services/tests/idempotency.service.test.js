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
const hash_1 = require("../../utils/hash");
jest.mock('../../repositories/idempotency.repository');
jest.mock('../requestAbuse.service');
jest.mock('../../utils/hash');
describe('IdempotencyService', () => {
    const mockApiKeyId = 1;
    const mockKey = 'test-key';
    const mockBody = { url: 'test' };
    const mockHash = 'hash123';
    beforeEach(() => {
        jest.clearAllMocks();
        hash_1.generateHash.mockReturnValue(mockHash);
    });
    describe('checkIdempotency', () => {
        test('should return null if idempotencyKey is undefined', async () => {
            const result = await (0, idempotency_service_1.checkIdempotency)(mockApiKeyId, undefined, mockBody);
            expect(result).toBeNull();
            expect(idempotencyRepository.getIdempotencyRecord).not.toHaveBeenCalled();
        });
        test('should return null if no record exists', async () => {
            idempotencyRepository.getIdempotencyRecord.mockResolvedValue(null);
            const result = await (0, idempotency_service_1.checkIdempotency)(mockApiKeyId, mockKey, mockBody);
            expect(result).toBeNull();
        });
        test('should propagate repository errors', async () => {
            idempotencyRepository.getIdempotencyRecord.mockRejectedValue(new Error('DB_FAIL'));
            await expect((0, idempotency_service_1.checkIdempotency)(mockApiKeyId, mockKey, mockBody)).rejects.toThrow('DB_FAIL');
        });
    });
    describe('storeIdempotency', () => {
        const mockResponse = { result: 'ok' };
        test('should store record if key is provided', async () => {
            await (0, idempotency_service_1.storeIdempotency)(mockApiKeyId, mockKey, mockBody, mockResponse);
            expect(idempotencyRepository.saveIdempotencyRecord).toHaveBeenCalledWith(mockApiKeyId, mockKey, mockHash, mockResponse);
        });
        test('should do nothing if key is undefined', async () => {
            await (0, idempotency_service_1.storeIdempotency)(mockApiKeyId, undefined, mockBody, mockResponse);
            expect(idempotencyRepository.saveIdempotencyRecord).not.toHaveBeenCalled();
        });
        test('should propagate repository errors', async () => {
            idempotencyRepository.saveIdempotencyRecord.mockRejectedValue(new Error('SAVE_FAIL'));
            await expect((0, idempotency_service_1.storeIdempotency)(mockApiKeyId, mockKey, mockBody, mockResponse)).rejects.toThrow('SAVE_FAIL');
        });
    });
});
