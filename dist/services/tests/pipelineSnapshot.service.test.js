"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pipelineSnapshot_service_1 = require("../pipelineSnapshot.service");
const mainContentExtractor_1 = require("../../utils/mainContentExtractor");
const dateMasker_1 = require("../../utils/dateMasker");
const normalizer_service_1 = require("../normalizer.service");
const sectionExtractor_service_1 = require("../sectionExtractor.service");
const hash_service_1 = require("../hash.service");
const riskEngine_service_1 = require("../riskEngine.service");
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
        mainContentExtractor_1.extractMainContent.mockReturnValue({ content: 'isolated content', fingerprint: 'fp' });
        dateMasker_1.maskTemporalNoise.mockReturnValue('masked content');
        normalizer_service_1.normalizeHtml.mockReturnValue('normalized html');
        normalizer_service_1.normalizeContent.mockReturnValue('normalized content');
        sectionExtractor_service_1.extractSections.mockReturnValue([
            { title: 'Z Section', content: 'Z content', hash: 'hashZ' },
            { title: 'A Section', content: 'A content', hash: 'hashA' },
        ]);
        hash_service_1.generateDateMaskedHash.mockReturnValue('global-hash');
        riskEngine_service_1.analyzeRisk.mockReturnValue({ risk_level: 'MEDIUM', changes: [] });
    });
    describe('happy path', () => {
        test('should execute full pipeline and return stable result', () => {
            const result = (0, pipelineSnapshot_service_1.processSnapshot)(mockRawHtml);
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
            expect(mainContentExtractor_1.extractMainContent).toHaveBeenCalledWith(mockRawHtml);
            expect(dateMasker_1.maskTemporalNoise).toHaveBeenCalledWith('isolated content');
            expect(normalizer_service_1.normalizeHtml).toHaveBeenCalledWith('isolated content');
            expect(sectionExtractor_service_1.extractSections).toHaveBeenCalledWith('normalized html');
            expect(normalizer_service_1.normalizeContent).toHaveBeenCalledWith('isolated content');
            expect(hash_service_1.generateDateMaskedHash).toHaveBeenCalledWith('normalized content');
            expect(riskEngine_service_1.analyzeRisk).toHaveBeenCalled();
        });
        test('should maintain stable ordering of sections alphabetically', () => {
            sectionExtractor_service_1.extractSections.mockReturnValue([
                { title: 'Beta', content: '2', hash: 'h2' },
                { title: 'Alpha', content: '1', hash: 'h1' },
                { title: 'Gamma', content: '3', hash: 'h3' },
            ]);
            const result = (0, pipelineSnapshot_service_1.processSnapshot)(mockRawHtml);
            expect(result.sections[0].title).toBe('Alpha');
            expect(result.sections[1].title).toBe('Beta');
            expect(result.sections[2].title).toBe('Gamma');
        });
        test('should use secondary sort by contentHash if titles are identical', () => {
            sectionExtractor_service_1.extractSections.mockReturnValue([
                { title: 'S', content: 'c2', hash: 'hash2' },
                { title: 'S', content: 'c1', hash: 'hash1' },
            ]);
            const result = (0, pipelineSnapshot_service_1.processSnapshot)(mockRawHtml);
            expect(result.sections[0].contentHash).toBe('hash1');
            expect(result.sections[1].contentHash).toBe('hash2');
        });
    });
    describe('edge cases', () => {
        test('should handle empty HTML gracefully if dependencies allow', () => {
            mainContentExtractor_1.extractMainContent.mockReturnValue({ content: '', fingerprint: '' });
            sectionExtractor_service_1.extractSections.mockReturnValue([]);
            const result = (0, pipelineSnapshot_service_1.processSnapshot)('');
            expect(result.sections).toHaveLength(0);
            expect(result.globalHash).toBe('global-hash');
        });
    });
    describe('failure scenarios', () => {
        test('should propagate errors from internal services', () => {
            mainContentExtractor_1.extractMainContent.mockImplementation(() => {
                throw new Error('ISOLATION_FAILED');
            });
            expect(() => (0, pipelineSnapshot_service_1.processSnapshot)(mockRawHtml)).toThrow('ISOLATION_FAILED');
        });
    });
    describe('deterministic behavior guarantees', () => {
        test('identical inputs produce identical SnapshotPipelineResult', () => {
            const res1 = (0, pipelineSnapshot_service_1.processSnapshot)(mockRawHtml);
            const res2 = (0, pipelineSnapshot_service_1.processSnapshot)(mockRawHtml);
            expect(res1).toEqual(res2);
        });
    });
});
