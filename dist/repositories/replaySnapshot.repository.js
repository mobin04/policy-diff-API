"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSnapshotRawHtml = getSnapshotRawHtml;
exports.createReplaySnapshot = createReplaySnapshot;
const db_1 = require("../db");
/**
 * Retrieve the raw HTML for a specific replay snapshot
 *
 * @param id UUID of the snapshot
 * @returns raw_html string or null if not found
 */
async function getSnapshotRawHtml(id) {
    const result = await db_1.DB.query('SELECT raw_html FROM replay_snapshots WHERE id = $1', [id]);
    if (result.rows.length === 0) {
        return null;
    }
    return result.rows[0].raw_html;
}
/**
 * Insert a new replay snapshot into the database
 *
 * @param url - Canonicalized URL of the page
 * @param rawHtml - Raw HTML content fetched from the page
 * @returns Generated snapshot UUID
 */
async function createReplaySnapshot(url, rawHtml) {
    const result = await db_1.DB.query('INSERT INTO replay_snapshots (url, raw_html) VALUES ($1, $2) RETURNING id', [url, rawHtml]);
    return { id: result.rows[0].id };
}
