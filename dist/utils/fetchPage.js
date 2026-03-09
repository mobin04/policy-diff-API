"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchPage = fetchPage;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const errors_1 = require("../errors");
/**
 * Fetch a page's HTML content and validate it
 *
 * @param url - URL to fetch (should be canonical)
 * @param signal - AbortSignal to cancel the fetch
 * @returns HTML content as string
 */
async function fetchPage(url, signal) {
    try {
        const res = await axios_1.default.get(url, {
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
    }
    catch (error) {
        // Handle Axios errors specifically
        if (axios_1.default.isAxiosError(error)) {
            const axiosError = error;
            // HTTP error response (4xx, 5xx)
            if (axiosError.response) {
                const status = axiosError.response.status;
                // Specialized handling for blocking
                if (status === 403 || status === 429) {
                    // console.log('something gonna wrong');
                    throw new errors_1.PageAccessBlockedError();
                }
                throw new errors_1.HttpError(`Target URL returned ${status}`, status);
            }
            // Request made but no response received (timeout, DNS, network)
            if (axiosError.request) {
                // Categorize the error based on code
                const code = axiosError.code;
                if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
                    throw new errors_1.FetchError('Request timed out', 'timeout');
                }
                if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
                    throw new errors_1.FetchError('Domain not found (DNS failure)', 'dns');
                }
                if (code === 'ECONNREFUSED') {
                    throw new errors_1.FetchError('Connection refused by server', 'connection');
                }
                if (code === 'ECONNRESET') {
                    throw new errors_1.FetchError('Connection reset by server', 'connection');
                }
                // Generic network error
                throw new errors_1.FetchError('Unable to reach target URL', code || 'unknown');
            }
            // Error setting up request
            throw new errors_1.FetchError(`Request failed: ${axiosError.message}`, 'request');
        }
        // Non-Axios error (should not happen, but handle gracefully)
        throw new errors_1.FetchError('Unexpected error during fetch', 'unknown');
    }
}
/**
 * Validate fetched HTML content for SPAs, bot-blocking, and minimum content.
 * Throws deterministic API errors if content is invalid.
 */
function validateFetchedContent(html) {
    // Load HTML for analysis
    const $ = cheerio.load(html);
    const title = $('title').text().toLowerCase();
    // Refined Bot Blocking detection (Title-based to avoid false positives in content)
    if (title.includes('access denied') ||
        title.includes('verify you are human') ||
        title.includes('attention required')) {
        throw new errors_1.PageAccessBlockedError();
    }
    // Detect JS-heavy SPA shells
    // Extract body text (stripping script/style content)
    const bodyText = $('body').text() || '';
    const totalTextLength = bodyText.trim().length;
    // Cloudflare block page check (low text content + cloudflare in title)
    if (title.includes('cloudflare') && totalTextLength < 200) {
        throw new errors_1.PageAccessBlockedError();
    }
    const scriptTagCount = $('script').length;
    // SPA Shell Check: Low text, high scripts
    if (totalTextLength < 500 && scriptTagCount > 5) {
        throw new errors_1.UnsupportedDynamicPageError();
    }
    // Empty Root Container Check: Common SPA root IDs with low text
    const rootContainers = ['#root', '#app', '#__next'];
    const hasEmptyRoot = rootContainers.some((selector) => $(selector).length > 0);
    if (hasEmptyRoot && totalTextLength < 500) {
        throw new errors_1.UnsupportedDynamicPageError();
    }
    // Minimum Content Safety Check: Stripping scripts/styles for clean text length check
    // cheerio's .text() already excludes script/style content if used correctly,
    // but let's be explicit and remove them for the final length check.
    $('script, style').remove();
    const cleanTextLength = $('body').text().trim().length;
    if (cleanTextLength < 300) {
        throw new errors_1.InvalidPageContentError();
    }
}
