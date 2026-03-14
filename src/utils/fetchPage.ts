import * as cheerio from 'cheerio';
import {
  FetchError,
  HttpError,
  UnsupportedDynamicPageError,
  PageAccessBlockedError,
  InvalidPageContentError,
} from '../errors';

/**
 * Fetch a page's HTML content and validate it
 *
 * @param url - URL to fetch (should be canonical)
 * @param signal - AbortSignal to cancel the fetch
 * @returns HTML content as string
 */
export async function fetchPage(url: string, signal?: AbortSignal): Promise<string> {
  try {
    // Dynamic import to support ESM-only got-scraping in CJS project
    // We use eval('import(...)') to prevent TS/Webpack from transforming it to require()
    const { gotScraping } = await (eval('import("got-scraping")') as Promise<typeof import('got-scraping')>);

    const response = await gotScraping.get(url, {
      timeout: { request: 10000 },
      maxRedirects: 5,
      signal,
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome' }, { name: 'firefox' }, { name: 'safari' }],
        devices: ['desktop'],
        locales: ['en-US'],
      },
      retry: { limit: 0 },
      throwHttpErrors: true,
    });

    const html = response.body;

    // Validate fetched content before returning
    validateFetchedContent(html);

    return html;
  } catch (error: unknown) {
    // Cast to access properties since we're dealing with dynamic imports and unknown types
    const err = error as {
      name?: string;
      code?: string;
      message?: string;
      response?: { statusCode: number };
      statusCode?: number;
    };

    // Handle HTTP errors (4xx, 5xx)
    // We check the name because instanceof might fail across dynamic imports in some environments
    if (err.name === 'HTTPError') {
      const status = err.response?.statusCode;

      // Specialized handling for blocking
      if (status === 403 || status === 429) {
        throw new PageAccessBlockedError();
      }

      if (status) {
        throw new HttpError(`Target URL returned ${status}`, status);
      }
    }

    // Handle Request errors (timeout, DNS, network)
    if (err.name === 'RequestError') {
      const code = err.code;

      if (code === 'ETIMEDOUT') {
        throw new FetchError('Request timed out', 'timeout');
      }

      if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        throw new FetchError('Domain not found (DNS failure)', 'dns');
      }

      if (code === 'ECONNREFUSED') {
        throw new FetchError('Connection refused by server', 'connection');
      }

      if (code === 'ECONNRESET') {
        throw new FetchError('Connection reset by server', 'connection');
      }

      // Generic network error
      throw new FetchError(`Unable to reach target URL: ${err.message}`, code || 'unknown');
    }

    // Pass through already classified API errors (they have statusCode but aren't FetchError/HttpError)
    if (err.statusCode && (error instanceof Error || err.name)) {
      throw error;
    }

    // Unexpected error
    const message = err.message || 'Unknown error during fetch';
    throw new FetchError(`Unexpected error during fetch: ${message}`, 'unknown');
  }
}

/**
 * Validate fetched HTML content for SPAs, bot-blocking, and minimum content.
 * Throws deterministic API errors if content is invalid.
 */
function validateFetchedContent(html: string): void {
  // Load HTML for analysis
  const $ = cheerio.load(html);

  const title = $('title').text().toLowerCase();

  // Refined Bot Blocking detection (Title-based to avoid false positives in content)
  if (
    title.includes('access denied') ||
    title.includes('verify you are human') ||
    title.includes('attention required')
  ) {
    throw new PageAccessBlockedError();
  }

  // Detect JS-heavy SPA shells
  // Extract body text (stripping script/style content)
  const bodyText = $('body').text() || '';
  const totalTextLength = bodyText.trim().length;

  // Cloudflare block page check (low text content + cloudflare in title)
  if (title.includes('cloudflare') && totalTextLength < 200) {
    throw new PageAccessBlockedError();
  }

  const scriptTagCount = $('script').length;

  // SPA Shell Check: Low text, high scripts
  if (totalTextLength < 500 && scriptTagCount > 5) {
    throw new UnsupportedDynamicPageError();
  }

  // Empty Root Container Check: Common SPA root IDs with low text
  const rootContainers = ['#root', '#app', '#__next'];
  const hasEmptyRoot = rootContainers.some((selector) => $(selector).length > 0);

  if (hasEmptyRoot && totalTextLength < 500) {
    throw new UnsupportedDynamicPageError();
  }

  // Minimum Content Safety Check: Stripping scripts/styles for clean text length check
  // cheerio's .text() already excludes script/style content if used correctly,
  // but let's be explicit and remove them for the final length check.
  $('script, style').remove();
  const cleanTextLength = $('body').text().trim().length;

  if (cleanTextLength < 300) {
    throw new InvalidPageContentError();
  }
}
