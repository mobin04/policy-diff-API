import { FastifyInstance } from 'fastify';
import { checkController } from '../controllers/check.controller';

export async function checkRoutes(fastify: FastifyInstance) {
  // Apply API key auth to all routes in this plugin
  fastify.addHook('onRequest', fastify.apiKeyAuth);

  fastify.post('/check', checkController);
}
