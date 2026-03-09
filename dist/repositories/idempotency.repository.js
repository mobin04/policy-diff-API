"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIdempotencyRecord = getIdempotencyRecord;
exports.saveIdempotencyRecord = saveIdempotencyRecord;
const db_1 = require("../db");
const requestAbuse_service_1 = require("../services/requestAbuse.service");
function rowToEntity(row) {
    return {
        id: row.id,
        apiKeyId: row.api_key_id,
        idempotencyKey: row.idempotency_key,
        requestHash: row.request_hash,
        responseBody: row.response_body,
        createdAt: row.created_at,
    };
}
/**
 * Get idempotency record by api_key_id and idempotency_key
 */
async function getIdempotencyRecord(apiKeyId, idempotencyKey) {
    const result = await db_1.DB.query('SELECT * FROM idempotency_keys WHERE api_key_id = $1 AND idempotency_key = $2', [apiKeyId, idempotencyKey]);
    if (result.rows.length === 0) {
        return null;
    }
    return rowToEntity(result.rows[0]);
}
/**
 * Save idempotency record
 */
async function saveIdempotencyRecord(apiKeyId, idempotencyKey, requestHash, responseBody, client) {
    const db = client || db_1.DB;
    // STEP 2: Cross-key collision detection
    const collisionCheck = await db.query('SELECT api_key_id FROM idempotency_keys WHERE idempotency_key = $1 AND api_key_id != $2 LIMIT 1', [
        idempotencyKey,
        apiKeyId,
    ]);
    if (collisionCheck.rows.length > 0) {
        // Log structured event but do not block (isolation is still enforced by api_key_id in PRIMARY KEY or unique constraint)
        await (0, requestAbuse_service_1.recordAbuseEvent)('CROSS_KEY_IDEMPOTENCY_COLLISION', apiKeyId, undefined, { idempotency_key: idempotencyKey });
    }
    await db.query(`INSERT INTO idempotency_keys (api_key_id, idempotency_key, request_hash, response_body)
     VALUES ($1, $2, $3, $4)`, [apiKeyId, idempotencyKey, requestHash, JSON.stringify(responseBody)]);
}
