import dotenv from 'dotenv';

dotenv.config({ path: '.env.config' });

export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
export const DATABASE_URL = process.env.DATABASE_URL;
export const HOST = '0.0.0.0';
