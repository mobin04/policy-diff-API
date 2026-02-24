import crypto from 'crypto';
import { getSnapshotRawHtml } from '../repositories/replaySnapshot.repository';
import { processSnapshot, SnapshotPipelineResult } from './pipelineSnapshot.service';

/**
 * Validates deterministic behavior of the pipeline by running a snapshot multiple times.
 * If any drift occurs, a NON_DETERMINISTIC_PIPELINE_DETECTED error is thrown.
 *
 * @param snapshotId UUID of the snapshot in replay_snapshots table
 * @param runs Number of times to replay the pipeline
 */
export async function validateSnapshotDeterminism(snapshotId: string, runs: number): Promise<void> {
  const rawHtml = await getSnapshotRawHtml(snapshotId);

  if (!rawHtml) {
    throw new Error('SNAPSHOT_NOT_FOUND');
  }

  let baselineHash: string | null = null;

  for (let i = 0; i < runs; i++) {
    // Execute pure pipeline
    const result: SnapshotPipelineResult = processSnapshot(rawHtml);

    // JSON.stringify output
    const resultString = JSON.stringify(result);

    // Hash output
    const outputHash = crypto.createHash('sha256').update(resultString).digest('hex');

    // Compare hashes
    if (baselineHash === null) {
      baselineHash = outputHash;
    } else if (baselineHash !== outputHash) {
      throw new Error('NON_DETERMINISTIC_PIPELINE_DETECTED');
    }
  }
}
