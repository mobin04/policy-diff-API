import { processSnapshot } from '../pipelineSnapshot.service';
import { extractMainContent } from '../../utils/mainContentExtractor';
import { maskTemporalNoise } from '../../utils/dateMasker';
import { normalizeHtml, normalizeContent } from '../normalizer.service';
import { extractSections } from '../sectionExtractor.service';
import { generateDateMaskedHash } from '../hash.service';
import { analyzeRisk } from '../riskEngine.service';

jest.mock('../../utils/mainContentExtractor');
jest.mock('../../utils/dateMasker');
jest.mock('../normalizer.service');
jest.mock('../sectionExtractor.service');
jest.mock('../hash.service');
jest.mock('../riskEngine.service');

describe('PipelineSnapshotService', () => {
  const mockRawHtml = '<html><body><h1>Policy</h1></body></html>';

  beforeEach(() => {
    jest.clearAllMocks();

    (extractMainContent as jest.Mock).mockReturnValue({ content: 'isolated content', fingerprint: 'fp' });
    (maskTemporalNoise as jest.Mock).mockReturnValue('masked content');
    (normalizeHtml as jest.Mock).mockReturnValue('normalized html');
    (normalizeContent as jest.Mock).mockReturnValue('normalized content');
    (extractSections as jest.Mock).mockReturnValue([
      { title: 'Z Section', content: 'Z content', hash: 'hashZ' },
      { title: 'A Section', content: 'A content', hash: 'hashA' },
    ]);
    (generateDateMaskedHash as jest.Mock).mockReturnValue('global-hash');
    (analyzeRisk as jest.Mock).mockReturnValue({ risk_level: 'MEDIUM', changes: [] });
  });

  describe('happy path', () => {
    test('should execute full pipeline and return stable result', () => {
      const result = processSnapshot(mockRawHtml);

      expect(result).toEqual({
        normalizedContent: 'normalized html',
        isolatedContent: 'isolated content',
        maskedContent: 'masked content',
        sections: [
          { title: 'A Section', content: 'A content', contentHash: 'hashA' },
          { title: 'Z Section', content: 'Z content', contentHash: 'hashZ' },
        ],
        globalHash: 'global-hash',
        riskLevel: 'MEDIUM',
      });

      // Verify coordination
      expect(extractMainContent).toHaveBeenCalledWith(mockRawHtml);
      expect(maskTemporalNoise).toHaveBeenCalledWith('isolated content');
      expect(normalizeHtml).toHaveBeenCalledWith('isolated content');
      expect(extractSections).toHaveBeenCalledWith('normalized html');
      expect(normalizeContent).toHaveBeenCalledWith('isolated content');
      expect(generateDateMaskedHash).toHaveBeenCalledWith('normalized content');
      expect(analyzeRisk).toHaveBeenCalled();
    });

    test('should maintain stable ordering of sections alphabetically', () => {
      (extractSections as jest.Mock).mockReturnValue([
        { title: 'Beta', content: '2', hash: 'h2' },
        { title: 'Alpha', content: '1', hash: 'h1' },
        { title: 'Gamma', content: '3', hash: 'h3' },
      ]);

      const result = processSnapshot(mockRawHtml);
      expect(result.sections[0].title).toBe('Alpha');
      expect(result.sections[1].title).toBe('Beta');
      expect(result.sections[2].title).toBe('Gamma');
    });

    test('should use secondary sort by contentHash if titles are identical', () => {
      (extractSections as jest.Mock).mockReturnValue([
        { title: 'S', content: 'c2', hash: 'hash2' },
        { title: 'S', content: 'c1', hash: 'hash1' },
      ]);

      const result = processSnapshot(mockRawHtml);
      expect(result.sections[0].contentHash).toBe('hash1');
      expect(result.sections[1].contentHash).toBe('hash2');
    });
  });

  describe('edge cases', () => {
    test('should handle empty HTML gracefully if dependencies allow', () => {
      (extractMainContent as jest.Mock).mockReturnValue({ content: '', fingerprint: '' });
      (extractSections as jest.Mock).mockReturnValue([]);

      const result = processSnapshot('');
      expect(result.sections).toHaveLength(0);
      expect(result.globalHash).toBe('global-hash');
    });
  });

  describe('failure scenarios', () => {
    test('should propagate errors from internal services', () => {
      (extractMainContent as jest.Mock).mockImplementation(() => {
        throw new Error('ISOLATION_FAILED');
      });

      expect(() => processSnapshot(mockRawHtml)).toThrow('ISOLATION_FAILED');
    });
  });

  describe('deterministic behavior guarantees', () => {
    test('identical inputs produce identical SnapshotPipelineResult', () => {
      const res1 = processSnapshot(mockRawHtml);
      const res2 = processSnapshot(mockRawHtml);
      expect(res1).toEqual(res2);
    });
  });
});
