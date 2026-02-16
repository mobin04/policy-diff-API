import crypto from 'crypto';
import { ApiKeyEnvironment } from '../types/auth';

/**
 * API Key Utilities
 *
 * Security Design Decisions:
 *
 * 1. WHY WE HASH KEYS:
 *    API keys are hashed using SHA-256 before storage. If the database is
 *    compromised, attackers cannot recover original keys. This is the same
 *    principle used for password storage.
 *
 * 2. WHY RAW KEYS ARE NEVER STORED:
 *    The raw key is shown ONCE at generation time. After that, only the hash
 *    exists. This means even database admins cannot impersonate users.
 *
 * 3. KEY FORMAT:
 *    - pd_dev_xxxx: Development keys (shorter, 24 chars random)
 *    - pd_prod_xxxx: Production keys (longer, 32 chars random)
 *    The prefix makes it easy to identify key type and prevents accidental
 *    use of dev keys in production.
 *
 * 4. FUTURE BILLING PREPARATION:
 *    The key structure supports future billing by:
 *    - Tracking usage_count per key
 *    - Having rate_limit field for tier-based limits
 *    - Environment separation for different pricing
 */

const DEV_KEY_PREFIX = 'pd_dev_';
const PROD_KEY_PREFIX = 'pd_prod_';
const DEV_RANDOM_LENGTH = 24;
const PROD_RANDOM_LENGTH = 32;

/**
 * Generate a cryptographically secure random string
 */
function generateRandomString(length: number): string {
  // Each byte becomes 2 hex chars, so we need length/2 bytes
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Generate a new API key for the specified environment
 *
 * @param environment - 'dev' or 'prod'
 * @returns The raw API key (show to user ONCE, then discard)
 */
export function generateApiKey(environment: ApiKeyEnvironment): string {
  if (environment === 'dev') {
    return `${DEV_KEY_PREFIX}${generateRandomString(DEV_RANDOM_LENGTH)}`;
  }
  return `${PROD_KEY_PREFIX}${generateRandomString(PROD_RANDOM_LENGTH)}`;
}

/**
 * Hash an API key for secure storage
 *
 * Uses SHA-256 which is:
 * - Fast enough for per-request validation
 * - Secure enough for API key storage (keys have high entropy)
 *
 * Note: Unlike passwords, API keys don't need bcrypt/argon2 because:
 * - They are randomly generated (not user-chosen)
 * - They have sufficient entropy (24-32 random chars)
 * - We need fast lookup on every request
 *
 * @param rawKey - The raw API key
 * @returns SHA-256 hash of the key
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Extract environment from a raw API key based on prefix
 * Returns null if key format is invalid
 */
export function getKeyEnvironment(rawKey: string): ApiKeyEnvironment | null {
  if (rawKey.startsWith(DEV_KEY_PREFIX)) {
    return 'dev';
  }
  if (rawKey.startsWith(PROD_KEY_PREFIX)) {
    return 'prod';
  }
  return null;
}
