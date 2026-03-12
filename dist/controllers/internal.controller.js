"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.provisionHandler = provisionHandler;
exports.regenerateKeyHandler = regenerateKeyHandler;
exports.replayHandler = replayHandler;
exports.createSnapshotController = createSnapshotController;
const provisioning_service_1 = require("../services/provisioning.service");
const replayValidator_service_1 = require("../services/replayValidator.service");
const replaySnapshot_service_1 = require("../services/replaySnapshot.service");
const config_1 = require("../config");
const errors_1 = require("../errors");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function provisionHandler(request, reply) {
    const secret = request.headers['x-provision-secret'];
    if (!secret || secret !== config_1.PROVISION_SECRET) {
        throw new errors_1.ProvisionSecretInvalidError();
    }
    const { email, name, tier, environment } = request.body;
    if (!email || !EMAIL_REGEX.test(email)) {
        throw new errors_1.InvalidEmailError();
    }
    if (environment !== 'dev' && environment !== 'prod') {
        reply.status(400).send({ error: 'BadRequestError', message: 'Environment must be dev or prod' });
        return;
    }
    if (tier !== 'FREE' && tier !== 'STARTER' && tier !== 'PRO') {
        reply.status(400).send({ error: 'BadRequestError', message: 'Tier must be FREE, STARTER, or PRO' });
        return;
    }
    const { rawKey } = await (0, provisioning_service_1.provisionApiKey)({
        email,
        name,
        tier,
        environment,
    });
    request.log.info({
        event: 'api_key_provisioned',
        email,
        tier,
        environment,
    });
    return {
        apiKey: rawKey,
        warning: 'Store this key securely. It will not be shown again.',
    };
}
async function regenerateKeyHandler(request, reply) {
    const secret = request.headers['x-provision-secret'];
    if (!secret || secret !== config_1.PROVISION_SECRET) {
        throw new errors_1.ProvisionSecretInvalidError();
    }
    const { email } = request.body;
    if (!email || !EMAIL_REGEX.test(email)) {
        throw new errors_1.InvalidEmailError();
    }
    try {
        const { rawKey, rotatedAt } = await (0, provisioning_service_1.regenerateApiKey)(email);
        request.log.info({
            event: 'api_key_regenerated',
            email,
        });
        return {
            apiKey: rawKey,
            last_rotated: rotatedAt.toISOString(),
            warning: 'Store this key securely. It will not be shown again.',
        };
    }
    catch (err) {
        if (err instanceof Error && err.message === 'API_KEY_NOT_FOUND') {
            reply.status(404).send({ error: 'NotFound', message: 'Active API key not found for this email' });
            return;
        }
        throw err;
    }
}
async function replayHandler(request, reply) {
    const { snapshotId } = request.params;
    try {
        // Optional endpoint calls validateSnapshotDeterminism exactly 5 times as specified
        await (0, replayValidator_service_1.validateSnapshotDeterminism)(snapshotId, 5);
        return { status: 'PASS' };
    }
    catch (err) {
        reply.status(500).send({ error: 'NON_DETERMINISTIC_PIPELINE_DETECTED' });
    }
}
/**
 * POST /v1/internal/snapshot
 *
 * Fetches a live policy page and stores its raw HTML in the replay_snapshots table.
 * Used exclusively for pre-deployment determinism captures.
 *
 * Protected by X-Internal-Token.
 * No quota enforcement, no job creation, no analysis pipeline.
 */
async function createSnapshotController(request, reply) {
    const body = request.body;
    if (!body ||
        typeof body !== 'object' ||
        !('url' in body) ||
        typeof body.url !== 'string' ||
        !body.url.trim()) {
        throw new errors_1.BadRequestError('Missing or invalid "url" field in request body');
    }
    const { url } = body;
    const { snapshotId, canonicalUrl } = await (0, replaySnapshot_service_1.captureReplaySnapshot)(url);
    reply.send({
        snapshot_id: snapshotId,
        url: canonicalUrl,
    });
}
