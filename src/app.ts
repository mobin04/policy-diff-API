import Fastify from 'fastify';
import { healthRoutes } from './routes/health.route';
import { checkRoutes } from './routes/check.route';

const app = Fastify({
  logger: true,
});

app.register(healthRoutes);
app.register(checkRoutes);

export default app;
