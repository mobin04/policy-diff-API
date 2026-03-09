"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMonitorBatchController = createMonitorBatchController;
const monitorBatch_service_1 = require("../services/monitorBatch.service");
const idempotency_service_1 = require("../services/idempotency.service");
const hash_1 = require("../utils/hash");
const errors_1 = require("../errors");
async function createMonitorBatchController(request, reply) {
    const idempotencyKey = request.headers['idempotency-key'];
    if (!request.apiKey) {
        reply.code(401).send({
            error: 'Unauthorized',
            message: 'API key missing or invalid',
            request_id: request.requestId,
        });
        return;
    }
    const urls = request.body?.urls;
    try {
        // Check idempotency first
        const cachedResponse = await (0, idempotency_service_1.checkIdempotency)(request.apiKey.id, idempotencyKey, request.body);
        if (cachedResponse) {
            reply.code(202).send(cachedResponse);
            return;
        }
        // Handles idempotency storage in transaction if key provided
        const requestHash = idempotencyKey ? (0, hash_1.generateHash)(JSON.stringify(request.body)) : undefined;
        const idempotencyOptions = idempotencyKey && requestHash ? { key: idempotencyKey, requestHash } : undefined;
        const response = await (0, monitorBatch_service_1.createMonitorBatch)(request.apiKey.id, urls, request.log, idempotencyOptions);
        reply.code(202).send(response);
    }
    catch (error) {
        if (error instanceof errors_1.ConflictError) {
            reply.code(409).send({
                error: 'Conflict',
                message: error.message,
                request_id: request.requestId,
            });
        }
        else {
            throw error;
        }
    }
}
