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
 * Type guard to check if an error is a custom API error
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
