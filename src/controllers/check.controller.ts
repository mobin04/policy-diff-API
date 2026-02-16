import { FastifyRequest, FastifyReply } from 'fastify';
import { checkPage } from '../services/page.service';

/**
 * Request body type for /v1/check endpoint
 */
type CheckRequestBody = {
  url: string;
};

/**
 * Controller for POST /v1/check
 *
 * Validates URL presence and delegates to page service.
 * All errors (InvalidUrlError, FetchError, HttpError) are
 * propagated to the global error handler for consistent responses.
 */
export async function checkController(
  request: FastifyRequest<{ Body: CheckRequestBody }>,
  reply: FastifyReply,
): Promise<void> {
  const { url } = request.body || {};

  // Validate URL presence
  if (!url || typeof url !== 'string') {
    reply.code(400).send({
      error: 'BadRequest',
      message: 'URL is required',
      request_id: request.requestId,
    });
    return;
  }

  // Delegate to service - errors propagate to global handler
  const result = await checkPage(url, request.log);
  reply.send(result);
}
