import * as cheerio from 'cheerio';
import { generateDateMaskedHash } from './hash.service';
import { Section } from '../types';

/**
 * WHY SECTION-LEVEL HASHING IMPROVES STABILITY:
 * - Enables O(1) comparison instead of string comparison
 * - Hash changes only when content actually changes
 * - Immune to whitespace/formatting variations after normalization
 * - Allows quick "no change" detection without full diff
 */

/**
 * Intermediate section type during extraction (before hash is computed)
 */
type PartialSection = {
  title: string;
  content: string;
};

/**
 * Normalize content for consistent hashing
 * Removes extra whitespace and normalizes for comparison
 */
function normalizeForHash(content: string): string {
  return content.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Extract sections from HTML and compute content hashes
 *
 * @param html - Raw HTML string
 * @returns Array of sections with title, content, and hash
 */
export function extractSections(html: string): Section[] {
  const $ = cheerio.load(html);
  const partialSections: PartialSection[] = [];
  let currentSection: PartialSection = { title: 'general', content: '' };

  function traverse(node: unknown): void {
    if (!node || typeof node !== 'object') return;

    const nodeObj = node as Record<string, unknown>;
    const type = typeof nodeObj.type === 'string' ? nodeObj.type : undefined;
    const name = typeof nodeObj.name === 'string' ? nodeObj.name : undefined;
    const children = Array.isArray(nodeObj.children) ? nodeObj.children : undefined;

    // Skip script and style elements
    if (type === 'script' || type === 'style' || name === 'script' || name === 'style') {
      return;
    }

    if (type === 'text') {
      const text = $(node as cheerio.Element)
        .text()
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        currentSection.content += (currentSection.content ? ' ' : '') + text;
      }
    } else if (type === 'tag') {
      if (name && ['h1', 'h2', 'h3'].includes(name)) {
        // Push previous section
        currentSection.content = currentSection.content.replace(/\s+/g, ' ').trim();
        if (currentSection.content || currentSection.title !== 'general') {
          partialSections.push(currentSection);
        }

        // Start new section
        currentSection = {
          title: $(node as cheerio.Element)
            .text()
            .toLowerCase()
            .trim(),
          content: '',
        };
      } else if (children) {
        children.forEach((child) => traverse(child));
      }
    } else if (children) {
      // Handle root or other node types
      children.forEach((child) => traverse(child));
    }
  }

  const body = $('body')[0];
  if (body) {
    traverse(body);
  } else {
    // Fallback if no body tag (e.g. partial HTML)
    const root = $.root()[0];
    if (root) {
      traverse(root);
    }
  }

  // Push the last section
  currentSection.content = currentSection.content.replace(/\s+/g, ' ').trim();
  if (currentSection.content || currentSection.title !== 'general') {
    partialSections.push(currentSection);
  }

  // Convert to full sections with hashes
  const sections: Section[] = partialSections.map((partial) => ({
    title: partial.title,
    content: partial.content,
    hash: generateDateMaskedHash(normalizeForHash(partial.content)),
  }));

  return sections;
}
