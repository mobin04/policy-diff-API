"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HOST = exports.LOG_LEVEL = exports.GLOBAL_RATE_LIMIT = exports.PROVISION_SECRET = exports.INTERNAL_METRICS_TOKEN = exports.API_SECRET = exports.DATABASE_URL = exports.PORT = exports.IS_TEST = exports.IS_DEVELOPMENT = exports.IS_PRODUCTION = exports.NODE_ENV = void 0;
exports.validateProductionConfig = validateProductionConfig;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load .env.config file
dotenv_1.default.config({ path: path_1.default.join(process.cwd(), '.env.config') });
/**
 * Validates that an environment variable exists and is not empty.
 * @throws Error if variable is missing.
 */
function getRequiredEnv(key) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
        throw new Error(`CRITICAL CONFIG ERROR: Missing required environment variable: ${key}`);
    }
    return value;
}
/**
 * Validates that an environment variable is a valid number.
 */
function getRequiredInt(key, defaultValue) {
    const value = process.env[key];
    if (!value && defaultValue !== undefined)
        return defaultValue;
    const parsed = parseInt(value || '', 10);
    if (isNaN(parsed)) {
        throw new Error(`CRITICAL CONFIG ERROR: Environment variable ${key} must be a valid integer.`);
    }
    return parsed;
}
// Environment Modes
exports.NODE_ENV = process.env.NODE_ENV || 'development';
exports.IS_PRODUCTION = exports.NODE_ENV === 'production';
exports.IS_DEVELOPMENT = exports.NODE_ENV === 'development';
exports.IS_TEST = exports.NODE_ENV === 'test';
// Required Core Configuration
exports.PORT = getRequiredInt('PORT', 3000);
exports.DATABASE_URL = getRequiredEnv('DATABASE_URL');
exports.API_SECRET = getRequiredEnv('API_SECRET');
exports.INTERNAL_METRICS_TOKEN = getRequiredEnv('INTERNAL_METRICS_TOKEN');
exports.PROVISION_SECRET = getRequiredEnv('PROVISION_SECRET');
// Rate Limiting (Configurable via env)
exports.GLOBAL_RATE_LIMIT = getRequiredInt('GLOBAL_RATE_LIMIT', 1000);
// Logging
exports.LOG_LEVEL = process.env.LOG_LEVEL || (exports.IS_PRODUCTION ? 'info' : 'debug');
// Server
exports.HOST = '0.0.0.0';
/**
 * Perform additional secure configuration enforcement for production.
 */
function validateProductionConfig() {
    if (!exports.IS_PRODUCTION)
        return;
    // 1. Ensure API_SECRET is secure (>= 32 characters)
    if (exports.API_SECRET.length < 32) {
        throw new Error('SECURE CONFIG ERROR: API_SECRET must be at least 32 characters long in production.');
    }
    // 2. Ensure INTERNAL_METRICS_TOKEN is not using a default value
    if (exports.INTERNAL_METRICS_TOKEN === 'dev-metrics-token') {
        throw new Error('SECURE CONFIG ERROR: INTERNAL_METRICS_TOKEN cannot use default value in production.');
    }
    // 3. Ensure DATABASE_URL is not local in production
    if (exports.DATABASE_URL.includes('localhost') || exports.DATABASE_URL.includes('127.0.0.1')) {
        throw new Error('PROD DB ISOLATION ERROR: DATABASE_URL cannot point to localhost in production.');
    }
}
