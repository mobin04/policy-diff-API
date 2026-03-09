"use strict";
/**
 * URL Canonicalization Utility
 *
 * WHY CANONICALIZATION MUST HAPPEN BEFORE DB LOOKUP:
 * Without canonicalization, the same logical page can create multiple database
 * entries. For example, "Example.com/privacy" and "example.com/privacy" would
 * be treated as different pages, causing the "first snapshot" bug.
 *
 * WHY PROTOCOL NORMALIZATION MATTERS:
 * HTTP and HTTPS versions of the same URL should be treated as one identity.
 * Forcing HTTPS ensures consistent lookups and prevents split identity where
 * http://example.com and https://example.com create separate page records.
 *
 * WHY REMOVING QUERY PARAMS PREVENTS DUPLICATE IDENTITY:
 * Query parameters like ?utm_source=twitter or ?ref=homepage don't change
 * the policy content, but would create separate page records without removal.
 * This causes the same page to show "first snapshot" repeatedly.
 *
 * WHY FORCING HTTPS PREVENTS SPLIT IDENTITY:
 * Most sites redirect HTTP to HTTPS anyway. By normalizing to HTTPS, we ensure
 * that regardless of what the user provides, we always look up the same record.
 *
 * WHY THIS FIXES THE "SOMETIMES FIRST SNAPSHOT" BUG:
 * The bug occurs because URL variants like:
 *   - https://Example.com/privacy
 *   - https://example.com/privacy/
 *   - https://example.com/privacy?utm=test
 * All create different page records. By canonicalizing to a single form
 * (https://example.com/privacy), all lookups resolve to the same record.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidUrlError = void 0;
exports.canonicalizeUrl = canonicalizeUrl;
exports.isValidUrl = isValidUrl;
// Re-export InvalidUrlError from centralized errors module
var errors_1 = require("../errors");
Object.defineProperty(exports, "InvalidUrlError", { enumerable: true, get: function () { return errors_1.InvalidUrlError; } });
const errors_2 = require("../errors");
/**
 * Canonicalize a URL to ensure consistent identity across variants
 *
 * Rules applied:
 * 1. Trim whitespace
 * 2. Auto-add https:// if no protocol
 * 3. Parse using WHATWG URL
 * 4. Lowercase hostname
 * 5. Force protocol to https
 * 6. Remove query parameters
 * 7. Remove hash fragments
 * 8. Normalize pathname (collapse duplicate slashes)
 * 9. Remove trailing slash (unless root path)
 *
 * @param inputUrl - Raw URL string from user input
 * @returns Canonical URL string
 * @throws InvalidUrlError if URL is empty or malformed
 */
function canonicalizeUrl(inputUrl) {
    // Trim whitespace
    const trimmed = inputUrl.trim();
    // Check for empty string
    if (!trimmed) {
        throw new errors_2.InvalidUrlError('URL cannot be empty');
    }
    // Auto-add https:// if no protocol provided
    let urlToParse = trimmed;
    if (!trimmed.includes('://')) {
        urlToParse = `https://${trimmed}`;
    }
    // Parse using WHATWG URL API
    let parsed;
    try {
        parsed = new URL(urlToParse);
    }
    catch {
        throw new errors_2.InvalidUrlError(`Invalid URL format: ${inputUrl}`);
    }
    // Validate protocol (only http/https allowed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new errors_2.InvalidUrlError(`Invalid protocol: ${parsed.protocol}`);
    }
    // Force HTTPS protocol
    parsed.protocol = 'https:';
    // Hostname is automatically lowercased by URL API
    // But let's be explicit for clarity
    const hostname = parsed.hostname.toLowerCase();
    // Normalize pathname:
    // 1. Collapse duplicate slashes (//privacy// → /privacy/)
    // 2. Decode percent-encoded characters that don't need encoding
    let pathname = parsed.pathname.replace(/\/+/g, '/');
    // Remove trailing slash unless it's the root path
    if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
    }
    // Build canonical URL without query params or hash
    // Note: We preserve the port if non-standard
    let canonical = `https://${hostname}`;
    // Include port only if non-standard
    if (parsed.port && parsed.port !== '443') {
        canonical += `:${parsed.port}`;
    }
    canonical += pathname;
    return canonical;
}
/**
 * Check if a string is a valid URL without throwing
 *
 * @param inputUrl - URL string to validate
 * @returns true if valid, false otherwise
 */
function isValidUrl(inputUrl) {
    try {
        canonicalizeUrl(inputUrl);
        return true;
    }
    catch {
        return false;
    }
}
