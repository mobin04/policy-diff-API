import { checkPage } from '../page.service';
import * as pageRepository from '../../repositories/page.repository';
import * as cooldownRepository from '../../repositories/cooldown.repository';
import * as fetchPageUtil from '../../utils/fetchPage';
import { DiffResult } from '../../types';

// Mock dependencies
jest.mock('../../repositories/page.repository');
jest.mock('../../repositories/cooldown.repository');
jest.mock('../../utils/fetchPage');
jest.mock('../../utils/canonicalizeUrl', () => ({
  canonicalizeUrl: jest.fn((inputUrl: string) => inputUrl),
}));

describe('Cooldown Integrity Instrumentation', () => {
  const mockUrl = 'https://example.com/policy';
  const mockPageId = 123;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should log COOLDOWN_CACHE_HIT and record normal hit when in cooldown', async () => {
    const mockLastResult: DiffResult = {
      message: 'No changes',
      content_isolation: 'success',
      isolation_drift: false,
    };

    (pageRepository.getPageInfo as jest.Mock).mockResolvedValue({
      id: mockPageId,
      isolationFingerprint: 'stable-fingerprint',
    });

    (pageRepository.checkCooldown as jest.Mock).mockResolvedValue({
      inCooldown: true,
      lastCheckedAt: new Date(),
      lastResult: mockLastResult,
    });

    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    };

    const result = await checkPage(mockUrl, { minInterval: 10, logger: mockLogger });

    expect(result.status).toBe('skipped');
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        canonical_url: mockUrl,
        cooldown_window_ms: 600000,
      }),
      'COOLDOWN_CACHE_HIT'
    );

    // Verify metrics recording
    expect(cooldownRepository.recordCooldownHit).toHaveBeenCalledWith(
      mockPageId,
      false, // integrityWarning
      false  // isolationDriftDetected
    );
  });

  test('should trigger COOLDOWN_CACHE_INTEGRITY_WARNING when fingerprint is missing', async () => {
    (pageRepository.getPageInfo as jest.Mock).mockResolvedValue({
      id: mockPageId,
      isolationFingerprint: null, // MISSING FINGERPRINT
    });

    (pageRepository.checkCooldown as jest.Mock).mockResolvedValue({
      inCooldown: true,
      lastCheckedAt: new Date(),
      lastResult: { message: 'Existing' },
    });

    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    };

    await checkPage(mockUrl, { minInterval: 10, logger: mockLogger });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      { canonicalUrl: mockUrl },
      'COOLDOWN_CACHE_INTEGRITY_WARNING'
    );

    expect(cooldownRepository.recordCooldownHit).toHaveBeenCalledWith(
      mockPageId,
      true, // integrityWarning: true
      false
    );
  });

  test('should trigger COOLDOWN_AFTER_ISOLATION_DRIFT when previous drift was detected', async () => {
    const mockResultWithDrift: DiffResult = {
      message: 'Changes',
      isolation_drift: true, // DRIFT WAS TRUE
    };

    (pageRepository.getPageInfo as jest.Mock).mockResolvedValue({
      id: mockPageId,
      isolationFingerprint: 'some-fp',
    });

    (pageRepository.checkCooldown as jest.Mock).mockResolvedValue({
      inCooldown: true,
      lastCheckedAt: new Date(),
      lastResult: mockResultWithDrift,
    });

    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    };

    await checkPage(mockUrl, { minInterval: 10, logger: mockLogger });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      { canonicalUrl: mockUrl },
      'COOLDOWN_AFTER_ISOLATION_DRIFT'
    );

    expect(cooldownRepository.recordCooldownHit).toHaveBeenCalledWith(
      mockPageId,
      false,
      true // isolationDriftDetected: true
    );
  });

  test('should handle edge case where both integrity warning and drift occur', async () => {
    (pageRepository.getPageInfo as jest.Mock).mockResolvedValue({
      id: mockPageId,
      isolationFingerprint: null, // Integrity issue
    });

    (pageRepository.checkCooldown as jest.Mock).mockResolvedValue({
      inCooldown: true,
      lastCheckedAt: new Date(),
      lastResult: { message: 'x', isolation_drift: true }, // Drift issue
    });

    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    };

    await checkPage(mockUrl, { minInterval: 10, logger: mockLogger });

    expect(mockLogger.warn).toHaveBeenCalledWith(expect.anything(), 'COOLDOWN_CACHE_INTEGRITY_WARNING');
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.anything(), 'COOLDOWN_AFTER_ISOLATION_DRIFT');

    expect(cooldownRepository.recordCooldownHit).toHaveBeenCalledWith(
      mockPageId,
      true,
      true
    );
  });

  test('should NOT record cooldown hit when not in cooldown', async () => {
    (pageRepository.getPageInfo as jest.Mock).mockResolvedValue({ id: mockPageId });
    (pageRepository.checkCooldown as jest.Mock).mockResolvedValue({ inCooldown: false });
    (fetchPageUtil.fetchPage as jest.Mock).mockResolvedValue('<html></html>');
    
    // We need to mock the rest of the pipeline to avoid failures in checkPage
    jest.mock('../normalizer.service', () => ({
      normalizeHtml: jest.fn(h => h),
      normalizeContent: jest.fn(h => h),
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
    (pageRepository.savePage as jest.Mock).mockResolvedValue({ status: 'unchanged', pageId: mockPageId });

    await checkPage(mockUrl, { minInterval: 10 });

    expect(cooldownRepository.recordCooldownHit).not.toHaveBeenCalled();
  });
});
