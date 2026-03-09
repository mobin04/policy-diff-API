"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logApiRequest = logApiRequest;
exports.checkDatabaseConnection = checkDatabaseConnection;
const db_1 = require("../db");
/**
 * API Log Repository
 *
 * Stores lightweight audit entries for each API request.
 *
 * What we store:
 * - API key ID (for usage tracking and billing)
 * - Endpoint (for analytics)
 * - Status code (for error rate monitoring)
 * - Response time (for performance monitoring)
 *
 * What we DON'T store (by design):
 * - Request body (may contain sensitive data)
 * - Response body (may contain PII)
 * - Full headers (may contain auth tokens)
 * - IP addresses (privacy concerns, GDPR)
 */
/**
 * Log an API request for audit and analytics
 *
 * @param apiKeyId - ID of the API key used (null if unauthenticated)
 * @param endpoint - Request path (e.g., "/v1/check")
 * @param statusCode - HTTP response status code
 * @param responseTime - Time to process request in milliseconds
 */
async function logApiRequest(apiKeyId, endpoint, statusCode, responseTime) {
    try {
        await db_1.DB.query('INSERT INTO api_logs (api_key_id, endpoint, status_code, response_time) VALUES ($1, $2, $3, $4)', [
            apiKeyId,
            endpoint,
            statusCode,
            responseTime,
        ]);
    }
    catch (error) {
        // Log errors but don't fail the request - audit logging is non-critical
        // In production, this would alert but not break the user's request
        console.error('Failed to write audit log:', error);
    }
}
/**
 * Check database connectivity
 * Used by readiness probe to verify DB is accessible
 */
async function checkDatabaseConnection() {
    try {
        await db_1.DB.query('SELECT 1');
        return true;
    }
    catch {
        return false;
    }
}
