"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordCooldownHit = recordCooldownHit;
const db_1 = require("../db");
/**
 * Record a cooldown cache hit for instrumentation and metrics.
 *
 * @param pageId - Database ID of the page
 * @param integrityWarning - True if cached result was missing expected metadata
 * @param isolationDriftDetected - True if the cached result previously flagged drift
 */
async function recordCooldownHit(pageId, integrityWarning = false, isolationDriftDetected = false) {
    await db_1.DB.query('INSERT INTO cooldown_hits (page_id, integrity_warning, isolation_drift_detected) VALUES ($1, $2, $3)', [pageId, integrityWarning, isolationDriftDetected]);
}
