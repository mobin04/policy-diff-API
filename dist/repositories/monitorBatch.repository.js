"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBatch = createBatch;
exports.getBatchByIdForApiKey = getBatchByIdForApiKey;
exports.getBatchJobCounts = getBatchJobCounts;
exports.listBatchJobs = listBatchJobs;
const db_1 = require("../db");
function rowToEntity(row) {
    return {
        id: row.id,
        apiKeyId: row.api_key_id,
        totalJobs: row.total_jobs,
        createdAt: row.created_at,
    };
}
async function createBatch(apiKeyId, totalJobs, client) {
    const db = client || db_1.DB;
    const result = await db.query(`INSERT INTO monitor_batches (api_key_id, total_jobs)
     VALUES ($1, $2)
     RETURNING *`, [apiKeyId, totalJobs]);
    return rowToEntity(result.rows[0]);
}
async function getBatchByIdForApiKey(batchId, apiKeyId) {
    const result = await db_1.DB.query('SELECT * FROM monitor_batches WHERE id = $1 AND api_key_id = $2', [
        batchId,
        apiKeyId,
    ]);
    if (result.rows.length === 0)
        return null;
    return rowToEntity(result.rows[0]);
}
async function getBatchJobCounts(batchId) {
    const result = await db_1.DB.query('SELECT status, COUNT(*)::int as count FROM monitor_jobs WHERE batch_id = $1 GROUP BY status', [batchId]);
    const counts = { completed: 0, processing: 0, failed: 0 };
    for (const row of result.rows) {
        if (row.status === 'COMPLETED')
            counts.completed = row.count;
        if (row.status === 'PROCESSING')
            counts.processing = row.count;
        if (row.status === 'FAILED')
            counts.failed = row.count;
    }
    return counts;
}
async function listBatchJobs(batchId) {
    const result = await db_1.DB.query(`SELECT p.url, j.id, j.status 
     FROM monitor_jobs j
     JOIN pages p ON j.page_id = p.id
     WHERE j.batch_id = $1 
     ORDER BY j.created_at ASC`, [batchId]);
    return result.rows.map((r) => ({ url: r.url, jobId: r.id, status: r.status }));
}
