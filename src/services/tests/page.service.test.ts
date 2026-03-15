import { checkPage } from '../page.service';
import { fetchPage } from '../../utils/fetchPage';
import * as pageRepository from '../../repositories/page.repository';
import * as cooldownRepository from '../../repositories/cooldown.repository';
import { canonicalizeUrl } from '../../utils/canonicalizeUrl';
import { extractMainContent } from '../../utils/mainContentExtractor';
import { normalizeHtml, normalizeContent } from '../normalizer.service';
import { extractSections } from '../sectionExtractor.service';
import { generateDateMaskedHash } from '../hash.service';
import { analyzeRisk } from '../riskEngine.service';
import { detectIsolationDrift } from '../isolationStability.service';

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
    (canonicalizeUrl as jest.Mock).mockReturnValue(mockCanonicalUrl);
    (fetchPage as jest.Mock).mockResolvedValue('<html></html>');
    (normalizeHtml as jest.Mock).mockReturnValue('normalized html');
    (extractMainContent as jest.Mock).mockReturnValue({ content: 'isolated', fingerprint: 'fp', usedFallback: false });
    (detectIsolationDrift as jest.Mock).mockReturnValue(false);
    (normalizeContent as jest.Mock).mockReturnValue('normalized content');
    (extractSections as jest.Mock).mockReturnValue([]);
    (generateDateMaskedHash as jest.Mock).mockReturnValue('hash');
    (analyzeRisk as jest.Mock).mockReturnValue({ risk_level: 'LOW', changes: [] });
  });

  describe('happy path - no cooldown', () => {
    test('should process a first-time page version', async () => {
      (pageRepository.getPageInfo as jest.Mock).mockResolvedValue(null);
      (pageRepository.savePage as jest.Mock).mockResolvedValue({
        status: 'first_version',
        pageId: 1,
      });

      const result = await checkPage(mockUrl);

      expect(result.status).toBe('processed');
      expect(result.result?.message).toBe('First snapshot stored');
      expect(pageRepository.updatePageCache).toHaveBeenCalledWith(1, result.result, 'fp');
    });

    test('should process an unchanged page version', async () => {
      (pageRepository.getPageInfo as jest.Mock).mockResolvedValue({ id: 1, isolationFingerprint: 'fp' });
      (pageRepository.savePage as jest.Mock).mockResolvedValue({
        status: 'unchanged',
        pageId: 1,
      });

      const result = await checkPage(mockUrl);

      expect(result.status).toBe('processed');
      expect(result.result?.message).toBe('No meaningful change detected');
    });

    test('should process a modified page version with risk analysis', async () => {
      const mockChanges = [{ type: 'MODIFIED', section: 'S', details: [] }];
      (pageRepository.getPageInfo as jest.Mock).mockResolvedValue({ id: 1, isolationFingerprint: 'fp' });
      (pageRepository.savePage as jest.Mock).mockResolvedValue({
        status: 'modified',
        pageId: 1,
        changes: mockChanges,
      });
      (analyzeRisk as jest.Mock).mockReturnValue({
        risk_level: 'MEDIUM',
        changes: mockChanges.map((c) => ({ ...c, risk: 'MEDIUM', reason: 'R' })),
      });

      const result = await checkPage(mockUrl);

      expect(result.status).toBe('processed');
      expect(result.result?.message).toBe('Changes detected');
      expect(result.result?.risk_level).toBe('MEDIUM');
      expect(analyzeRisk).toHaveBeenCalledWith(mockChanges, [], undefined);
    });
  });

  describe('cooldown scenarios', () => {
    test('should return skipped status if in cooldown', async () => {
      (pageRepository.getPageInfo as jest.Mock).mockResolvedValue({ id: 1, isolationFingerprint: 'fp' });
      (pageRepository.checkCooldown as jest.Mock).mockResolvedValue({
        inCooldown: true,
        lastCheckedAt: new Date(),
        lastResult: { message: 'Cached' },
      });

      const result = await checkPage(mockUrl, { minInterval: 10 });

      expect(result.status).toBe('skipped');
      expect(result.result?.message).toBe('Cached');
      expect(fetchPage).not.toHaveBeenCalled();
      expect(cooldownRepository.recordCooldownHit).toHaveBeenCalled();
    });

    test('should process if NOT in cooldown despite minInterval', async () => {
      (pageRepository.getPageInfo as jest.Mock).mockResolvedValue({ id: 1, isolationFingerprint: 'fp' });
      (pageRepository.checkCooldown as jest.Mock).mockResolvedValue({ inCooldown: false });
      (pageRepository.savePage as jest.Mock).mockResolvedValue({ status: 'unchanged', pageId: 1 });

      const result = await checkPage(mockUrl, { minInterval: 10 });

      expect(result.status).toBe('processed');
      expect(fetchPage).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    test('should detect and log isolation drift', async () => {
      (pageRepository.getPageInfo as jest.Mock).mockResolvedValue({ id: 1, isolationFingerprint: 'old-fp' });
      (detectIsolationDrift as jest.Mock).mockReturnValue(true);
      (pageRepository.savePage as jest.Mock).mockResolvedValue({ status: 'unchanged', pageId: 1 });

      const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn() };
      const result = await checkPage(mockUrl, { logger: mockLogger });

      expect(result.result?.isolation_drift).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ current_fingerprint: 'fp' }),
        'ISOLATION_CONTAINER_DRIFT_DETECTED',
      );
    });

    test('should handle fallback isolation status', async () => {
      (pageRepository.getPageInfo as jest.Mock).mockResolvedValue(null);
      (extractMainContent as jest.Mock).mockReturnValue({ content: 'iso', fingerprint: 'fp', usedFallback: true });
      (pageRepository.savePage as jest.Mock).mockResolvedValue({ status: 'first_version', pageId: 1 });

      const result = await checkPage(mockUrl);
      expect(result.result?.content_isolation).toBe('fallback');
    });
  });

  describe('failure scenarios', () => {
    test('should propagate fetch errors', async () => {
      (pageRepository.getPageInfo as jest.Mock).mockResolvedValue(null);
      (fetchPage as jest.Mock).mockRejectedValue(new Error('FETCH_FAIL'));

      await expect(checkPage(mockUrl)).rejects.toThrow('FETCH_FAIL');
    });

    test('should propagate repository errors', async () => {
      (pageRepository.getPageInfo as jest.Mock).mockRejectedValue(new Error('DB_FAIL'));

      await expect(checkPage(mockUrl)).rejects.toThrow('DB_FAIL');
    });
  });
});
