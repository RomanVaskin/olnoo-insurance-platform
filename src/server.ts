import './lib/env';
import Fastify from 'fastify';
import { healthRoutes } from './routes/health';

const app = Fastify();

app.register(healthRoutes);

const port = Number(process.env.PORT || 3240);

app
  .listen({ port, host: '127.0.0.1' })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
