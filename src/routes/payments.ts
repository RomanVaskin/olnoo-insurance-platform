import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds, assertApplicationRecordAccess } from '../modules/auth/guards';
import { assertUuid, NotFoundError, BadRequestError, toNumber } from '../lib/api-helpers';
import { federationSummary, personSummary, productSummary } from '../lib/mappers';
import { getPolicyForApplication } from '../lib/related-queries';
import { createYookassaPayment, getYookassaPayment, mapYookassaStatus } from '../modules/payments/yookassa';

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

    await assertApplicationRecordAccess(account, {
      federationId: row.access_federation_id as string | null,
      personId: row.person_id as string | null,
    });

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

  // Creates a YooKassa payment for an application and records it as a payments row.
  // Amount is always taken from the application on the server, never from the client.
  app.post<{ Body: { application_id?: string; return_url?: string } }>('/api/payments/create', async (request, reply) => {
    const account = await authenticate(request);

    const applicationId = request.body?.application_id;
    const returnUrl = request.body?.return_url;
    if (!applicationId || !returnUrl) {
      throw new BadRequestError('application_id_and_return_url_required');
    }
    assertUuid(applicationId);

    const applicationResult = await pool.query(
      `SELECT a.id, a.status, a.amount_kopecks, a.person_id, a.federation_id AS access_federation_id, ip.name AS product_name, p.email AS person_email
       FROM applications a
       JOIN insurance_products ip ON ip.id = a.product_id
       JOIN persons p ON p.id = a.person_id
       WHERE a.id = $1`,
      [applicationId],
    );
    const application = applicationResult.rows[0];
    if (!application) {
      throw new NotFoundError('application_not_found');
    }

    await assertApplicationRecordAccess(account, {
      federationId: application.access_federation_id as string | null,
      personId: application.person_id as string | null,
    });

    if (application.status === 'paid' || application.status === 'policy_issued') {
      throw new BadRequestError('application_already_paid');
    }

    // Receipt is mandatory for this shop; the email always comes from the person's
    // record, never from the client request body (client input isn't trusted for billing data).
    const personEmail = application.person_email as string | null;
    if (!personEmail) {
      throw new BadRequestError('email_required');
    }

    const amountKopecks = toNumber(application.amount_kopecks);
    const idempotenceKey = crypto.randomUUID();
    const description = `OLNOO Insurance — ${application.product_name as string}`;

    const yookassaPayment = await createYookassaPayment({
      amountKopecks,
      returnUrl,
      description,
      idempotenceKey,
      customerEmail: personEmail,
      metadata: { application_id: applicationId },
    });

    const status = mapYookassaStatus(yookassaPayment.status);

    const insertResult = await pool.query(
      `INSERT INTO payments (application_id, provider, provider_payment_id, amount_kopecks, currency, status)
       VALUES ($1, 'yookassa', $2, $3, 'RUB', $4)
       RETURNING id`,
      [applicationId, yookassaPayment.id, amountKopecks, status],
    );

    return reply.status(200).send({
      payment_id: insertResult.rows[0].id,
      confirmation_url: yookassaPayment.confirmation?.confirmation_url ?? null,
      status,
    });
  });

  // Fetches the live status from YooKassa, updates payments.status (and applications.status
  // on first success), and returns the current status.
  app.get<{ Params: { id: string } }>('/api/payments/:id/status', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const result = await pool.query(
      `SELECT pay.id, pay.application_id, pay.provider, pay.provider_payment_id, pay.status, pay.paid_at,
              a.person_id, a.federation_id AS access_federation_id, a.status AS application_status
       FROM payments pay
       JOIN applications a ON a.id = pay.application_id
       WHERE pay.id = $1`,
      [request.params.id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError('payment_not_found');
    }

    await assertApplicationRecordAccess(account, {
      federationId: row.access_federation_id as string | null,
      personId: row.person_id as string | null,
    });

    if (row.provider !== 'yookassa') {
      throw new BadRequestError('unsupported_provider');
    }

    const yookassaPayment = await getYookassaPayment(row.provider_payment_id as string);
    const status = mapYookassaStatus(yookassaPayment.status);

    let paidAt = row.paid_at as string | null;
    if (status !== row.status) {
      paidAt = status === 'paid' ? paidAt ?? new Date().toISOString() : paidAt;
      await pool.query(`UPDATE payments SET status = $1, paid_at = $2, updated_at = now() WHERE id = $3`, [
        status,
        paidAt,
        row.id,
      ]);
    }

    if (status === 'paid' && row.application_status !== 'paid' && row.application_status !== 'policy_issued') {
      await pool.query(
        `UPDATE applications SET status = 'paid', updated_at = now() WHERE id = $1 AND status NOT IN ('paid', 'policy_issued')`,
        [row.application_id],
      );
    }

    return reply.status(200).send({
      payment_id: row.id,
      status,
      paid_at: paidAt,
    });
  });
}
