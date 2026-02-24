import { FastifyRequest, FastifyReply } from 'fastify';
import { provisionApiKey } from '../services/provisioning.service';
import { PROVISION_SECRET } from '../config/env';
import { InvalidEmailError, ProvisionSecretInvalidError } from '../errors';
import { ApiKeyEnvironment } from '../types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ProvisionBody = {
  email: string;
  name: string;
  tier: 'FREE' | 'PRO' | 'ENTERPRISE';
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

  if (tier !== 'FREE' && tier !== 'PRO' && tier !== 'ENTERPRISE') {
    reply.status(400).send({ error: 'BadRequestError', message: 'Tier must be FREE, PRO, or ENTERPRISE' });
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
