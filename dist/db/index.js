"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DB = void 0;
exports.initDB = initDB;
exports.areMigrationsPending = areMigrationsPending;
const pg_1 = require("pg");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
/**
 * Database connection pool configuration.
 * Uses SSL in production for Neon compatibility.
 */
const poolConfig = {
    connectionString: config_1.DATABASE_URL,
};
if (config_1.IS_PRODUCTION) {
    poolConfig.ssl = {
        rejectUnauthorized: false,
    };
}
exports.DB = new pg_1.Pool(poolConfig);
/**
 * Initialize database and run migrations.
 * Tracks applied migrations in 'applied_migrations' table.
 */
async function initDB() {
    // 1. Ensure migrations tracking table exists
    await exports.DB.query(`
    CREATE TABLE IF NOT EXISTS applied_migrations (
      file_name TEXT PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
    // 2. Run base schema (idempotent)
    const schemaPath = path_1.default.join(__dirname, 'schema.sql');
    const schema = fs_1.default.readFileSync(schemaPath, 'utf8');
    await exports.DB.query(schema);
    // 3. Run pending migrations
    const migrationsDir = path_1.default.join(__dirname, 'migrations');
    if (fs_1.default.existsSync(migrationsDir)) {
        const files = fs_1.default
            .readdirSync(migrationsDir)
            .filter((f) => f.endsWith('.sql'))
            .sort();
        for (const file of files) {
            // Check if migration already applied
            const check = await exports.DB.query('SELECT 1 FROM applied_migrations WHERE file_name = $1', [file]);
            if (check.rows.length === 0) {
                const migrationPath = path_1.default.join(migrationsDir, file);
                const migration = fs_1.default.readFileSync(migrationPath, 'utf8');
                await exports.DB.query('BEGIN');
                try {
                    await exports.DB.query(migration);
                    await exports.DB.query('INSERT INTO applied_migrations (file_name) VALUES ($1)', [file]);
                    await exports.DB.query('COMMIT');
                }
                catch (err) {
                    await exports.DB.query('ROLLBACK');
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
async function areMigrationsPending() {
    const migrationsDir = path_1.default.join(__dirname, 'migrations');
    if (!fs_1.default.existsSync(migrationsDir))
        return false;
    const files = fs_1.default.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    const result = await exports.DB.query('SELECT file_name FROM applied_migrations');
    const appliedFiles = new Set(result.rows.map((r) => r.file_name));
    return files.some((f) => !appliedFiles.has(f));
}
