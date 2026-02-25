import { canonicalizeUrl } from '../utils/canonicalizeUrl';
import { fetchPage } from '../utils/fetchPage';
import { createReplaySnapshot } from '../repositories/replaySnapshot.repository';

export type CaptureReplaySnapshotResult = {
  snapshotId: string;
  canonicalUrl: string;
};

/**
 * Fetches a page by URL and stores its raw HTML in the replay_snapshots table.
 *
 * Flow:
 * 1. Canonicalize the URL
 * 2. Fetch raw HTML via the production fetch pipeline (timeout, redirect, validation included)
 * 3. Persist canonicalUrl + rawHtml via repository
 * 4. Return the snapshot ID and canonical URL
 *
 * STRICT:
 * - No risk analysis
 * - No section extraction
 * - No hashing
 * - No masking
 * - Stores raw HTML only
 * - Propagates ApiError types from fetch/canonicalize on failure
 *
 * @param url - Raw URL from request body
 * @returns Snapshot ID and canonicalized URL
 */
export async function captureReplaySnapshot(url: string): Promise<CaptureReplaySnapshotResult> {
  const canonicalUrl = canonicalizeUrl(url);

  const rawHtml = await fetchPage(canonicalUrl);

  const { id } = await createReplaySnapshot(canonicalUrl, rawHtml);

  return {
    snapshotId: id,
    canonicalUrl,
  };
}
