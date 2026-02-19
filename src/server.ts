import app from './app';
import { PORT, HOST, validateProductionConfig } from './config';
import { initDB, DB } from './db';
import { initializeJobService } from './services/monitorJob.service';
import { getActiveJobCount } from './utils/concurrencyGuard';
import { markAsInitialized } from './routes/health.route';

/**
 * Server Bootstrap and Lifecycle Management
 *
 * This file orchestrates:
 * 1. Secure configuration validation.
 * 2. Database initialization and migrations.
 * 3. Recovery of interrupted jobs.
 * 4. Graceful shutdown on termination signals.
 */

const start = async () => {
  try {
    // 1. Secure configuration enforcement
    validateProductionConfig();

    // 2. Database initialization
    await initDB();

    // 3. Mark any orphaned PROCESSING jobs as FAILED from previous server instance
    await initializeJobService(app.log);
    markAsInitialized();

    // 4. Start listening
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
  app.log.info({ signal }, 'Graceful shutdown initiated');

  // Stop accepting new requests
  try {
    await app.close();
    app.log.info('Fastify server closed (no longer accepting new requests)');
  } catch (err) {
    app.log.error(err, 'Error closing Fastify server');
  }

  // Wait for active monitor jobs to finish (max 10 seconds)
  let waitAttempts = 0;
  while (getActiveJobCount() > 0 && waitAttempts < 10) {
    app.log.info({ activeJobs: getActiveJobCount() }, 'Waiting for active jobs to finish...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    waitAttempts++;
  }

  if (getActiveJobCount() > 0) {
    app.log.warn({ activeJobs: getActiveJobCount() }, 'Some jobs did not finish within shutdown timeout');
  } else {
    app.log.info('All active jobs completed');
  }

  // Close DB connections
  try {
    await DB.end();
    app.log.info('PostgreSQL pool closed');
  } catch (err) {
    app.log.error(err, 'Error closing PostgreSQL pool');
  }

  app.log.info('Graceful shutdown complete. Exiting.');
  process.exit(0);
};

// Listen for termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
