"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mainContentExtractor_1 = require("../mainContentExtractor");
describe('mainContentExtractor', () => {
    it('should extract content from a preferred container and include metadata', () => {
        const html = `
      <html>
        <body>
          <header>Header</header>
          <main>
            <p>${'A'.repeat(600)}</p>
          </main>
          <footer>Footer</footer>
        </body>
      </html>
    `;
        const result = (0, mainContentExtractor_1.extractMainContent)(html);
        expect(result.content).toContain('A'.repeat(600));
        expect(result.selectedSelector).toBe('main');
        expect(result.usedFallback).toBe(false);
        expect(result.textLength).toBeGreaterThanOrEqual(600);
        expect(result.fingerprint).toBeDefined();
        expect(typeof result.fingerprint).toBe('string');
    });
    it('should fallback to body when no preferred container is large enough', () => {
        const html = `
      <html>
        <body>
          <header>Header</header>
          <div class="too-small">
            <p>Short text</p>
          </div>
          <div class="content">
            <p>Short text</p>
          </div>
          <p id="actual-body-content">${'B'.repeat(1000)}</p>
          <footer>Footer</footer>
        </body>
      </html>
    `;
        const result = (0, mainContentExtractor_1.extractMainContent)(html);
        expect(result.selectedSelector).toBe('body');
        expect(result.usedFallback).toBe(true);
        expect(result.content).toContain('B'.repeat(1000));
        expect(result.content).not.toContain('Header');
        expect(result.content).not.toContain('Footer');
    });
    it('should generate a deterministic fingerprint', () => {
        const html = `
      <html>
        <body>
          <article>
            <p>${'C'.repeat(700)}</p>
          </article>
        </body>
      </html>
    `;
        const result1 = (0, mainContentExtractor_1.extractMainContent)(html);
        const result2 = (0, mainContentExtractor_1.extractMainContent)(html);
        expect(result1.fingerprint).toBe(result2.fingerprint);
        expect(result1.fingerprint).not.toBe('');
    });
    it('should change fingerprint if text length changes', () => {
        const html1 = `<html><body><main><p>${'D'.repeat(600)}</p></main></body></html>`;
        const html2 = `<html><body><main><p>${'D'.repeat(700)}</p></main></body></html>`;
        const result1 = (0, mainContentExtractor_1.extractMainContent)(html1);
        const result2 = (0, mainContentExtractor_1.extractMainContent)(html2);
        expect(result1.fingerprint).not.toBe(result2.fingerprint);
    });
    it('should change fingerprint if selector changes', () => {
        const html1 = `<html><body><main><p>${'E'.repeat(600)}</p></main></body></html>`;
        const html2 = `<html><body><article><p>${'E'.repeat(600)}</p></article></body></html>`;
        const result1 = (0, mainContentExtractor_1.extractMainContent)(html1);
        const result2 = (0, mainContentExtractor_1.extractMainContent)(html2);
        expect(result1.fingerprint).not.toBe(result2.fingerprint);
    });
});
