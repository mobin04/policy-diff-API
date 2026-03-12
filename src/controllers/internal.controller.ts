import { FastifyRequest, FastifyReply } from 'fastify';
import { provisionApiKey, regenerateApiKey } from '../services/provisioning.service';
import { validateSnapshotDeterminism } from '../services/replayValidator.service';
import { captureReplaySnapshot } from '../services/replaySnapshot.service';
import { PROVISION_SECRET } from '../config';
import { InvalidEmailError, ProvisionSecretInvalidError, BadRequestError } from '../errors';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ProvisionBody = {
  email: string;
  name: string;
  tier: 'FREE' | 'STARTER' | 'PRO';
  environment: 'dev' | 'prod';
};

export async function provisionHandler(request: FastifyRequest<{ Body: ProvisionBody }>, reply: FastifyReply) {
  const secret = request.headers['x-provision-secret'];
  if (!secret || secret !== PROVISION_SECRET) {
    throw new ProvisionSecretInvalidError();
  }

  const { email, name, tier, environment } = request.body;

  if (!email || !EMAIL_REGEX.test(email)) {
    throw new InvalidEmailError();
  }

  if (environment !== 'dev' && environment !== 'prod') {
    reply.status(400).send({ error: 'BadRequestError', message: 'Environment must be dev or prod' });
    return;
  }

  if (tier !== 'FREE' && tier !== 'STARTER' && tier !== 'PRO') {
    reply.status(400).send({ error: 'BadRequestError', message: 'Tier must be FREE, STARTER, or PRO' });
    return;
  }

  const { rawKey } = await provisionApiKey({
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

export async function regenerateKeyHandler(request: FastifyRequest<{ Body: { email: string } }>, reply: FastifyReply) {
  const secret = request.headers['x-provision-secret'];
  if (!secret || secret !== PROVISION_SECRET) {
    throw new ProvisionSecretInvalidError();
  }

  const { email } = request.body;

  if (!email || !EMAIL_REGEX.test(email)) {
    throw new InvalidEmailError();
  }

  try {
    const { rawKey, rotatedAt } = await regenerateApiKey(email);

    request.log.info({
      event: 'api_key_regenerated',
      email,
    });

    return {
      apiKey: rawKey,
      last_rotated: rotatedAt.toISOString(),
      warning: 'Store this key securely. It will not be shown again.',
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'API_KEY_NOT_FOUND') {
      reply.status(404).send({ error: 'NotFound', message: 'Active API key not found for this email' });
      return;
    }
    throw err;
  }
}

export async function replayHandler(request: FastifyRequest<{ Params: { snapshotId: string } }>, reply: FastifyReply) {
  const { snapshotId } = request.params;

  try {
    // Optional endpoint calls validateSnapshotDeterminism exactly 5 times as specified
    await validateSnapshotDeterminism(snapshotId, 5);
    return { status: 'PASS' };
  } catch (err: unknown) {
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
export async function createSnapshotController(
  request: FastifyRequest<{ Body: { url: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const body: unknown = request.body;

  if (
    !body ||
    typeof body !== 'object' ||
    !('url' in body) ||
    typeof (body as { url: unknown }).url !== 'string' ||
    !(body as { url: string }).url.trim()
  ) {
    throw new BadRequestError('Missing or invalid "url" field in request body');
  }

  const { url } = body as { url: string };

  const { snapshotId, canonicalUrl } = await captureReplaySnapshot(url);

  reply.send({
    snapshot_id: snapshotId,
    url: canonicalUrl,
  });
}
