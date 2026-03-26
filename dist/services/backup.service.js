"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.performBackup = performBackup;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const env_1 = require("../config/env");
/**
 * Internal Backup Service
 *
 * Executes a deterministic pg_dump and manages retention.
 */
const BACKUP_DIR = path_1.default.join(process.cwd(), 'backups');
async function performBackup(logger) {
    if (!fs_1.default.existsSync(BACKUP_DIR)) {
        fs_1.default.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `policydiff-backup-${timestamp}.sql`;
    const filepath = path_1.default.join(BACKUP_DIR, filename);
    logger.info({ filename }, 'Starting scheduled database backup');
    const command = `pg_dump "${env_1.DATABASE_URL}" > "${filepath}"`;
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)(command, (error, stdout, stderr) => {
            if (error) {
                logger.error({ err: error, stderr }, 'Database backup FAILED');
                return reject(error);
            }
            logger.info({ filepath }, 'Database backup SUCCESS');
            // Cleanup old backups (Keep 30 days)
            try {
                cleanupOldBackups(logger);
            }
            catch (cleanupErr) {
                logger.warn({ err: cleanupErr }, 'Backup cleanup failed (non-critical)');
            }
            resolve();
        });
    });
}
function cleanupOldBackups(logger) {
    const files = fs_1.default.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    files.forEach((file) => {
        const filePath = path_1.default.join(BACKUP_DIR, file);
        const stats = fs_1.default.statSync(filePath);
        if (now - stats.mtimeMs > thirtyDaysMs) {
            logger.info({ file }, 'Cleaning up expired backup');
            fs_1.default.unlinkSync(filePath);
        }
    });
}
