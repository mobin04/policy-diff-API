"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordAbuseEvent = recordAbuseEvent;
exports.trackJobPolling = trackJobPolling;
exports.trackErrorRate = trackErrorRate;
const db_1 = require("../db");
/**
 * Simple in-memory sliding window counter for request abuse detection.
 * single-instance safe.
 */
class SlidingWindowCounter {
    constructor(windowSeconds, threshold) {
        this.windows = new Map();
        this.windowMs = windowSeconds * 1000;
        this.threshold = threshold;
    }
    /**
     * Record an event and return true if threshold exceeded
     */
    record(key) {
        const now = Date.now();
        let timestamps = this.windows.get(key) || [];
        // Filter out old timestamps
        const cutoff = now - this.windowMs;
        let firstValidIndex = 0;
        while (firstValidIndex < timestamps.length && timestamps[firstValidIndex] < cutoff) {
            firstValidIndex++;
        }
        if (firstValidIndex > 0) {
            timestamps = timestamps.slice(firstValidIndex);
        }
        timestamps.push(now);
        this.windows.set(key, timestamps);
        return timestamps.length > this.threshold;
    }
    /**
     * Cleanup old windows to prevent memory leaks
     */
    cleanup() {
        const now = Date.now();
        for (const [key, timestamps] of this.windows.entries()) {
            const valid = timestamps.filter((ts) => now - ts < this.windowMs);
            if (valid.length === 0) {
                this.windows.delete(key);
            }
            else {
                this.windows.set(key, valid);
            }
        }
    }
}
// 20 polls within 60 seconds
const jobPollCounter = new SlidingWindowCounter(60, 20);
// 10 errors within 60 seconds
const errorRateCounter = new SlidingWindowCounter(60, 10);
/**
 * Record a request abuse event for observability
 */
async function recordAbuseEvent(eventType, apiKeyId, requestIp, metadata) {
    await db_1.DB.query('INSERT INTO request_abuse_events (event_type, api_key_id, request_ip, metadata) VALUES ($1, $2, $3, $4)', [eventType, apiKeyId || null, requestIp || null, metadata ? JSON.stringify(metadata) : null]);
}
/**
 * Track job polling frequency
 * Returns true if high frequency detected
 */
function trackJobPolling(apiKeyId, jobId) {
    return jobPollCounter.record(`${apiKeyId}:${jobId}`);
}
/**
 * Track error rate per API key
 * Returns true if high error rate detected
 */
function trackErrorRate(apiKeyId) {
    return errorRateCounter.record(String(apiKeyId));
}
// Periodically cleanup in-memory counters (every 5 minutes)
setInterval(() => {
    jobPollCounter.cleanup();
    errorRateCounter.cleanup();
}, 5 * 60 * 1000).unref();
