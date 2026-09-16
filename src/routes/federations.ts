import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import {
  authenticate,
  getAccessibleFederationIds,
  isFinanceAllowed,
  requireFederationMembership,
} from '../modules/auth/guards';
import { assertUuid, NotFoundError, toNumber } from '../lib/api-helpers';

const LIST_SELECT = `
  SELECT
    f.id, f.name, f.slug, f.status,
    (SELECT count(*) FROM federation_memberships fm WHERE fm.federation_id = f.id) AS athlete_count,
    (SELECT count(*) FROM policies pol WHERE pol.federation_id = f.id) AS policy_count,
    (SELECT COALESCE(sum(pay.amount_kopecks), 0) FROM payments pay
       JOIN applications a ON a.id = pay.application_id
       WHERE a.federation_id = f.id AND pay.status = 'paid') AS paid_amount_kopecks
  FROM federations f
`;

export async function federationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/federations', async (request, reply) => {
    const account = await authenticate(request);
    const federationIds = await getAccessibleFederationIds(account);
    const showFinance = isFinanceAllowed(account.role);

    const result = await pool.query(
      `${LIST_SELECT}
       WHERE ($1::uuid[] IS NULL OR f.id = ANY($1::uuid[]))
       ORDER BY f.name`,
      [federationIds],
    );

    const response = result.rows.map((row) => {
      const item: Record<string, unknown> = {
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        athlete_count: toNumber(row.athlete_count),
      };
      if (showFinance) {
        item.policy_count = toNumber(row.policy_count);
        item.paid_amount_kopecks = toNumber(row.paid_amount_kopecks);
      }
      return item;
    });

    return reply.status(200).send(response);
  });

  app.get<{ Params: { id: string } }>('/api/federations/:id', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);
    const federationId = request.params.id;

    const federationResult = await pool.query(
      `SELECT id, name, slug, status FROM federations WHERE id = $1`,
      [federationId],
    );
    const federation = federationResult.rows[0];
    if (!federation) {
      throw new NotFoundError('federation_not_found');
    }

    // Throws 403 if the account is not super_admin and not a member of this federation.
    const membershipRole = await requireFederationMembership(account, federationId);
    const showFinance = account.role === 'super_admin' || membershipRole === 'director';

    const [usersResult, athletesResult, productsResult, athleteCountResult, aggregatesResult] = await Promise.all([
      pool.query(
        `SELECT a.id, a.email, fu.role
         FROM federation_users fu
         JOIN accounts a ON a.id = fu.account_id
         WHERE fu.federation_id = $1
         ORDER BY fu.role, a.email`,
        [federationId],
      ),
      pool.query(
        `SELECT
           p.id AS person_id, p.last_name, p.first_name, p.patronymic,
           fm.club, fm.coach, fm.grade, fm.weight, fm.sport_name,
           active_pol.policy_number AS active_policy_number
         FROM federation_memberships fm
         JOIN persons p ON p.id = fm.person_id
         LEFT JOIN LATERAL (
           SELECT policy_number FROM policies
           WHERE person_id = fm.person_id AND status = 'active'
           ORDER BY valid_to DESC
           LIMIT 1
         ) active_pol ON true
         WHERE fm.federation_id = $1
         ORDER BY p.last_name, p.first_name`,
        [federationId],
      ),
      pool.query(
        `SELECT fp.id AS assignment_id, fp.price_kopecks, fp.active,
                ip.id AS product_id, ip.name AS product_name, ip.category AS product_category
         FROM federation_products fp
         JOIN insurance_products ip ON ip.id = fp.product_id
         WHERE fp.federation_id = $1
         ORDER BY fp.created_at DESC`,
        [federationId],
      ),
      pool.query(`SELECT count(*) AS athlete_count FROM federation_memberships WHERE federation_id = $1`, [
        federationId,
      ]),
      pool.query(
        `SELECT
           (SELECT count(*) FROM applications WHERE federation_id = $1) AS application_count,
           (SELECT count(*) FROM policies WHERE federation_id = $1) AS policy_count,
           (SELECT COALESCE(sum(pay.amount_kopecks), 0) FROM payments pay
              JOIN applications a ON a.id = pay.application_id
              WHERE a.federation_id = $1 AND pay.status = 'paid') AS paid_amount_kopecks`,
        [federationId],
      ),
    ]);

    const response: Record<string, unknown> = {
      federation,
      assigned_users: usersResult.rows.map((row) => ({ id: row.id, email: row.email, role: row.role })),
      athlete_count: toNumber(athleteCountResult.rows[0].athlete_count),
      athletes: athletesResult.rows.map((row) => ({
        id: row.person_id,
        last_name: row.last_name,
        first_name: row.first_name,
        patronymic: row.patronymic,
        club: row.club,
        coach: row.coach,
        grade: row.grade,
        weight: row.weight === null ? null : Number(row.weight),
        sport_name: row.sport_name,
        insured: row.active_policy_number !== null,
        active_policy_number: row.active_policy_number ?? null,
      })),
      assigned_products: productsResult.rows.map((row) => ({
        id: row.assignment_id,
        product: { id: row.product_id, name: row.product_name, category: row.product_category },
        price_kopecks: toNumber(row.price_kopecks),
        active: row.active,
      })),
    };

    if (showFinance) {
      const aggregates = aggregatesResult.rows[0];
      response.application_count = toNumber(aggregates.application_count);
      response.policy_count = toNumber(aggregates.policy_count);
      response.paid_amount_kopecks = toNumber(aggregates.paid_amount_kopecks);
    }

    return reply.status(200).send(response);
  });
}
