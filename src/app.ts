import Fastify from 'fastify';
import { healthRoutes } from './routes/health.route';
import { checkRoutes } from './routes/check.route';
import { apiKeyAuthPlugin } from './plugins/apiKeyAuth';

const app = Fastify({
  logger: true,
});

// Register API key auth plugin (makes fastify.apiKeyAuth available)
app.register(apiKeyAuthPlugin);

// Public routes (no auth required)
app.register(healthRoutes);

// Protected routes under /v1 prefix
app.register(checkRoutes, { prefix: '/v1' });

export default app;
