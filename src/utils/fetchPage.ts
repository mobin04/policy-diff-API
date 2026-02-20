import axios, { AxiosError } from 'axios';
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
    const res = await axios.get<string>(url, {
      timeout: 10000, // 10 second timeout
      maxRedirects: 5,
      signal,
      headers: {
        'User-Agent': 'PolicyDiffBot/1.0 (+https://yourdomain.com)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      // Ensure we get string data
      responseType: 'text',
    });

    const html = res.data;

    // Validate fetched content before returning
    validateFetchedContent(html);

    return html;
  } catch (error) {
    // Handle Axios errors specifically
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      // HTTP error response (4xx, 5xx)
      if (axiosError.response) {
        const status = axiosError.response.status;

        // Specialized handling for blocking
        if (status === 403 || status === 429) {
          throw new PageAccessBlockedError();
        }

        throw new HttpError(`Target URL returned ${status}`, status);
      }

      // Request made but no response received (timeout, DNS, network)
      if (axiosError.request) {
        // Categorize the error based on code
        const code = axiosError.code;

        if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
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
        throw new FetchError('Unable to reach target URL', code || 'unknown');
      }

      // Error setting up request
      throw new FetchError(`Request failed: ${axiosError.message}`, 'request');
    }

    // Non-Axios error (should not happen, but handle gracefully)
    throw new FetchError('Unexpected error during fetch', 'unknown');
  }
}

/**
 * Validate fetched HTML content for SPAs, bot-blocking, and minimum content.
 * Throws deterministic API errors if content is invalid.
 */
function validateFetchedContent(html: string): void {
  const lowerHtml = html.toLowerCase();

  // Detect Bot Blocking / CAPTCHA patterns
  const blockingPatterns = ['captcha', 'verify you are human', 'access denied', 'cloudflare'];
  if (blockingPatterns.some((pattern) => lowerHtml.includes(pattern))) {
    throw new PageAccessBlockedError();
  }

  // Load HTML for deeper analysis
  const $ = cheerio.load(html);

  // Detect JS-heavy SPA shells
  // Extract body text (stripping script/style content)
  const bodyText = $('body').text() || '';
  const totalTextLength = bodyText.trim().length;

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
