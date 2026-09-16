import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds, isFinanceAllowed } from '../modules/auth/guards';
import { toNumber } from '../lib/api-helpers';

interface DashboardRow {
  total_federations: string;
  total_athletes: string;
  total_applications: string;
  total_policies: string;
  active_policies: string;
  paid_amount_kopecks: string;
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/dashboard', async (request, reply) => {
    const account = await authenticate(request);
    const federationIds = await getAccessibleFederationIds(account);

    const result = await pool.query<DashboardRow>(
      `SELECT
        (SELECT count(*) FROM federations WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))) AS total_federations,
        (SELECT count(DISTINCT person_id) FROM federation_memberships WHERE ($1::uuid[] IS NULL OR federation_id = ANY($1::uuid[]))) AS total_athletes,
        (SELECT count(*) FROM applications WHERE ($1::uuid[] IS NULL OR federation_id = ANY($1::uuid[]))) AS total_applications,
        (SELECT count(*) FROM policies WHERE ($1::uuid[] IS NULL OR federation_id = ANY($1::uuid[]))) AS total_policies,
        (SELECT count(*) FROM policies WHERE status = 'active' AND ($1::uuid[] IS NULL OR federation_id = ANY($1::uuid[]))) AS active_policies,
        (SELECT COALESCE(sum(pay.amount_kopecks), 0) FROM payments pay
           JOIN applications a ON a.id = pay.application_id
           WHERE pay.status = 'paid' AND ($1::uuid[] IS NULL OR a.federation_id = ANY($1::uuid[]))) AS paid_amount_kopecks
      `,
      [federationIds],
    );

    const row = result.rows[0];
    const response: Record<string, number> = {
      total_federations: toNumber(row.total_federations),
      total_athletes: toNumber(row.total_athletes),
      total_applications: toNumber(row.total_applications),
      total_policies: toNumber(row.total_policies),
      active_policies: toNumber(row.active_policies),
    };

    if (isFinanceAllowed(account.role)) {
      response.paid_amount_kopecks = toNumber(row.paid_amount_kopecks);
    }

    return reply.status(200).send(response);
  });
}
