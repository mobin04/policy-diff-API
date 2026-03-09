"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkController = checkController;
const page_service_1 = require("../services/page.service");
const usage_service_1 = require("../services/usage.service");
/**
 * Controller for POST /v1/check
 *
 * Validates URL presence and delegates to page service.
 * Supports optional ?min_interval=N query param for cooldown (in minutes).
 *
 * All errors (InvalidUrlError, FetchError, HttpError) are
 * propagated to the global error handler for consistent responses.
 */
async function checkController(request, reply) {
    const { url } = request.body || {};
    const minIntervalParam = request.query.min_interval;
    // Validate URL presence
    if (!url || typeof url !== 'string') {
        reply.code(400).send({
            error: 'BadRequest',
            message: 'URL is required',
            request_id: request.requestId,
        });
        return;
    }
    // Parse min_interval if provided
    let minInterval;
    if (minIntervalParam) {
        const parsed = parseInt(minIntervalParam, 10);
        if (isNaN(parsed) || parsed < 0) {
            reply.code(400).send({
                error: 'BadRequest',
                message: 'min_interval must be a non-negative integer (minutes)',
                request_id: request.requestId,
            });
            return;
        }
        minInterval = parsed;
    }
    // 1. Quota consumption (atomic)
    await (0, usage_service_1.consumeJobs)(request.apiKey.id, 1);
    // 2. Delegate to service with options
    const checkResult = await (0, page_service_1.checkPage)(url, {
        minInterval,
        logger: request.log,
    });
    // If skipped due to cooldown, return 200 with skip info
    // If processed, return the actual result
    if (checkResult.status === 'skipped') {
        reply.send({
            status: 'skipped',
            reason: checkResult.reason,
            last_checked: checkResult.last_checked,
            ...(checkResult.result && { cached_result: checkResult.result }),
        });
    }
    else {
        reply.send(checkResult.result);
    }
}
