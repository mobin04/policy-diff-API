import * as cheerio from 'cheerio';
import { generateHash } from './hash';

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

export type IsolationResult = {
  content: string;
  selectedSelector: string;
  textLength: number;
  candidateCount: number;
  usedFallback: boolean;
  fingerprint: string;
};

/**
 * Extract the primary policy content from raw HTML
 *
 * @param html - Raw HTML string
 * @returns IsolationResult containing sanitized content and metadata
 */
export function extractMainContent(html: string): IsolationResult {
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
  const candidates = ['main', 'article', '[role="main"]', '#content', '#main', '.content', '.policy', '.terms'];

  let bestCandidate: cheerio.Cheerio | null = null;
  let maxTextLength = 0;
  let selectedSelector = '';
  let candidateCount = 0;

  for (const selector of candidates) {
    const elements = $(selector);
    elements.each((_, element) => {
      candidateCount++;
      const $el = $(element);
      const text = $el.text();
      const length = text.replace(/\s+/g, '').length;

      // Ignore if length < 500 characters
      if (length >= 500) {
        if (length > maxTextLength) {
          maxTextLength = length;
          bestCandidate = $el;
          selectedSelector = selector;
        }
      }
    });
  }

  // 3. Fallback to body if no suitable candidate found
  let content = '';
  let usedFallback = false;

  if (bestCandidate) {
    content = (bestCandidate as cheerio.Cheerio).html() || '';
  } else {
    content = $('body').html() || html;
    usedFallback = true;
    selectedSelector = 'body';
  }

  const textLength = content.replace(/<[^>]*>/g, '').replace(/\s+/g, '').length;
  const fingerprint = generateHash(`${selectedSelector}${textLength}`);

  return {
    content,
    selectedSelector,
    textLength,
    candidateCount,
    usedFallback,
    fingerprint,
  };
}
