import crypto from 'crypto';
import { findActiveByEmail, insertProvisionedKey, updateApiKeyHash } from '../repositories/apiKey.repository';
import { getTierConfig } from '../config/tierConfig';
import { ApiKeyEnvironment, CreateApiKeyInput } from '../types';
import { ApiKeyAlreadyExistsError, InvalidEmailError } from '../errors';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function provisionApiKey(input: {
  email: string;
  name: string;
  tier: 'FREE' | 'STARTER' | 'PRO';
  environment: ApiKeyEnvironment;
}): Promise<{ rawKey: string }> {
  if (!input.email || !EMAIL_REGEX.test(input.email)) {
    throw new InvalidEmailError();
  }

  const existingKey = await findActiveByEmail(input.email);
  if (existingKey) {
    throw new ApiKeyAlreadyExistsError();
  }

  const rawBytes = crypto.randomBytes(32).toString('hex');
  const prefix = input.environment === 'dev' ? 'pd_dev_' : 'pd_live_';
  const rawKey = `${prefix}${rawBytes}`;

  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const tierConfig = getTierConfig(input.tier);

  const now = new Date();
  const quotaResetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));

  const dbInput: CreateApiKeyInput = {
    ...input,
    monthlyQuota: tierConfig.monthlyQuota,
  };

  await insertProvisionedKey(keyHash, dbInput, quotaResetAt);

  return { rawKey };
}

export async function regenerateApiKey(email: string): Promise<{ rawKey: string; rotatedAt: Date }> {
  if (!email || !EMAIL_REGEX.test(email)) {
    throw new InvalidEmailError();
  }

  const existingKey = await findActiveByEmail(email);
  if (!existingKey) {
    throw new Error('API_KEY_NOT_FOUND');
  }

  const rawBytes = crypto.randomBytes(32).toString('hex');
  const prefix = existingKey.environment === 'dev' ? 'pd_dev_' : 'pd_live_';
  const rawKey = `${prefix}${rawBytes}`;

  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const rotatedAt = await updateApiKeyHash(existingKey.id, keyHash);

  return { rawKey, rotatedAt };
}
