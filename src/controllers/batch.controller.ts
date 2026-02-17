import { FastifyReply, FastifyRequest } from 'fastify';
import { getBatchStatus } from '../services/monitorBatch.service';
import { BatchStatusResponse } from '../types';

type BatchParams = {
  batchId: string;
};

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function getBatchStatusController(
  request: FastifyRequest<{ Params: BatchParams }>,
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

  const { batchId } = request.params;

  if (!batchId || !isUuid(batchId)) {
    reply.code(400).send({
      error: 'BadRequest',
      message: 'Invalid batch ID format',
      request_id: request.requestId,
    });
    return;
  }

  const status: BatchStatusResponse | null = await getBatchStatus(batchId, request.apiKey.id);
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

