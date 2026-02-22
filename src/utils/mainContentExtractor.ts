import * as cheerio from 'cheerio';

/**
 * Deterministic Content Isolation Layer
 *
 * This utility isolates the primary policy content container from HTML,
 * removing noise from navbars, headers, footers, and other layout elements.
 *
 * WHY ISOLATE CONTENT:
 * - Prevents false positives when global navbars/footers change
 * - Improves precision of section extraction
 * - Focuses compliance analysis on actual document content
 */

/**
 * Extract the primary policy content from raw HTML
 *
 * @param html - Raw HTML string
 * @returns Sanitized inner HTML of the chosen container, or body if none found
 */
export function extractMainContent(html: string): { html: string; status: 'success' | 'fallback' } {
  const $ = cheerio.load(html);

  // 1. Remove irrelevant elements globally
  const unwantedElements = [
    'header',
    'nav',
    'footer',
    'aside',
    'script',
    'style',
    'noscript',
    'iframe',
    'button',
    'form',
  ];
  $(unwantedElements.join(',')).remove();

  // 2. Candidate containers in priority order
  const candidates = [
    'main',
    'article',
    '[role="main"]',
    '#content',
    '#main',
    '.content',
    '.policy',
    '.terms',
  ];

  let bestCandidate: cheerio.Cheerio | null = null;
  let maxTextLength = 0;

  for (const selector of candidates) {
    const elements = $(selector);
    elements.each((_, element) => {
      const $el = $(element);
      const text = $el.text();
      const length = text.replace(/\s+/g, '').length;

      // Ignore if length < 500 characters
      if (length >= 500) {
        if (length > maxTextLength) {
          maxTextLength = length;
          bestCandidate = $el;
        }
      }
    });
  }

  // 3. Fallback to body if no suitable candidate found
  if (bestCandidate) {
    return {
      html: (bestCandidate as cheerio.Cheerio).html() || '',
      status: 'success',
    };
  }

  return {
    html: $('body').html() || html,
    status: 'fallback',
  };
}
