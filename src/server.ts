import './lib/env';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';

const app = Fastify();

app.register(cookie);
app.register(healthRoutes);
app.register(authRoutes);

const port = Number(process.env.PORT || 3250);

app
  .listen({ port, host: '127.0.0.1' })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
