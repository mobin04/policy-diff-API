"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCrashRecovery = runCrashRecovery;
const monitorJob_repository_1 = require("../repositories/monitorJob.repository");
/**
 * Startup Recovery Service
 *
 * Checks for jobs that were stuck in PROCESSING state (e.g., due to server crash)
 * and marks them as FAILED with error_type 'CRASH_RECOVERY'.
 *
 * Logic:
 * - status = 'PROCESSING'
 * - started_at < NOW() - INTERVAL '5 minutes'
 *
 * Called before server starts accepting traffic.
 */
async function runCrashRecovery() {
    return await (0, monitorJob_repository_1.markOrphanedJobsFailed)();
}
