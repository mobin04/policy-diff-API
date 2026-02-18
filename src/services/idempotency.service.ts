import { getIdempotencyRecord, saveIdempotencyRecord } from '../repositories/idempotency.repository';
import { generateHash } from '../utils/hash';
import { ConflictError } from '../errors';

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
 * @returns Stored response body or null if none exists
 * @throws ConflictError if hash mismatch
 */
export async function checkIdempotency(
  apiKeyId: number,
  idempotencyKey: string | undefined,
  requestBody: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  if (!idempotencyKey) return null;

  const requestHash = generateHash(JSON.stringify(requestBody));
  const record = await getIdempotencyRecord(apiKeyId, idempotencyKey);

  if (record) {
    if (record.requestHash !== requestHash) {
      throw new ConflictError('IDENTITY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD');
    }
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
