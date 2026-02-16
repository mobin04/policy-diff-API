import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { DATABASE_URL } from '../config';

export const DB = new Pool({
  connectionString: DATABASE_URL,
});

export async function initDB() {
  // Run base schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await DB.query(schema);

  // Run migrations
  const migrationsDir = path.join(__dirname, 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      const migration = fs.readFileSync(migrationPath, 'utf8');
      await DB.query(migration);
    }
  }
}
