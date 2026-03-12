/**
 * Auth-related types for API key authentication
 */

export type ApiKeyEnvironment = 'dev' | 'prod';

export type ApiKey = {
  id: number;
  keyHash: string;
  name: string;
  email: string;
  environment: ApiKeyEnvironment;
  isActive: boolean;
  createdAt: Date;
  rotatedAt?: Date;
  tier: 'FREE' | 'STARTER' | 'PRO';
  monthlyQuota: number;
  monthlyUsage: number;
  quotaResetAt: Date;
};

export type ApiKeyRow = {
  id: number;
  key_hash: string;
  name: string;
  email: string;
  environment: ApiKeyEnvironment;
  is_active: boolean;
  created_at: Date;
  rotated_at?: Date;
  tier: 'FREE' | 'STARTER' | 'PRO';
  monthly_quota: number;
  monthly_usage: number;
  quota_reset_at: Date;
};

export type CreateApiKeyInput = {
  email: string;
  name: string;
  tier: 'FREE' | 'STARTER' | 'PRO';
  environment: ApiKeyEnvironment;
  monthlyQuota: number;
};

export type AuthErrorResponse = {
  error: string;
  message: string;
};

/**
 * Extend Fastify request to include authenticated API key
 */
declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: ApiKey;
  }
}
