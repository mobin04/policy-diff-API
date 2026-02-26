import { DB } from '../db';
import { recordAbuseEvent } from '../services/requestAbuse.service';

export type IdempotencyRecord = {
  id: string;
  apiKeyId: number;
  idempotencyKey: string;
  requestHash: string;
  responseBody: Record<string, unknown>; // We store the full JSON response
  createdAt: Date;
};

type IdempotencyRow = {
  id: string;
  api_key_id: number;
  idempotency_key: string;
  request_hash: string;
  response_body: Record<string, unknown>;
  created_at: Date;
};

function rowToEntity(row: IdempotencyRow): IdempotencyRecord {
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
export async function getIdempotencyRecord(
  apiKeyId: number,
  idempotencyKey: string,
): Promise<IdempotencyRecord | null> {
  const result = await DB.query<IdempotencyRow>(
    'SELECT * FROM idempotency_keys WHERE api_key_id = $1 AND idempotency_key = $2',
    [apiKeyId, idempotencyKey],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToEntity(result.rows[0]);
}

/**
 * Save idempotency record
 */
export async function saveIdempotencyRecord(
  apiKeyId: number,
  idempotencyKey: string,
  requestHash: string,
  responseBody: Record<string, unknown>,
  client?: typeof DB | { query: typeof DB.query },
): Promise<void> {
  const db = client || DB;

  // STEP 2: Cross-key collision detection
  const collisionCheck = await db.query('SELECT api_key_id FROM idempotency_keys WHERE idempotency_key = $1 AND api_key_id != $2 LIMIT 1', [
    idempotencyKey,
    apiKeyId,
  ]);

  if (collisionCheck.rows.length > 0) {
    // Log structured event but do not block (isolation is still enforced by api_key_id in PRIMARY KEY or unique constraint)
    await recordAbuseEvent('CROSS_KEY_IDEMPOTENCY_COLLISION', apiKeyId, undefined, { idempotency_key: idempotencyKey });
  }

  await db.query(
    `INSERT INTO idempotency_keys (api_key_id, idempotency_key, request_hash, response_body)
     VALUES ($1, $2, $3, $4)`,
    [apiKeyId, idempotencyKey, requestHash, JSON.stringify(responseBody)],
  );
}
