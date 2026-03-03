import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { DATABASE_URL } from '../config/env';
import { FastifyBaseLogger } from 'fastify';

/**
 * Internal Backup Service
 * 
 * Executes a deterministic pg_dump and manages retention.
 */

const BACKUP_DIR = path.join(process.cwd(), 'backups');

export async function performBackup(logger: FastifyBaseLogger): Promise<void> {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `policydiff-backup-${timestamp}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);

  logger.info({ filename }, 'Starting scheduled database backup');

  const command = `pg_dump "${DATABASE_URL}" > "${filepath}"`;

  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        logger.error({ err: error, stderr }, 'Database backup FAILED');
        return reject(error);
      }
      
      logger.info({ filepath }, 'Database backup SUCCESS');
      
      // Cleanup old backups (Keep 30 days)
      try {
        cleanupOldBackups(logger);
      } catch (cleanupErr) {
        logger.warn({ err: cleanupErr }, 'Backup cleanup failed (non-critical)');
      }
      
      resolve();
    });
  });
}

function cleanupOldBackups(logger: FastifyBaseLogger) {
  const files = fs.readdirSync(BACKUP_DIR);
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  files.forEach(file => {
    const filePath = path.join(BACKUP_DIR, file);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > thirtyDaysMs) {
      logger.info({ file }, 'Cleaning up expired backup');
      fs.unlinkSync(filePath);
    }
  });
}
