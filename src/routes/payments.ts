import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds } from '../modules/auth/guards';
import { assertUuid, NotFoundError, HttpError, toNumber } from '../lib/api-helpers';
import { federationSummary, personSummary, productSummary } from '../lib/mappers';
import { getPolicyForApplication } from '../lib/related-queries';

const LIST_SELECT = `
  SELECT
    pay.id, pay.application_id, pay.provider, pay.provider_payment_id,
    pay.amount_kopecks, pay.currency, pay.status, pay.paid_at, pay.created_at,
    a.federation_id AS access_federation_id,
    p.id AS person_id, p.last_name AS person_last_name, p.first_name AS person_first_name, p.patronymic AS person_patronymic,
    f.id AS federation_id, f.name AS federation_name,
    ip.id AS product_id, ip.name AS product_name,
    pol.policy_number AS policy_number
  FROM payments pay
  JOIN applications a ON a.id = pay.application_id
  JOIN persons p ON p.id = a.person_id
  LEFT JOIN federations f ON f.id = a.federation_id
  JOIN insurance_products ip ON ip.id = a.product_id
  LEFT JOIN policies pol ON pol.application_id = pay.application_id
`;

function mapPaymentRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    application_id: row.application_id,
    provider: row.provider,
    provider_payment_id: row.provider_payment_id,
    amount_kopecks: toNumber(row.amount_kopecks),
    currency: row.currency,
    status: row.status,
    paid_at: row.paid_at,
    created_at: row.created_at,
    person: personSummary(row),
    federation: federationSummary(row),
    product: productSummary(row),
    policy_number: (row.policy_number as string | null) ?? null,
  };
}

export async function paymentsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/payments', async (request, reply) => {
    const account = await authenticate(request);
    const federationIds = await getAccessibleFederationIds(account);

    const result = await pool.query(
      `${LIST_SELECT}
       WHERE ($1::uuid[] IS NULL OR a.federation_id = ANY($1::uuid[]))
       ORDER BY pay.created_at DESC`,
      [federationIds],
    );

    return reply.status(200).send(result.rows.map(mapPaymentRow));
  });

  app.get<{ Params: { id: string } }>('/api/payments/:id', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const result = await pool.query(`${LIST_SELECT} WHERE pay.id = $1`, [request.params.id]);
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError('payment_not_found');
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

    const policy = await getPolicyForApplication(row.application_id as string);

    return reply.status(200).send({
      ...mapPaymentRow(row),
      application,
      policy,
    });
  });
}
