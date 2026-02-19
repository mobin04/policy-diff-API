import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { DATABASE_URL } from '../config';

export const DB = new Pool({
  connectionString: DATABASE_URL,
});

/**
 * Initialize database and run migrations.
 * Tracks applied migrations in 'applied_migrations' table.
 */
export async function initDB() {
  // 1. Ensure migrations tracking table exists
  await DB.query(`
    CREATE TABLE IF NOT EXISTS applied_migrations (
      file_name TEXT PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // 2. Run base schema (idempotent)
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await DB.query(schema);

  // 3. Run pending migrations
  const migrationsDir = path.join(__dirname, 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      // Check if migration already applied
      const check = await DB.query('SELECT 1 FROM applied_migrations WHERE file_name = $1', [file]);
      
      if (check.rows.length === 0) {
        const migrationPath = path.join(migrationsDir, file);
        const migration = fs.readFileSync(migrationPath, 'utf8');
        
        await DB.query('BEGIN');
        try {
          await DB.query(migration);
          await DB.query('INSERT INTO applied_migrations (file_name) VALUES ($1)', [file]);
          await DB.query('COMMIT');
        } catch (err) {
          await DB.query('ROLLBACK');
          throw err;
        }
      }
    }
  }
}

/**
 * Check if there are any SQL files in migrations directory that haven't been applied.
 * Used by readiness probe.
 */
export async function areMigrationsPending(): Promise<boolean> {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return false;

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'));

  const result = await DB.query<{ file_name: string }>('SELECT file_name FROM applied_migrations');
  const appliedFiles = new Set(result.rows.map(r => r.file_name));

  return files.some(f => !appliedFiles.has(f));
}
