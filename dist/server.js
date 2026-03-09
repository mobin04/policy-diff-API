"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const config_1 = require("./config");
const db_1 = require("./db");
const monitorJob_service_1 = require("./services/monitorJob.service");
const concurrencyGuard_1 = require("./utils/concurrencyGuard");
const health_route_1 = require("./routes/health.route");
const concurrencyReconciliation_service_1 = require("./services/concurrencyReconciliation.service");
const backup_service_1 = require("./services/backup.service");
const node_cron_1 = __importDefault(require("node-cron"));
let reconciliationInterval = null;
let isShuttingDown = false;
/**
 * Server Bootstrap and Lifecycle Management
 */
const start = async () => {
    try {
        // 1. Secure configuration enforcement
        (0, config_1.validateProductionConfig)();
        // 2. Database readiness check (EXPLICIT migrations)
        try {
            await db_1.DB.query('SELECT 1 FROM applied_migrations LIMIT 1');
        }
        catch (err) {
            // Differentiate between "Table missing" and "Connection failed"
            if (err.code === '42P01') {
                // 42P01 is PostgreSQL code for "undefined_table"
                app_1.default.log.error('DATABASE_NOT_INITIALIZED: Run npm run migrate before starting server.');
            }
            else {
                app_1.default.log.error({ err }, 'DATABASE_CONNECTION_ERROR: Could not connect to database.');
            }
            process.exit(1);
        }
        // 3. Mark any orphaned PROCESSING jobs as FAILED from previous server instance
        await (0, monitorJob_service_1.initializeJobService)(app_1.default.log);
        (0, health_route_1.markAsInitialized)();
        // 4. Start concurrency reconciliation guard
        (0, concurrencyReconciliation_service_1.initReconciliation)(app_1.default.log);
        reconciliationInterval = setInterval(() => {
            (0, concurrencyReconciliation_service_1.reconcileConcurrencyState)().catch((err) => {
                app_1.default.log.error({ err }, 'Concurrency reconciliation failure');
            });
        }, 10000);
        // 5. Setup Deterministic Background Scheduling (Single Instance only)
        if (config_1.IS_PRODUCTION) {
            // Schedule DB Backup daily at 03:00 AM
            node_cron_1.default.schedule('0 3 * * *', async () => {
                try {
                    await (0, backup_service_1.performBackup)(app_1.default.log);
                }
                catch (err) {
                    // Error already logged by service
                }
            });
        }
        // 6. Start listening
        await app_1.default.listen({ port: config_1.PORT, host: config_1.HOST });
        app_1.default.log.info({ port: config_1.PORT, host: config_1.HOST }, 'Server started');
    }
    catch (err) {
        app_1.default.log.error(err, 'Failed to start server');
        process.exit(1);
    }
};
/**
 * Graceful Shutdown Implementation
 */
const shutdown = async (signal) => {
    if (isShuttingDown)
        return;
    isShuttingDown = true;
    app_1.default.log.info({ signal }, 'Graceful shutdown initiated');
    setTimeout(() => {
        app_1.default.log.error('Graceful shutdown timed out, forcing exit');
        process.exit(1);
    }, 15000).unref();
    if (reconciliationInterval) {
        clearInterval(reconciliationInterval);
        reconciliationInterval = null;
    }
    try {
        await app_1.default.close();
        app_1.default.log.info('Fastify server closed');
    }
    catch (err) {
        app_1.default.log.error(err, 'Error closing Fastify server');
    }
    let waitAttempts = 0;
    while ((0, concurrencyGuard_1.getActiveJobCount)() > 0 && waitAttempts < 10) {
        app_1.default.log.info({ activeJobs: (0, concurrencyGuard_1.getActiveJobCount)() }, 'Waiting for active jobs...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        waitAttempts++;
    }
    try {
        await db_1.DB.end();
        app_1.default.log.info('PostgreSQL pool closed');
    }
    catch (err) {
        app_1.default.log.error(err, 'Error closing PostgreSQL pool');
    }
    app_1.default.log.info('Graceful shutdown complete. Exiting.');
    process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
start();
