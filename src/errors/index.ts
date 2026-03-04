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

/**
 * Base class for all custom API errors
 * Includes HTTP status code for proper response handling
 */
export abstract class ApiError extends Error {
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Quota Exceeded Error
 * Thrown when an API key has exhausted its monthly quota.
 *
 * HTTP Status: 403 Forbidden
 */
export class QuotaExceededError extends ApiError {
  readonly statusCode = 403;

  constructor(message = 'Monthly usage limit reached') {
    super(message);
    this.name = 'QUOTA_EXCEEDED';
  }
}

/**
 * URL Limit Exceeded Error
 * Thrown when an API key has reached its maximum allowed unique URLs.
 *
 * HTTP Status: 403 Forbidden
 */
export class UrlLimitExceededError extends ApiError {
  readonly statusCode = 403;

  constructor(message = 'Unique URL limit reached for your tier') {
    super(message);
    this.name = 'URL_LIMIT_EXCEEDED';
  }
}

/**
 * Batch Limit Exceeded Error
 * Thrown when a batch submission exceeds the tier's maximum batch size.
 *
 * HTTP Status: 400 Bad Request
 */
export class BatchLimitExceededError extends ApiError {
  readonly statusCode = 400;

  constructor(message = 'Batch size exceeds allowed tier limit') {
    super(message);
    this.name = 'BATCH_LIMIT_EXCEEDED';
  }
}

/**
 * Bad Request Error
 * Used for validation errors not covered by specialized error types.
 *
 * HTTP Status: 400 Bad Request
 */
export class BadRequestError extends ApiError {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

/**
 * Too Many Requests Error
 * Used when the system is overloaded and cannot queue additional work safely.
 *
 * HTTP Status: 429 Too Many Requests
 */
export class TooManyRequestsError extends ApiError {
  readonly statusCode = 429;

  constructor(message: string) {
    super(message);
    this.name = 'TooManyRequestsError';
  }
}

/**
 * Invalid URL Error
 * Thrown when URL format is invalid, empty, or uses unsupported protocol
 *
 * HTTP Status: 400 Bad Request
 */
export class InvalidUrlError extends ApiError {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidUrlError';
  }
}

/**
 * Fetch Error
 * Thrown when unable to reach the target URL
 * Causes: DNS failure, connection timeout, network unreachable
 *
 * HTTP Status: 502 Bad Gateway (upstream server unreachable)
 */
export class FetchError extends ApiError {
  readonly statusCode = 502;
  readonly cause?: string;

  constructor(message: string, cause?: string) {
    super(message);
    this.name = 'FetchError';
    this.cause = cause;
  }
}

/**
 * HTTP Error
 * Thrown when target URL returns an error status code (4xx or 5xx)
 *
 * HTTP Status: 502 Bad Gateway (upstream returned error)
 */
export class HttpError extends ApiError {
  readonly statusCode = 502;
  readonly upstreamStatus: number;

  constructor(message: string, upstreamStatus: number) {
    super(message);
    this.name = 'HttpError';
    this.upstreamStatus = upstreamStatus;
  }
}

/**
 * Conflict Error
 * Thrown when a request conflicts with current server state
 * (e.g. Idempotency-Key reuse with different payload)
 *
 * HTTP Status: 409 Conflict
 */
export class ConflictError extends ApiError {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * Unsupported Dynamic Page Error
 * Thrown when a page appears to rely on client-side rendering (SPA).
 */
export class UnsupportedDynamicPageError extends ApiError {
  readonly statusCode = 422; // Unprocessable Entity

  constructor(message = 'Page appears to rely on client-side rendering') {
    super(message);
    this.name = 'UNSUPPORTED_DYNAMIC_PAGE';
  }
}

/**
 * Page Access Blocked Error
 * Thrown when a page access is blocked (WAF, CAPTCHA, etc.).
 */
export class PageAccessBlockedError extends ApiError {
  readonly statusCode = 403;

  constructor(message = 'Page access blocked or requires verification') {
    super(message);
    this.name = 'PAGE_ACCESS_BLOCKED';
  }
}

/**
 * Invalid Page Content Error
 * Thrown when the fetched page has insufficient meaningful content.
 */
export class InvalidPageContentError extends ApiError {
  readonly statusCode = 422;

  constructor(message = 'Insufficient meaningful content detected') {
    super(message);
    this.name = 'INVALID_PAGE_CONTENT';
  }
}

/**
 * Provision Secret Invalid Error
 * Thrown when the X-Provision-Secret header doesn't match the required env var.
 */
export class ProvisionSecretInvalidError extends ApiError {
  readonly statusCode = 403;

  constructor(message = 'Invalid provision secret') {
    super(message);
    this.name = 'PROVISION_SECRET_INVALID';
  }
}

/**
 * Invalid Email Error
 * Thrown when an invalid email is provided during provisioning.
 */
export class InvalidEmailError extends ApiError {
  readonly statusCode = 400;

  constructor(message = 'Invalid email address provided') {
    super(message);
    this.name = 'INVALID_EMAIL';
  }
}

/**
 * API Key Already Exists Error
 * Thrown if there is already an active key for the given email.
 */
export class ApiKeyAlreadyExistsError extends ApiError {
  readonly statusCode = 409;

  constructor(message = 'An active API key already exists for this email') {
    super(message);
    this.name = 'API_KEY_ALREADY_EXISTS';
  }
}

/**
 * Type guard to check if an error is a custom API error
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
