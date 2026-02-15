import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { DATABASE_URL } from '../config';

export const DB = new Pool({
  connectionString: DATABASE_URL,
});

export async function initDB() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await DB.query(schema);
}
