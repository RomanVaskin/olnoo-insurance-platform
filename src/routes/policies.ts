import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds } from '../modules/auth/guards';
import { assertUuid, NotFoundError, HttpError, toNumber } from '../lib/api-helpers';
import { federationSummary, personSummary, productSummary } from '../lib/mappers';
import { getLatestPaymentForApplication } from '../lib/related-queries';

const LIST_SELECT = `
  SELECT
    pol.id, pol.policy_number, pol.status, pol.valid_from, pol.valid_to, pol.policy_url,
    pol.application_id, pol.federation_id AS access_federation_id,
    p.id AS person_id, p.last_name AS person_last_name, p.first_name AS person_first_name, p.patronymic AS person_patronymic,
    f.id AS federation_id, f.name AS federation_name,
    ip.id AS product_id, ip.name AS product_name
  FROM policies pol
  JOIN persons p ON p.id = pol.person_id
  LEFT JOIN federations f ON f.id = pol.federation_id
  JOIN insurance_products ip ON ip.id = pol.product_id
`;

function mapPolicyRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    policy_number: row.policy_number,
    status: row.status,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    policy_url: row.policy_url,
    person: personSummary(row),
    federation: federationSummary(row),
    product: productSummary(row),
  };
}

export async function policiesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/policies', async (request, reply) => {
    const account = await authenticate(request);
    const federationIds = await getAccessibleFederationIds(account);

    const result = await pool.query(
      `${LIST_SELECT}
       WHERE ($1::uuid[] IS NULL OR pol.federation_id = ANY($1::uuid[]))
       ORDER BY pol.valid_from DESC`,
      [federationIds],
    );

    return reply.status(200).send(result.rows.map(mapPolicyRow));
  });

  app.get<{ Params: { id: string } }>('/api/policies/:id', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const result = await pool.query(`${LIST_SELECT} WHERE pol.id = $1`, [request.params.id]);
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError('policy_not_found');
    }

    if (account.role !== 'super_admin') {
      const federationIds = await getAccessibleFederationIds(account);
      const accessFederationId = row.access_federation_id as string | null;
      if (!accessFederationId || !federationIds?.includes(accessFederationId)) {
        throw new HttpError(403, 'forbidden');
      }
    }

    const applicationResult = await pool.query(
      `SELECT id, status, amount_kopecks, created_at FROM applications WHERE id = $1`,
      [row.application_id],
    );
    const applicationRow = applicationResult.rows[0];
    const application = applicationRow
      ? {
          id: applicationRow.id,
          status: applicationRow.status,
          amount_kopecks: toNumber(applicationRow.amount_kopecks),
          created_at: applicationRow.created_at,
        }
      : null;

    const payment = await getLatestPaymentForApplication(row.application_id as string);

    return reply.status(200).send({
      ...mapPolicyRow(row),
      application,
      payment,
    });
  });
}
