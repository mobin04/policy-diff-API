"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsageController = getUsageController;
const usage_service_1 = require("../services/usage.service");
async function getUsageController(request, reply) {
    if (!request.apiKey) {
        reply.code(401).send({
            error: 'Unauthorized',
            message: 'API key missing or invalid',
            request_id: request.requestId,
        });
        return;
    }
    const snapshot = await (0, usage_service_1.getUsageSnapshot)(request.apiKey.id);
    reply.send({
        tier: snapshot.tier,
        monthly_quota: snapshot.monthlyQuota,
        monthly_usage: snapshot.monthlyUsage,
        remaining: snapshot.remaining,
        quota_reset_at: snapshot.quotaResetAt.toISOString(),
    });
}
