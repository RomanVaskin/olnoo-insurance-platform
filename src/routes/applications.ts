import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds } from '../modules/auth/guards';
import { assertUuid, NotFoundError, HttpError, toNumber } from '../lib/api-helpers';
import { federationSummary, personSummary, productSummary } from '../lib/mappers';
import { getLatestPaymentForApplication, getPolicyForApplication } from '../lib/related-queries';

const LIST_SELECT = `
  SELECT
    a.id, a.status, a.amount_kopecks, a.created_at, a.federation_id AS access_federation_id,
    p.id AS person_id, p.last_name AS person_last_name, p.first_name AS person_first_name, p.patronymic AS person_patronymic,
    f.id AS federation_id, f.name AS federation_name,
    ip.id AS product_id, ip.name AS product_name
  FROM applications a
  JOIN persons p ON p.id = a.person_id
  LEFT JOIN federations f ON f.id = a.federation_id
  JOIN insurance_products ip ON ip.id = a.product_id
`;

function mapApplicationRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    status: row.status,
    amount_kopecks: toNumber(row.amount_kopecks),
    created_at: row.created_at,
    person: personSummary(row),
    federation: federationSummary(row),
    product: productSummary(row),
  };
}

export async function applicationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/applications', async (request, reply) => {
    const account = await authenticate(request);
    const federationIds = await getAccessibleFederationIds(account);

    const result = await pool.query(
      `${LIST_SELECT}
       WHERE ($1::uuid[] IS NULL OR a.federation_id = ANY($1::uuid[]))
       ORDER BY a.created_at DESC`,
      [federationIds],
    );

    return reply.status(200).send(result.rows.map(mapApplicationRow));
  });

  app.get<{ Params: { id: string } }>('/api/applications/:id', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const result = await pool.query(`${LIST_SELECT} WHERE a.id = $1`, [request.params.id]);
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError('application_not_found');
    }

    if (account.role !== 'super_admin') {
      const federationIds = await getAccessibleFederationIds(account);
      const accessFederationId = row.access_federation_id as string | null;
      if (!accessFederationId || !federationIds?.includes(accessFederationId)) {
        throw new HttpError(403, 'forbidden');
      }
    }

    const [payment, policy] = await Promise.all([
      getLatestPaymentForApplication(row.id as string),
      getPolicyForApplication(row.id as string),
    ]);

    return reply.status(200).send({
      ...mapApplicationRow(row),
      payment,
      policy,
    });
  });
}
