import { FastifyReply, FastifyRequest } from 'fastify';
import { createMonitorBatch } from '../services/monitorBatch.service';
import { MonitorBatchCreatedResponse, MonitorBatchRequestBody } from '../types';

export async function createMonitorBatchController(
  request: FastifyRequest<{ Body: MonitorBatchRequestBody }>,
  reply: FastifyReply,
): Promise<void> {
  if (!request.apiKey) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'API key missing or invalid',
      request_id: request.requestId,
    });
    return;
  }

  const urls = request.body?.urls;

  const response: MonitorBatchCreatedResponse = await createMonitorBatch(request.apiKey.id, urls, request.log);
  reply.code(202).send(response);
}

