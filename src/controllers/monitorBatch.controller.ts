import { FastifyReply, FastifyRequest } from 'fastify';
import { createMonitorBatch } from '../services/monitorBatch.service';
import { checkIdempotency } from '../services/idempotency.service';
import { generateHash } from '../utils/hash';
import { MonitorBatchCreatedResponse, MonitorBatchRequestBody } from '../types';
import { ConflictError } from '../errors';

export async function createMonitorBatchController(
  request: FastifyRequest<{ Body: MonitorBatchRequestBody }>,
  reply: FastifyReply,
): Promise<void> {
  const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

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
    const cachedResponse = await checkIdempotency(
      request.apiKey.id,
      idempotencyKey,
      request.body as Record<string, unknown>,
    );

    if (cachedResponse) {
      reply.code(202).send(cachedResponse);
      return;
    }

    // Handles idempotency storage in transaction if key provided
    const requestHash = idempotencyKey ? generateHash(JSON.stringify(request.body)) : undefined;
    const idempotencyOptions = idempotencyKey && requestHash ? { key: idempotencyKey, requestHash } : undefined;

    const response: MonitorBatchCreatedResponse = await createMonitorBatch(
      request.apiKey.id,
      urls,
      request.log,
      idempotencyOptions,
    );

    reply.code(202).send(response);
  } catch (error) {
    if (error instanceof ConflictError) {
      reply.code(409).send({
        error: 'Conflict',
        message: error.message,
        request_id: request.requestId,
      });
    } else {
      throw error;
    }
  }
}
