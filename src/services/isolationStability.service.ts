/**
 * Detection logic for Content Isolation Layer instability.
 *
 * If the selected container or its text length changes between runs,
 * it indicates a layout shift that could lead to false-positive diffs.
 */

/**
 * Detect if isolation container has drifted between runs.
 *
 * @param previousFingerprint - Fingerprint from the previous successful run
 * @param currentFingerprint - Fingerprint from the current run
 * @returns true if drift detected, false otherwise
 */
export function detectIsolationDrift(
  previousFingerprint: string | null,
  currentFingerprint: string
): boolean {
  if (previousFingerprint === null) {
    return false;
  }

  return previousFingerprint !== currentFingerprint;
}
