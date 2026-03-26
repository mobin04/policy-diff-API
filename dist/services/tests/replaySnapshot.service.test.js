"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const replaySnapshot_service_1 = require("../replaySnapshot.service");
const canonicalizeUrl_1 = require("../../utils/canonicalizeUrl");
const fetchPage_1 = require("../../utils/fetchPage");
const replaySnapshot_repository_1 = require("../../repositories/replaySnapshot.repository");
const errors_1 = require("../../errors");
jest.mock('../../utils/canonicalizeUrl');
jest.mock('../../utils/fetchPage');
jest.mock('../../repositories/replaySnapshot.repository');
describe('ReplaySnapshotService', () => {
    const mockUrl = 'https://example.com';
    const mockCanonicalUrl = 'https://example.com/';
    const mockHtml = '<html><body>Test</body></html>';
    const mockId = 'uuid-123';
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('happy path', () => {
        test('should capture and store snapshot successfully', async () => {
            canonicalizeUrl_1.canonicalizeUrl.mockReturnValue(mockCanonicalUrl);
            fetchPage_1.fetchPage.mockResolvedValue(mockHtml);
            replaySnapshot_repository_1.createReplaySnapshot.mockResolvedValue({ id: mockId });
            const result = await (0, replaySnapshot_service_1.captureReplaySnapshot)(mockUrl);
            expect(result).toEqual({
                snapshotId: mockId,
                canonicalUrl: mockCanonicalUrl,
            });
            expect(canonicalizeUrl_1.canonicalizeUrl).toHaveBeenCalledWith(mockUrl);
            expect(fetchPage_1.fetchPage).toHaveBeenCalledWith(mockCanonicalUrl);
            expect(replaySnapshot_repository_1.createReplaySnapshot).toHaveBeenCalledWith(mockCanonicalUrl, mockHtml);
        });
    });
    describe('failure scenarios', () => {
        test('should propagate canonicalization errors', async () => {
            canonicalizeUrl_1.canonicalizeUrl.mockImplementation(() => {
                throw new Error('INVALID_URL');
            });
            await expect((0, replaySnapshot_service_1.captureReplaySnapshot)('bad-url')).rejects.toThrow('INVALID_URL');
        });
        test('should propagate fetch errors (ApiError)', async () => {
            canonicalizeUrl_1.canonicalizeUrl.mockReturnValue(mockCanonicalUrl);
            const fetchError = new errors_1.FetchError('Failed to fetch', 'dns');
            fetchPage_1.fetchPage.mockRejectedValue(fetchError);
            await expect((0, replaySnapshot_service_1.captureReplaySnapshot)(mockUrl)).rejects.toThrow(errors_1.FetchError);
        });
        test('should propagate repository errors', async () => {
            canonicalizeUrl_1.canonicalizeUrl.mockReturnValue(mockCanonicalUrl);
            fetchPage_1.fetchPage.mockResolvedValue(mockHtml);
            replaySnapshot_repository_1.createReplaySnapshot.mockRejectedValue(new Error('DB_FAIL'));
            await expect((0, replaySnapshot_service_1.captureReplaySnapshot)(mockUrl)).rejects.toThrow('DB_FAIL');
        });
    });
    describe('edge cases', () => {
        test('should handle very large HTML content', async () => {
            const largeHtml = 'a'.repeat(10 * 1024 * 1024); // 10MB
            canonicalizeUrl_1.canonicalizeUrl.mockReturnValue(mockCanonicalUrl);
            fetchPage_1.fetchPage.mockResolvedValue(largeHtml);
            replaySnapshot_repository_1.createReplaySnapshot.mockResolvedValue({ id: mockId });
            const result = await (0, replaySnapshot_service_1.captureReplaySnapshot)(mockUrl);
            expect(result.snapshotId).toBe(mockId);
            expect(replaySnapshot_repository_1.createReplaySnapshot).toHaveBeenCalledWith(mockCanonicalUrl, largeHtml);
        });
    });
});
