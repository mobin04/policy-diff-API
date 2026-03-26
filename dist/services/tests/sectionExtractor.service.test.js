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
const sectionExtractor_service_1 = require("../sectionExtractor.service");
const hashService = __importStar(require("../hash.service"));
jest.mock('../hash.service');
describe('SectionExtractorService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        hashService.generateDateMaskedHash.mockImplementation((content) => `hash_${content.length}`);
    });
    describe('happy path', () => {
        test('should extract sections from basic HTML with headers', () => {
            const html = `
        <body>
          <h1>Main Title</h1>
          <p>Some intro text.</p>
          <h2>Sub Title</h2>
          <p>Sub content here.</p>
        </body>
      `;
            const sections = (0, sectionExtractor_service_1.extractSections)(html);
            expect(sections).toHaveLength(2);
            expect(sections[0]).toEqual({
                title: 'main title',
                content: 'Some intro text.',
                hash: 'hash_16',
            });
            expect(sections[1]).toEqual({
                title: 'sub title',
                content: 'Sub content here.',
                hash: 'hash_17',
            });
        });
        test('should handle content before the first header in "general" section', () => {
            const html = `
        <p>Pre-header content.</p>
        <h1>Header 1</h1>
        <p>Content 1</p>
      `;
            const sections = (0, sectionExtractor_service_1.extractSections)(html);
            expect(sections).toHaveLength(2);
            expect(sections[0].title).toBe('general');
            expect(sections[0].content).toBe('Pre-header content.');
        });
        test('should handle nested tags within sections', () => {
            const html = `
        <h1>Section</h1>
        <div>
          <p>Line 1 <span>with span</span></p>
          <ul>
            <li>Item 1</li>
          </ul>
        </div>
      `;
            const sections = (0, sectionExtractor_service_1.extractSections)(html);
            expect(sections).toHaveLength(1);
            expect(sections[0].content).toBe('Line 1 with span Item 1');
        });
    });
    describe('edge cases', () => {
        test('should handle empty HTML', () => {
            const sections = (0, sectionExtractor_service_1.extractSections)('');
            // Even with empty HTML, it might push the initial "general" section if not careful
            // Looking at the code: it only pushes if content or title !== 'general'
            expect(sections).toHaveLength(0);
        });
        test('should handle HTML with no headers', () => {
            const html = '<p>Just some text.</p>';
            const sections = (0, sectionExtractor_service_1.extractSections)(html);
            expect(sections).toHaveLength(1);
            expect(sections[0].title).toBe('general');
            expect(sections[0].content).toBe('Just some text.');
        });
        test('should skip script and style tags', () => {
            const html = `
        <h1>Title</h1>
        <script>console.log("bad")</script>
        <style>.bad { color: red }</style>
        <p>Good content</p>
      `;
            const sections = (0, sectionExtractor_service_1.extractSections)(html);
            expect(sections).toHaveLength(1);
            expect(sections[0].content).toBe('Good content');
        });
        test('should normalize whitespace in content', () => {
            const html = `<h1>Title</h1><p>  Multiple   spaces
and	newlines.  </p>`;
            const sections = (0, sectionExtractor_service_1.extractSections)(html);
            expect(sections[0].content).toBe('Multiple spaces and newlines.');
        });
        test('should handle large HTML content', () => {
            const pCount = 1000;
            const html = `<h1>Big</h1>` + `<p>Content</p>`.repeat(pCount);
            const sections = (0, sectionExtractor_service_1.extractSections)(html);
            expect(sections).toHaveLength(1);
            expect(sections[0].content.split(' ').length).toBe(pCount);
        });
        test('should handle multiple consecutive headers', () => {
            const html = `
        <h1>Header 1</h1>
        <h2>Header 2</h2>
        <p>Content</p>
      `;
            const sections = (0, sectionExtractor_service_1.extractSections)(html);
            expect(sections).toHaveLength(2);
            expect(sections[0].title).toBe('header 1');
            expect(sections[0].content).toBe('');
            expect(sections[1].title).toBe('header 2');
            expect(sections[1].content).toBe('Content');
        });
    });
    describe('deterministic behavior guarantees', () => {
        test('should produce identical sections for identical HTML', () => {
            const html = '<h1>A</h1><p>B</p>';
            const res1 = (0, sectionExtractor_service_1.extractSections)(html);
            const res2 = (0, sectionExtractor_service_1.extractSections)(html);
            expect(res1).toEqual(res2);
        });
    });
});
