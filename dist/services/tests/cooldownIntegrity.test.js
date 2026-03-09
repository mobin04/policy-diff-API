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
const pageRepository = __importStar(require("../../repositories/page.repository"));
const cooldownRepository = __importStar(require("../../repositories/cooldown.repository"));
const fetchPageUtil = __importStar(require("../../utils/fetchPage"));
// Mock dependencies
jest.mock('../../repositories/page.repository');
jest.mock('../../repositories/cooldown.repository');
jest.mock('../../utils/fetchPage');
jest.mock('../../utils/canonicalizeUrl', () => ({
    canonicalizeUrl: (inputUrl) => inputUrl,
}));
describe('Cooldown Integrity Instrumentation', () => {
    const mockUrl = 'https://example.com/policy';
    const mockPageId = 123;
    beforeEach(() => {
        jest.clearAllMocks();
    });
    test('should log COOLDOWN_CACHE_HIT and record normal hit when in cooldown', async () => {
        const mockLastResult = {
            message: 'No changes',
            content_isolation: 'success',
            isolation_drift: false,
        };
        pageRepository.getPageInfo.mockResolvedValue({
            id: mockPageId,
            isolationFingerprint: 'stable-fingerprint',
        });
        pageRepository.checkCooldown.mockResolvedValue({
            inCooldown: true,
            lastCheckedAt: new Date(),
            lastResult: mockLastResult,
        });
        const mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
        };
        const result = await (0, page_service_1.checkPage)(mockUrl, { minInterval: 10, logger: mockLogger });
        expect(result.status).toBe('skipped');
        expect(mockLogger.info).toHaveBeenCalledWith(expect.objectContaining({
            canonical_url: mockUrl,
            cooldown_window_ms: 600000,
        }), 'COOLDOWN_CACHE_HIT');
        // Verify metrics recording
        expect(cooldownRepository.recordCooldownHit).toHaveBeenCalledWith(mockPageId, false, // integrityWarning
        false);
    });
    test('should trigger COOLDOWN_CACHE_INTEGRITY_WARNING when fingerprint is missing', async () => {
        pageRepository.getPageInfo.mockResolvedValue({
            id: mockPageId,
            isolationFingerprint: null, // MISSING FINGERPRINT
        });
        pageRepository.checkCooldown.mockResolvedValue({
            inCooldown: true,
            lastCheckedAt: new Date(),
            lastResult: { message: 'Existing' },
        });
        const mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
        };
        await (0, page_service_1.checkPage)(mockUrl, { minInterval: 10, logger: mockLogger });
        expect(mockLogger.warn).toHaveBeenCalledWith({ canonical_url: mockUrl }, 'COOLDOWN_CACHE_INTEGRITY_WARNING');
        expect(cooldownRepository.recordCooldownHit).toHaveBeenCalledWith(mockPageId, true, // integrityWarning: true
        false);
    });
    test('should trigger COOLDOWN_AFTER_ISOLATION_DRIFT when previous drift was detected', async () => {
        const mockResultWithDrift = {
            message: 'Changes',
            isolation_drift: true, // DRIFT WAS TRUE
        };
        pageRepository.getPageInfo.mockResolvedValue({
            id: mockPageId,
            isolationFingerprint: 'some-fp',
        });
        pageRepository.checkCooldown.mockResolvedValue({
            inCooldown: true,
            lastCheckedAt: new Date(),
            lastResult: mockResultWithDrift,
        });
        const mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
        };
        await (0, page_service_1.checkPage)(mockUrl, { minInterval: 10, logger: mockLogger });
        expect(mockLogger.warn).toHaveBeenCalledWith({ canonical_url: mockUrl }, 'COOLDOWN_AFTER_ISOLATION_DRIFT');
        expect(cooldownRepository.recordCooldownHit).toHaveBeenCalledWith(mockPageId, false, true);
    });
    test('should handle edge case where both integrity warning and drift occur', async () => {
        pageRepository.getPageInfo.mockResolvedValue({
            id: mockPageId,
            isolationFingerprint: null, // Integrity issue
        });
        pageRepository.checkCooldown.mockResolvedValue({
            inCooldown: true,
            lastCheckedAt: new Date(),
            lastResult: { message: 'x', isolation_drift: true }, // Drift issue
        });
        const mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
        };
        await (0, page_service_1.checkPage)(mockUrl, { minInterval: 10, logger: mockLogger });
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ canonical_url: mockUrl }), 'COOLDOWN_CACHE_INTEGRITY_WARNING');
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ canonical_url: mockUrl }), 'COOLDOWN_AFTER_ISOLATION_DRIFT');
        expect(cooldownRepository.recordCooldownHit).toHaveBeenCalledWith(mockPageId, true, true);
    });
    test('should NOT record cooldown hit when not in cooldown', async () => {
        pageRepository.getPageInfo.mockResolvedValue({ id: mockPageId });
        pageRepository.checkCooldown.mockResolvedValue({ inCooldown: false });
        fetchPageUtil.fetchPage.mockResolvedValue('<html></html>');
        // We need to mock the rest of the pipeline to avoid failures in checkPage
        jest.mock('../normalizer.service', () => ({
            normalizeHtml: jest.fn((h) => h),
            normalizeContent: jest.fn((h) => h),
        }));
        jest.mock('../../utils/mainContentExtractor', () => ({
            extractMainContent: jest.fn(() => ({ content: '', fingerprint: 'fp', usedFallback: false })),
        }));
        jest.mock('../sectionExtractor.service', () => ({
            extractSections: jest.fn(() => []),
        }));
        jest.mock('../hash.service', () => ({
            generateDateMaskedHash: jest.fn(() => 'hash'),
        }));
        jest.mock('../riskEngine.service', () => ({
            analyzeRisk: jest.fn(() => ({ risk_level: 'LOW', changes: [] })),
        }));
        jest.mock('../isolationStability.service', () => ({
            detectIsolationDrift: jest.fn(() => false),
        }));
        pageRepository.savePage.mockResolvedValue({ status: 'unchanged', pageId: mockPageId });
        await (0, page_service_1.checkPage)(mockUrl, { minInterval: 10 });
        expect(cooldownRepository.recordCooldownHit).not.toHaveBeenCalled();
    });
});
