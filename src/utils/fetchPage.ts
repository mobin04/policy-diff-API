import axios, { AxiosError } from 'axios';
import { FetchError, HttpError } from '../errors';

/**
 * Fetch a page's HTML content
 *
 * @param url - URL to fetch (should be canonical)
 * @returns HTML content as string
 * @throws FetchError - DNS failure, timeout, network error
 * @throws HttpError - Server returned 4xx or 5xx status
 */
export async function fetchPage(url: string): Promise<string> {
  try {
    const res = await axios.get<string>(url, {
      timeout: 10000, // 10 second timeout
      maxRedirects: 5,
      headers: {
        // Identify as a bot for transparency
        'User-Agent': 'PolicyDiffBot/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
      // Ensure we get string data
      responseType: 'text',
    });

    return res.data;
  } catch (error) {
    // Handle Axios errors specifically
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      // HTTP error response (4xx, 5xx)
      if (axiosError.response) {
        const status = axiosError.response.status;
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
