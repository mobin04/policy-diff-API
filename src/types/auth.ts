/**
 * Auth-related types for API key authentication
 */

export type ApiKeyEnvironment = 'dev' | 'prod';

export type ApiKey = {
  id: number;
  keyHash: string;
  name: string;
  environment: ApiKeyEnvironment;
  isActive: boolean;
  usageCount: number;
  rateLimit: number;
  createdAt: Date;
};

export type ApiKeyRow = {
  id: number;
  key_hash: string;
  name: string;
  environment: ApiKeyEnvironment;
  is_active: boolean;
  usage_count: number;
  rate_limit: number;
  created_at: Date;
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
