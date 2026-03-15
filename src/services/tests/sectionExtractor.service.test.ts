import { extractSections } from '../sectionExtractor.service';
import * as hashService from '../hash.service';

jest.mock('../hash.service');

describe('SectionExtractorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (hashService.generateDateMaskedHash as jest.Mock).mockImplementation((content: string) => `hash_${content.length}`);
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
      const sections = extractSections(html);

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
      const sections = extractSections(html);

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
      const sections = extractSections(html);

      expect(sections).toHaveLength(1);
      expect(sections[0].content).toBe('Line 1 with span Item 1');
    });
  });

  describe('edge cases', () => {
    test('should handle empty HTML', () => {
      const sections = extractSections('');
      // Even with empty HTML, it might push the initial "general" section if not careful
      // Looking at the code: it only pushes if content or title !== 'general'
      expect(sections).toHaveLength(0);
    });

    test('should handle HTML with no headers', () => {
      const html = '<p>Just some text.</p>';
      const sections = extractSections(html);
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
      const sections = extractSections(html);
      expect(sections).toHaveLength(1);
      expect(sections[0].content).toBe('Good content');
    });

    test('should normalize whitespace in content', () => {
      const html = `<h1>Title</h1><p>  Multiple   spaces
and	newlines.  </p>`;
      const sections = extractSections(html);
      expect(sections[0].content).toBe('Multiple spaces and newlines.');
    });

    test('should handle large HTML content', () => {
      const pCount = 1000;
      const html = `<h1>Big</h1>` + `<p>Content</p>`.repeat(pCount);
      const sections = extractSections(html);
      expect(sections).toHaveLength(1);
      expect(sections[0].content.split(' ').length).toBe(pCount);
    });

    test('should handle multiple consecutive headers', () => {
      const html = `
        <h1>Header 1</h1>
        <h2>Header 2</h2>
        <p>Content</p>
      `;
      const sections = extractSections(html);
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
      const res1 = extractSections(html);
      const res2 = extractSections(html);
      expect(res1).toEqual(res2);
    });
  });
});
