import { FastifyReply, FastifyRequest } from 'fastify';
import { getUsageSnapshot } from '../services/usage.service';

export async function getUsageController(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.apiKey) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'API key missing or invalid',
      request_id: request.requestId,
    });
    return;
  }

  const snapshot = await getUsageSnapshot(request.apiKey.id);

  reply.send({
    tier: snapshot.tier,
    monthly_quota: snapshot.monthlyQuota,
    monthly_usage: snapshot.monthlyUsage,
    remaining: snapshot.remaining,
    quota_reset_at: snapshot.quotaResetAt.toISOString(),
  });
}
