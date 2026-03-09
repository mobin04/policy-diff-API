"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkIdempotency = checkIdempotency;
exports.storeIdempotency = storeIdempotency;
const idempotency_repository_1 = require("../repositories/idempotency.repository");
const hash_1 = require("../utils/hash");
const errors_1 = require("../errors");
const requestAbuse_service_1 = require("./requestAbuse.service");
/**
 * Check if a request is idempotent based on the Idempotency-Key header.
 *
 * If a record exists:
 * - Compare request_hash. If mismatch → 409 IDENTITY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD
 * - If match → return stored response_body
 *
 * If no record exists, return null.
 *
 * @param apiKeyId - ID of authenticated API key
 * @param idempotencyKey - Value of Idempotency-Key header
 * @param requestBody - Full request body to hash and compare
 * @param logger - Optional logger for structured events
 * @returns Stored response body or null if none exists
 * @throws ConflictError if hash mismatch
 */
async function checkIdempotency(apiKeyId, idempotencyKey, requestBody, logger) {
    if (!idempotencyKey)
        return null;
    const requestHash = (0, hash_1.generateHash)(JSON.stringify(requestBody));
    const record = await (0, idempotency_repository_1.getIdempotencyRecord)(apiKeyId, idempotencyKey);
    if (record) {
        if (record.requestHash !== requestHash) {
            if (logger) {
                logger.warn({ api_key_id: apiKeyId, idempotency_key: idempotencyKey }, 'IDEMPOTENCY_CONFLICT');
            }
            await (0, requestAbuse_service_1.recordAbuseEvent)('IDEMPOTENCY_CONFLICT', apiKeyId, undefined, { idempotency_key: idempotencyKey });
            throw new errors_1.ConflictError('IDENTITY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD');
        }
        await (0, requestAbuse_service_1.recordAbuseEvent)('IDEMPOTENCY_REUSE', apiKeyId, undefined, { idempotency_key: idempotencyKey });
        return record.responseBody;
    }
    return null;
}
/**
 * Store the result of a successful operation for idempotency.
 *
 * @param apiKeyId - ID of authenticated API key
 * @param idempotencyKey - Value of Idempotency-Key header
 * @param requestBody - Full request body to hash
 * @param responseBody - Full response body to store
 */
async function storeIdempotency(apiKeyId, idempotencyKey, requestBody, responseBody) {
    if (!idempotencyKey)
        return;
    const requestHash = (0, hash_1.generateHash)(JSON.stringify(requestBody));
    await (0, idempotency_repository_1.saveIdempotencyRecord)(apiKeyId, idempotencyKey, requestHash, responseBody);
}
