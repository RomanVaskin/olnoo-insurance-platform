import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    await pool.query('SELECT 1');
    return reply.send({ status: 'ok' });
  });
}
