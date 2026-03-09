"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBatchStatusController = getBatchStatusController;
const monitorBatch_service_1 = require("../services/monitorBatch.service");
function isUuid(v) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
async function getBatchStatusController(request, reply) {
    if (!request.apiKey) {
        reply.code(401).send({
            error: 'Unauthorized',
            message: 'API key missing or invalid',
            request_id: request.requestId,
        });
        return;
    }
    const { batchId } = request.params;
    if (!batchId || !isUuid(batchId)) {
        reply.code(400).send({
            error: 'BadRequest',
            message: 'Invalid batch ID format',
            request_id: request.requestId,
        });
        return;
    }
    const status = await (0, monitorBatch_service_1.getBatchStatus)(batchId, request.apiKey.id);
    if (!status) {
        reply.code(404).send({
            error: 'NotFound',
            message: 'Batch not found',
            request_id: request.requestId,
        });
        return;
    }
    reply.send(status);
}
