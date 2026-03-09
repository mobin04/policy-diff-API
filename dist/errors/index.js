"use strict";
/**
 * Custom Error Classes for PolicyDiff API
 *
 * WHY STRUCTURED ERRORS ARE CRITICAL FOR API CONSUMERS:
 * - Consistent error format enables programmatic error handling
 * - Error names allow clients to show appropriate UI messages
 * - Status codes enable proper HTTP semantics
 * - Request IDs enable debugging and support tickets
 *
 * WHY WE AVOID LEAKING INTERNAL ERRORS:
 * - Stack traces reveal file paths and library versions
 * - Internal error messages may expose database schema
 * - Generic messages prevent information disclosure attacks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiKeyAlreadyExistsError = exports.InvalidEmailError = exports.ProvisionSecretInvalidError = exports.InvalidPageContentError = exports.PageAccessBlockedError = exports.UnsupportedDynamicPageError = exports.ConflictError = exports.HttpError = exports.FetchError = exports.InvalidUrlError = exports.TooManyRequestsError = exports.BadRequestError = exports.BatchLimitExceededError = exports.UrlLimitExceededError = exports.QuotaExceededError = exports.ApiError = void 0;
exports.isApiError = isApiError;
/**
 * Base class for all custom API errors
 * Includes HTTP status code for proper response handling
 */
class ApiError extends Error {
    constructor(message) {
        super(message);
        // Maintains proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.ApiError = ApiError;
/**
 * Quota Exceeded Error
 * Thrown when an API key has exhausted its monthly quota.
 *
 * HTTP Status: 403 Forbidden
 */
class QuotaExceededError extends ApiError {
    constructor(message = 'Monthly usage limit reached') {
        super(message);
        this.statusCode = 403;
        this.name = 'QUOTA_EXCEEDED';
    }
}
exports.QuotaExceededError = QuotaExceededError;
/**
 * URL Limit Exceeded Error
 * Thrown when an API key has reached its maximum allowed unique URLs.
 *
 * HTTP Status: 403 Forbidden
 */
class UrlLimitExceededError extends ApiError {
    constructor(message = 'Unique URL limit reached for your tier') {
        super(message);
        this.statusCode = 403;
        this.name = 'URL_LIMIT_EXCEEDED';
    }
}
exports.UrlLimitExceededError = UrlLimitExceededError;
/**
 * Batch Limit Exceeded Error
 * Thrown when a batch submission exceeds the tier's maximum batch size.
 *
 * HTTP Status: 400 Bad Request
 */
class BatchLimitExceededError extends ApiError {
    constructor(message = 'Batch size exceeds allowed tier limit') {
        super(message);
        this.statusCode = 400;
        this.name = 'BATCH_LIMIT_EXCEEDED';
    }
}
exports.BatchLimitExceededError = BatchLimitExceededError;
/**
 * Bad Request Error
 * Used for validation errors not covered by specialized error types.
 *
 * HTTP Status: 400 Bad Request
 */
class BadRequestError extends ApiError {
    constructor(message) {
        super(message);
        this.statusCode = 400;
        this.name = 'BadRequestError';
    }
}
exports.BadRequestError = BadRequestError;
/**
 * Too Many Requests Error
 * Used when the system is overloaded and cannot queue additional work safely.
 *
 * HTTP Status: 429 Too Many Requests
 */
class TooManyRequestsError extends ApiError {
    constructor(message) {
        super(message);
        this.statusCode = 429;
        this.name = 'TooManyRequestsError';
    }
}
exports.TooManyRequestsError = TooManyRequestsError;
/**
 * Invalid URL Error
 * Thrown when URL format is invalid, empty, or uses unsupported protocol
 *
 * HTTP Status: 400 Bad Request
 */
class InvalidUrlError extends ApiError {
    constructor(message) {
        super(message);
        this.statusCode = 400;
        this.name = 'InvalidUrlError';
    }
}
exports.InvalidUrlError = InvalidUrlError;
/**
 * Fetch Error
 * Thrown when unable to reach the target URL
 * Causes: DNS failure, connection timeout, network unreachable
 *
 * HTTP Status: 502 Bad Gateway (upstream server unreachable)
 */
class FetchError extends ApiError {
    constructor(message, cause) {
        super(message);
        this.statusCode = 502;
        this.name = 'FetchError';
        this.cause = cause;
    }
}
exports.FetchError = FetchError;
/**
 * HTTP Error
 * Thrown when target URL returns an error status code (4xx or 5xx)
 *
 * HTTP Status: 502 Bad Gateway (upstream returned error)
 */
class HttpError extends ApiError {
    constructor(message, upstreamStatus) {
        super(message);
        this.statusCode = 502;
        this.name = 'HttpError';
        this.upstreamStatus = upstreamStatus;
    }
}
exports.HttpError = HttpError;
/**
 * Conflict Error
 * Thrown when a request conflicts with current server state
 * (e.g. Idempotency-Key reuse with different payload)
 *
 * HTTP Status: 409 Conflict
 */
class ConflictError extends ApiError {
    constructor(message) {
        super(message);
        this.statusCode = 409;
        this.name = 'ConflictError';
    }
}
exports.ConflictError = ConflictError;
/**
 * Unsupported Dynamic Page Error
 * Thrown when a page appears to rely on client-side rendering (SPA).
 */
class UnsupportedDynamicPageError extends ApiError {
    constructor(message = 'Page appears to rely on client-side rendering') {
        super(message);
        this.statusCode = 422; // Unprocessable Entity
        this.name = 'UNSUPPORTED_DYNAMIC_PAGE';
    }
}
exports.UnsupportedDynamicPageError = UnsupportedDynamicPageError;
/**
 * Page Access Blocked Error
 * Thrown when a page access is blocked (WAF, CAPTCHA, etc.).
 */
class PageAccessBlockedError extends ApiError {
    constructor(message = 'Page access blocked or requires verification') {
        super(message);
        this.statusCode = 403;
        this.name = 'PAGE_ACCESS_BLOCKED';
    }
}
exports.PageAccessBlockedError = PageAccessBlockedError;
/**
 * Invalid Page Content Error
 * Thrown when the fetched page has insufficient meaningful content.
 */
class InvalidPageContentError extends ApiError {
    constructor(message = 'Insufficient meaningful content detected') {
        super(message);
        this.statusCode = 422;
        this.name = 'INVALID_PAGE_CONTENT';
    }
}
exports.InvalidPageContentError = InvalidPageContentError;
/**
 * Provision Secret Invalid Error
 * Thrown when the X-Provision-Secret header doesn't match the required env var.
 */
class ProvisionSecretInvalidError extends ApiError {
    constructor(message = 'Invalid provision secret') {
        super(message);
        this.statusCode = 403;
        this.name = 'PROVISION_SECRET_INVALID';
    }
}
exports.ProvisionSecretInvalidError = ProvisionSecretInvalidError;
/**
 * Invalid Email Error
 * Thrown when an invalid email is provided during provisioning.
 */
class InvalidEmailError extends ApiError {
    constructor(message = 'Invalid email address provided') {
        super(message);
        this.statusCode = 400;
        this.name = 'INVALID_EMAIL';
    }
}
exports.InvalidEmailError = InvalidEmailError;
/**
 * API Key Already Exists Error
 * Thrown if there is already an active key for the given email.
 */
class ApiKeyAlreadyExistsError extends ApiError {
    constructor(message = 'An active API key already exists for this email') {
        super(message);
        this.statusCode = 409;
        this.name = 'API_KEY_ALREADY_EXISTS';
    }
}
exports.ApiKeyAlreadyExistsError = ApiKeyAlreadyExistsError;
/**
 * Type guard to check if an error is a custom API error
 */
function isApiError(error) {
    return error instanceof ApiError;
}
