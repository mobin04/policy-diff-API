import * as cheerio from 'cheerio';
import { maskTemporalNoise } from '../utils/dateMasker';

/**
 * Normalizes structural elements (tables, lists) into stable canonical text.
 *
 * WHY: HTML tables and lists often produce unstable diff noise due to DOM formatting shifts.
 * This converts them into a stable Markdown-like format before hashing and section extraction.
 */
function normalizeStructuralElements($: ReturnType<typeof cheerio.load>): void {
  // 1. Table Normalization
  $('table').each((_: number, table: cheerio.Element) => {
    const rows: string[] = [];
    $(table)
      .find('tr')
      .each((_: number, tr: cheerio.Element) => {
        const cells: string[] = [];
        $(tr)
          .find('th, td')
          .each((_: number, cell: cheerio.Element) => {
            const cellText = $(cell).text().replace(/\s+/g, ' ').trim();
            cells.push(cellText);
          });
        if (cells.length > 0) {
          // Canonical form: | cell1 | cell2 |
          rows.push(`| ${cells.join(' | ')} |`);
        }
      });
    const canonicalTable = rows.join('\n');
    $(table).replaceWith(`<div data-policydiff-table="true">${canonicalTable}</div>`);
  });

  // 2. List Normalization
  function processList(list: cheerio.Element, level: number): string {
    const $list = $(list);
    const isOrdered = $list.is('ol');
    const items: string[] = [];

    $list.children('li').each((i: number, li: cheerio.Element) => {
      const $li = $(li);
      const indent = '  '.repeat(level);
      const prefix = isOrdered ? `${i + 1}. ` : '- ';

      // Extract text content only for the current LI, ignoring nested lists
      const $clone = $li.clone();
      $clone.children('ul, ol').remove();
      const itemText = $clone.text().replace(/\s+/g, ' ').trim();

      let result = `${indent}${prefix}${itemText}`;

      // Handle nested lists
      $li.children('ul, ol').each((_: number, nested: cheerio.Element) => {
        result += '\n' + processList(nested, level + 1);
      });

      items.push(result);
    });

    return items.join('\n');
  }

  $('ul, ol').each((_: number, list: cheerio.Element) => {
    // Only process top-level lists to avoid duplicate processing in recursive calls
    if ($(list).parents('li').length === 0) {
      const canonicalList = processList(list, 0);
      $(list).replaceWith(`<div data-policydiff-list="true">${canonicalList}</div>`);
    }
  });
}

/**
 * Performs structural and cleanup normalization on HTML.
 */
export function normalizeHtml(html: string): string {
  const maskedHtml = maskTemporalNoise(html);
  const $ = cheerio.load(maskedHtml);

  // 1. Remove unwanted tags (HTML cleaning)
  $('script, style, noscript').remove();

  // 2. Structural Normalization (Tables, Lists)
  normalizeStructuralElements($);

  return $.html();
}

/**
 * Extracts normalized text content from HTML for hashing.
 * Preserves structural markers (newlines and indentation) to ensure
 * stable hashing of tables and lists.
 */
export function normalizeContent(html: string): string {
  const normalizedHtml = normalizeHtml(html);
  const $ = cheerio.load(normalizedHtml);

  // Extract text from body or root
  const $body = $('body');
  const text = $body.length > 0 ? $body.text() : $.root().text();

  // Normalize whitespace line-by-line to preserve structural indentation
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join('\n')
    .trim();
}
