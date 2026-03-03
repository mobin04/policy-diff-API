import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { DATABASE_URL, IS_PRODUCTION } from '../src/config';

/**
 * Database Backup Utility
 *
 * Performs a deterministic pg_dump of the database.
 * Usage: npx ts-node scripts/backup-db.ts
 */

const BACKUP_DIR = path.join(process.cwd(), 'backups');

async function runBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `policydiff-backup-${timestamp}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);

  console.log(`[${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}] Starting backup: ${filename}...`);

  // We use pg_dump directly from the connection string
  const command = `pg_dump "${DATABASE_URL}" > "${filepath}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Backup FAILED: ${error.message}`);
      process.exit(1);
    }
    if (stderr) {
      console.warn(`Backup Warning: ${stderr}`);
    }
    console.log(`Backup SUCCESS: ${filepath}`);

    // Retention Policy: Keep last 30 days
    cleanupOldBackups();
  });
}

function cleanupOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR);
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  files.forEach((file) => {
    const filePath = path.join(BACKUP_DIR, file);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > thirtyDaysMs) {
      console.log(`Cleaning up old backup: ${file}`);
      fs.unlinkSync(filePath);
    }
  });
}

runBackup();
