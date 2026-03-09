"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureReplaySnapshot = captureReplaySnapshot;
const canonicalizeUrl_1 = require("../utils/canonicalizeUrl");
const fetchPage_1 = require("../utils/fetchPage");
const replaySnapshot_repository_1 = require("../repositories/replaySnapshot.repository");
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
async function captureReplaySnapshot(url) {
    const canonicalUrl = (0, canonicalizeUrl_1.canonicalizeUrl)(url);
    const rawHtml = await (0, fetchPage_1.fetchPage)(canonicalUrl);
    const { id } = await (0, replaySnapshot_repository_1.createReplaySnapshot)(canonicalUrl, rawHtml);
    return {
        snapshotId: id,
        canonicalUrl,
    };
}
