import { getIdempotencyRecord, saveIdempotencyRecord } from '../repositories/idempotency.repository';
import { generateHash } from '../utils/hash';
import { ConflictError } from '../errors';
import { recordAbuseEvent } from './requestAbuse.service';

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
export async function checkIdempotency(
  apiKeyId: number,
  idempotencyKey: string | undefined,
  requestBody: Record<string, unknown>,
  logger?: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void }
): Promise<Record<string, unknown> | null> {
  if (!idempotencyKey) return null;

  const requestHash = generateHash(JSON.stringify(requestBody));
  const record = await getIdempotencyRecord(apiKeyId, idempotencyKey);

  if (record) {
    if (record.requestHash !== requestHash) {
      if (logger) {
        logger.warn({ api_key_id: apiKeyId, idempotency_key: idempotencyKey }, 'IDEMPOTENCY_CONFLICT');
      }
      await recordAbuseEvent('IDEMPOTENCY_CONFLICT', apiKeyId, undefined, { idempotency_key: idempotencyKey });
      throw new ConflictError('IDENTITY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD');
    }

    await recordAbuseEvent('IDEMPOTENCY_REUSE', apiKeyId, undefined, { idempotency_key: idempotencyKey });
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
export async function storeIdempotency(
  apiKeyId: number,
  idempotencyKey: string | undefined,
  requestBody: Record<string, unknown>,
  responseBody: Record<string, unknown>,
): Promise<void> {
  if (!idempotencyKey) return;

  const requestHash = generateHash(JSON.stringify(requestBody));
  await saveIdempotencyRecord(apiKeyId, idempotencyKey, requestHash, responseBody);
}
