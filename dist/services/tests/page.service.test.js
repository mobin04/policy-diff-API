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
const page_service_1 = require("../page.service");
const fetchPage_1 = require("../../utils/fetchPage");
const pageRepository = __importStar(require("../../repositories/page.repository"));
const cooldownRepository = __importStar(require("../../repositories/cooldown.repository"));
const canonicalizeUrl_1 = require("../../utils/canonicalizeUrl");
const mainContentExtractor_1 = require("../../utils/mainContentExtractor");
const normalizer_service_1 = require("../normalizer.service");
const sectionExtractor_service_1 = require("../sectionExtractor.service");
const hash_service_1 = require("../hash.service");
const riskEngine_service_1 = require("../riskEngine.service");
const isolationStability_service_1 = require("../isolationStability.service");
jest.mock('../../utils/fetchPage');
jest.mock('../../repositories/page.repository');
jest.mock('../../repositories/cooldown.repository');
jest.mock('../../utils/canonicalizeUrl');
jest.mock('../../utils/mainContentExtractor');
jest.mock('../normalizer.service');
jest.mock('../sectionExtractor.service');
jest.mock('../hash.service');
jest.mock('../riskEngine.service');
jest.mock('../isolationStability.service');
describe('PageService', () => {
    const mockUrl = 'https://example.com';
    const mockCanonicalUrl = 'https://example.com/';
    beforeEach(() => {
        jest.clearAllMocks();
        canonicalizeUrl_1.canonicalizeUrl.mockReturnValue(mockCanonicalUrl);
        fetchPage_1.fetchPage.mockResolvedValue('<html></html>');
        normalizer_service_1.normalizeHtml.mockReturnValue('normalized html');
        mainContentExtractor_1.extractMainContent.mockReturnValue({ content: 'isolated', fingerprint: 'fp', usedFallback: false });
        isolationStability_service_1.detectIsolationDrift.mockReturnValue(false);
        normalizer_service_1.normalizeContent.mockReturnValue('normalized content');
        sectionExtractor_service_1.extractSections.mockReturnValue([]);
        hash_service_1.generateDateMaskedHash.mockReturnValue('hash');
        riskEngine_service_1.analyzeRisk.mockReturnValue({ risk_level: 'LOW', changes: [] });
    });
    describe('happy path - no cooldown', () => {
        test('should process a first-time page version', async () => {
            pageRepository.getPageInfo.mockResolvedValue(null);
            pageRepository.savePage.mockResolvedValue({
                status: 'first_version',
                pageId: 1
            });
            const result = await (0, page_service_1.checkPage)(mockUrl);
            expect(result.status).toBe('processed');
            expect(result.result?.message).toBe('First snapshot stored');
            expect(pageRepository.updatePageCache).toHaveBeenCalledWith(1, result.result, 'fp');
        });
        test('should process an unchanged page version', async () => {
            pageRepository.getPageInfo.mockResolvedValue({ id: 1, isolationFingerprint: 'fp' });
            pageRepository.savePage.mockResolvedValue({
                status: 'unchanged',
                pageId: 1
            });
            const result = await (0, page_service_1.checkPage)(mockUrl);
            expect(result.status).toBe('processed');
            expect(result.result?.message).toBe('No meaningful change detected');
        });
        test('should process a modified page version with risk analysis', async () => {
            const mockChanges = [{ type: 'MODIFIED', section: 'S', details: [] }];
            pageRepository.getPageInfo.mockResolvedValue({ id: 1, isolationFingerprint: 'fp' });
            pageRepository.savePage.mockResolvedValue({
                status: 'modified',
                pageId: 1,
                changes: mockChanges
            });
            riskEngine_service_1.analyzeRisk.mockReturnValue({ risk_level: 'MEDIUM', changes: mockChanges.map(c => ({ ...c, risk: 'MEDIUM', reason: 'R' })) });
            const result = await (0, page_service_1.checkPage)(mockUrl);
            expect(result.status).toBe('processed');
            expect(result.result?.message).toBe('Changes detected');
            expect(result.result?.risk_level).toBe('MEDIUM');
            expect(riskEngine_service_1.analyzeRisk).toHaveBeenCalledWith(mockChanges, [], undefined);
        });
    });
    describe('cooldown scenarios', () => {
        test('should return skipped status if in cooldown', async () => {
            pageRepository.getPageInfo.mockResolvedValue({ id: 1, isolationFingerprint: 'fp' });
            pageRepository.checkCooldown.mockResolvedValue({
                inCooldown: true,
                lastCheckedAt: new Date(),
                lastResult: { message: 'Cached' }
            });
            const result = await (0, page_service_1.checkPage)(mockUrl, { minInterval: 10 });
            expect(result.status).toBe('skipped');
            expect(result.result?.message).toBe('Cached');
            expect(fetchPage_1.fetchPage).not.toHaveBeenCalled();
            expect(cooldownRepository.recordCooldownHit).toHaveBeenCalled();
        });
        test('should process if NOT in cooldown despite minInterval', async () => {
            pageRepository.getPageInfo.mockResolvedValue({ id: 1, isolationFingerprint: 'fp' });
            pageRepository.checkCooldown.mockResolvedValue({ inCooldown: false });
            pageRepository.savePage.mockResolvedValue({ status: 'unchanged', pageId: 1 });
            const result = await (0, page_service_1.checkPage)(mockUrl, { minInterval: 10 });
            expect(result.status).toBe('processed');
            expect(fetchPage_1.fetchPage).toHaveBeenCalled();
        });
    });
    describe('edge cases', () => {
        test('should detect and log isolation drift', async () => {
            pageRepository.getPageInfo.mockResolvedValue({ id: 1, isolationFingerprint: 'old-fp' });
            isolationStability_service_1.detectIsolationDrift.mockReturnValue(true);
            pageRepository.savePage.mockResolvedValue({ status: 'unchanged', pageId: 1 });
            const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn() };
            const result = await (0, page_service_1.checkPage)(mockUrl, { logger: mockLogger });
            expect(result.result?.isolation_drift).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ current_fingerprint: 'fp' }), 'ISOLATION_CONTAINER_DRIFT_DETECTED');
        });
        test('should handle fallback isolation status', async () => {
            pageRepository.getPageInfo.mockResolvedValue(null);
            mainContentExtractor_1.extractMainContent.mockReturnValue({ content: 'iso', fingerprint: 'fp', usedFallback: true });
            pageRepository.savePage.mockResolvedValue({ status: 'first_version', pageId: 1 });
            const result = await (0, page_service_1.checkPage)(mockUrl);
            expect(result.result?.content_isolation).toBe('fallback');
        });
    });
    describe('failure scenarios', () => {
        test('should propagate fetch errors', async () => {
            pageRepository.getPageInfo.mockResolvedValue(null);
            fetchPage_1.fetchPage.mockRejectedValue(new Error('FETCH_FAIL'));
            await expect((0, page_service_1.checkPage)(mockUrl)).rejects.toThrow('FETCH_FAIL');
        });
        test('should propagate repository errors', async () => {
            pageRepository.getPageInfo.mockRejectedValue(new Error('DB_FAIL'));
            await expect((0, page_service_1.checkPage)(mockUrl)).rejects.toThrow('DB_FAIL');
        });
    });
});
