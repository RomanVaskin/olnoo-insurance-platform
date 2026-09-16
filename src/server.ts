import './lib/env';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { dashboardRoutes } from './routes/dashboard';
import { applicationsRoutes } from './routes/applications';
import { policiesRoutes } from './routes/policies';
import { athletesRoutes } from './routes/athletes';
import { federationsRoutes } from './routes/federations';
import { paymentsRoutes } from './routes/payments';
import { productsRoutes } from './routes/products';

const app = Fastify();

app.register(cookie);
app.register(healthRoutes);
app.register(authRoutes);
app.register(dashboardRoutes);
app.register(applicationsRoutes);
app.register(policiesRoutes);
app.register(athletesRoutes);
app.register(federationsRoutes);
app.register(paymentsRoutes);
app.register(productsRoutes);

// Translates AuthError (401/403) and HttpError (400/404) thrown by route handlers
// into their intended JSON responses; anything else is an unexpected 500.
app.setErrorHandler((error, request, reply) => {
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  const code = (error as { code?: unknown }).code;

  if (typeof statusCode === 'number' && statusCode < 500 && typeof code === 'string') {
    return reply.status(statusCode).send({ error: code });
  }

  request.log.error(error);
  return reply.status(500).send({ error: 'internal_error' });
});

const port = Number(process.env.PORT || 3250);

app
  .listen({ port, host: '127.0.0.1' })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
