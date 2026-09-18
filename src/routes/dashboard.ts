import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds, isFinanceAllowed } from '../modules/auth/guards';
import { getAccessibleCategories, getFederationIdsForCategories, requireSportAccess } from '../modules/auth/insurance-access';
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
    const categories = await getAccessibleCategories(account);
    // Federations/athletes are sport-domain entities. Sport admins see their full
    // totals without requiring a product assignment.
    // Applications/policies/payments *do* have a product category directly, so those
    // three (and the amount) are additionally filtered by $2 regardless of $1.
    if (account.role === 'admin' && categories?.includes('sport')) await requireSportAccess(account);
    const federationIds =
      account.role === 'admin' && categories?.includes('sport')
        ? null
        : categories !== null ? await getFederationIdsForCategories(categories) : await getAccessibleFederationIds(account);

    const result = await pool.query<DashboardRow>(
      `SELECT
        (SELECT count(*) FROM federations WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))) AS total_federations,
        (SELECT count(DISTINCT person_id) FROM federation_memberships WHERE ($1::uuid[] IS NULL OR federation_id = ANY($1::uuid[]))) AS total_athletes,
        (SELECT count(*) FROM applications a JOIN insurance_products ip ON ip.id = a.product_id
           WHERE ($1::uuid[] IS NULL OR a.federation_id = ANY($1::uuid[]))
             AND ($2::text[] IS NULL OR ip.category = ANY($2::text[]))) AS total_applications,
        (SELECT count(*) FROM policies pol JOIN insurance_products ip ON ip.id = pol.product_id
           WHERE ($1::uuid[] IS NULL OR pol.federation_id = ANY($1::uuid[]))
             AND ($2::text[] IS NULL OR ip.category = ANY($2::text[]))) AS total_policies,
        (SELECT count(*) FROM policies pol JOIN insurance_products ip ON ip.id = pol.product_id
           WHERE pol.status = 'active' AND ($1::uuid[] IS NULL OR pol.federation_id = ANY($1::uuid[]))
             AND ($2::text[] IS NULL OR ip.category = ANY($2::text[]))) AS active_policies,
        (SELECT COALESCE(sum(pay.amount_kopecks), 0) FROM payments pay
           JOIN applications a ON a.id = pay.application_id
           JOIN insurance_products ip ON ip.id = a.product_id
           WHERE pay.status = 'paid' AND ($1::uuid[] IS NULL OR a.federation_id = ANY($1::uuid[]))
             AND ($2::text[] IS NULL OR ip.category = ANY($2::text[]))) AS paid_amount_kopecks
      `,
      [federationIds, categories],
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
