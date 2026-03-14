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
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchPage = fetchPage;
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
        // Dynamic import to support ESM-only got-scraping in CJS project
        // We use eval('import(...)') to prevent TS/Webpack from transforming it to require()
        const { gotScraping } = await eval('import("got-scraping")');
        const response = await gotScraping.get(url, {
            timeout: { request: 10000 },
            maxRedirects: 5,
            signal,
            headerGeneratorOptions: {
                browsers: [
                    { name: 'chrome' },
                    { name: 'firefox' },
                    { name: 'safari' },
                ],
                devices: ['desktop'],
                locales: ['en-US'],
            },
            retry: { limit: 0 },
        });
        const html = response.body;
        // Validate fetched content before returning
        validateFetchedContent(html);
        return html;
    }
    catch (error) {
        // Cast to access properties since we're dealing with dynamic imports and unknown types
        const err = error;
        // Handle HTTP errors (4xx, 5xx)
        // We check the name because instanceof might fail across dynamic imports in some environments
        if (err.name === 'HTTPError') {
            const status = err.response?.statusCode;
            // Specialized handling for blocking
            if (status === 403 || status === 429) {
                throw new errors_1.PageAccessBlockedError();
            }
            if (status) {
                throw new errors_1.HttpError(`Target URL returned ${status}`, status);
            }
        }
        // Handle Request errors (timeout, DNS, network)
        if (err.name === 'RequestError') {
            const code = err.code;
            if (code === 'ETIMEDOUT') {
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
            throw new errors_1.FetchError(`Unable to reach target URL: ${err.message}`, code || 'unknown');
        }
        // Pass through already classified API errors (they have statusCode but aren't FetchError/HttpError)
        if (err.statusCode && (error instanceof Error || err.name)) {
            throw error;
        }
        // Unexpected error
        const message = err.message || 'Unknown error during fetch';
        throw new errors_1.FetchError(`Unexpected error during fetch: ${message}`, 'unknown');
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
