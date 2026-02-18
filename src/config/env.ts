import dotenv from 'dotenv';

dotenv.config({ path: '.env.config' });

export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
export const DATABASE_URL = process.env.DATABASE_URL;
export const HOST = '0.0.0.0';
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const INTERNAL_METRICS_TOKEN = process.env.INTERNAL_METRICS_TOKEN || 'dev-metrics-token';
