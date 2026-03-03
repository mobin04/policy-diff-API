/**
 * Environment Configuration and Validation Layer
 *
 * This file centralizes all environment variable access and enforces
 * strict validation at startup. If any required variables are missing
 * or invalid, the process will fail fast with a clear error.
 *
 * Security:
 * - No default secrets in production.
 * - Minimum length requirements for secrets.
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env.config file
dotenv.config({ path: path.join(process.cwd(), '.env.config') });

/**
 * Validates that an environment variable exists and is not empty.
 * @throws Error if variable is missing.
 */
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`CRITICAL CONFIG ERROR: Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Validates that an environment variable is a valid number.
 */
function getRequiredInt(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (!value && defaultValue !== undefined) return defaultValue;
  const parsed = parseInt(value || '', 10);
  if (isNaN(parsed)) {
    throw new Error(`CRITICAL CONFIG ERROR: Environment variable ${key} must be a valid integer.`);
  }
  return parsed;
}

// Environment Modes
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
export const IS_DEVELOPMENT = NODE_ENV === 'development';
export const IS_TEST = NODE_ENV === 'test';

// Required Core Configuration
export const PORT = getRequiredInt('PORT', 3000);
export const DATABASE_URL = getRequiredEnv('DATABASE_URL');
export const API_SECRET = getRequiredEnv('API_SECRET');
export const INTERNAL_METRICS_TOKEN = getRequiredEnv('INTERNAL_METRICS_TOKEN');
export const PROVISION_SECRET = getRequiredEnv('PROVISION_SECRET');

// Rate Limiting (Configurable via env)
export const GLOBAL_RATE_LIMIT = getRequiredInt('GLOBAL_RATE_LIMIT', 1000);

// Logging
export const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug');

// Server
export const HOST = '0.0.0.0';

/**
 * Perform additional secure configuration enforcement for production.
 */
export function validateProductionConfig() {
  if (!IS_PRODUCTION) return;

  // 1. Ensure API_SECRET is secure (>= 32 characters)
  if (API_SECRET.length < 32) {
    throw new Error('SECURE CONFIG ERROR: API_SECRET must be at least 32 characters long in production.');
  }

  // 2. Ensure INTERNAL_METRICS_TOKEN is not using a default value
  if (INTERNAL_METRICS_TOKEN === 'dev-metrics-token') {
    throw new Error('SECURE CONFIG ERROR: INTERNAL_METRICS_TOKEN cannot use default value in production.');
  }

  // 3. Ensure DATABASE_URL is not local in production
  if (DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')) {
    throw new Error('PROD DB ISOLATION ERROR: DATABASE_URL cannot point to localhost in production.');
  }
}
