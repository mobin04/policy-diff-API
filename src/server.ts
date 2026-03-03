import app from './app';
import { PORT, HOST, validateProductionConfig, IS_PRODUCTION } from './config';
import { DB } from './db';
import { initializeJobService } from './services/monitorJob.service';
import { getActiveJobCount } from './utils/concurrencyGuard';
import { markAsInitialized } from './routes/health.route';
import {
  initReconciliation,
  reconcileConcurrencyState,
} from './services/concurrencyReconciliation.service';
import { performBackup } from './services/backup.service';
import cron from 'node-cron';

let reconciliationInterval: NodeJS.Timeout | null = null;
let isShuttingDown = false;

/**
 * Server Bootstrap and Lifecycle Management
 */

const start = async () => {
  try {
    // 1. Secure configuration enforcement
    validateProductionConfig();

    // 2. Database readiness check (EXPLICIT migrations)
    try {
      await DB.query('SELECT 1 FROM applied_migrations LIMIT 1');
    } catch (err) {
      app.log.error('DATABASE_NOT_INITIALIZED: Run npm run migrate before starting server.');
      process.exit(1);
    }

    // 3. Mark any orphaned PROCESSING jobs as FAILED from previous server instance
    await initializeJobService(app.log);
    markAsInitialized();

    // 4. Start concurrency reconciliation guard
    initReconciliation(app.log);
    reconciliationInterval = setInterval(() => {
      reconcileConcurrencyState().catch((err: unknown) => {
        app.log.error({ err }, 'Concurrency reconciliation failure');
      });
    }, 10000);

    // 5. Setup Deterministic Background Scheduling (Single Instance only)
    if (IS_PRODUCTION) {
      // Schedule DB Backup daily at 03:00 AM
      cron.schedule('0 3 * * *', async () => {
        try {
          await performBackup(app.log);
        } catch (err) {
          // Error already logged by service
        }
      });
    }

    // 6. Start listening
    await app.listen({ port: PORT, host: HOST });
    app.log.info({ port: PORT, host: HOST }, 'Server started');
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }
};

/**
 * Graceful Shutdown Implementation
 */
const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  app.log.info({ signal }, 'Graceful shutdown initiated');

  setTimeout(() => {
    app.log.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 15000).unref();

  if (reconciliationInterval) {
    clearInterval(reconciliationInterval);
    reconciliationInterval = null;
  }

  try {
    await app.close();
    app.log.info('Fastify server closed');
  } catch (err) {
    app.log.error(err, 'Error closing Fastify server');
  }

  let waitAttempts = 0;
  while (getActiveJobCount() > 0 && waitAttempts < 10) {
    app.log.info({ activeJobs: getActiveJobCount() }, 'Waiting for active jobs...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    waitAttempts++;
  }

  try {
    await DB.end();
    app.log.info('PostgreSQL pool closed');
  } catch (err) {
    app.log.error(err, 'Error closing PostgreSQL pool');
  }

  app.log.info('Graceful shutdown complete. Exiting.');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
