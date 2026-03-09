"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSnapshotDeterminism = validateSnapshotDeterminism;
const crypto_1 = __importDefault(require("crypto"));
const replaySnapshot_repository_1 = require("../repositories/replaySnapshot.repository");
const pipelineSnapshot_service_1 = require("./pipelineSnapshot.service");
/**
 * Validates deterministic behavior of the pipeline by running a snapshot multiple times.
 * If any drift occurs, a NON_DETERMINISTIC_PIPELINE_DETECTED error is thrown.
 *
 * @param snapshotId UUID of the snapshot in replay_snapshots table
 * @param runs Number of times to replay the pipeline
 */
async function validateSnapshotDeterminism(snapshotId, runs) {
    const rawHtml = await (0, replaySnapshot_repository_1.getSnapshotRawHtml)(snapshotId);
    if (!rawHtml) {
        throw new Error('SNAPSHOT_NOT_FOUND');
    }
    let baselineHash = null;
    for (let i = 0; i < runs; i++) {
        // Execute pure pipeline
        const result = (0, pipelineSnapshot_service_1.processSnapshot)(rawHtml);
        // JSON.stringify output
        const resultString = JSON.stringify(result);
        // Hash output
        const outputHash = crypto_1.default.createHash('sha256').update(resultString).digest('hex');
        // Compare hashes
        if (baselineHash === null) {
            baselineHash = outputHash;
        }
        else if (baselineHash !== outputHash) {
            throw new Error('NON_DETERMINISTIC_PIPELINE_DETECTED');
        }
    }
}
