import * as cheerio from 'cheerio';

export function normalizeContent(html: string): string {
  const $ = cheerio.load(html);

  // Remove unwanted tags
  $('script, style, noscript').remove();

  // Extract text from body
  const text = $('body').text();

  // Normalize whitespace: replace multiple spaces/newlines with single space and trim
  return text.replace(/\s+/g, ' ').trim();
}
