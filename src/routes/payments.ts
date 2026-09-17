import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds, assertApplicationRecordAccess, isFinanceAllowed, AuthError } from '../modules/auth/guards';
import { getAccessibleCategories } from '../modules/auth/insurance-access';
import { assertUuid, NotFoundError, BadRequestError, toNumber } from '../lib/api-helpers';
import { federationSummary, personSummary, productSummary } from '../lib/mappers';
import { getPolicyForApplication } from '../lib/related-queries';
import {
  createYookassaPayment,
  getYookassaPayment,
  mapYookassaPaymentState,
  mapYookassaStatus,
  yookassaAmountToKopecks,
  type YookassaPayment,
} from '../modules/payments/yookassa';
import { resolvePaymentCredentials, getCredentialsForPaymentAccount } from '../modules/payments/routing';
import { applyVerifiedPaymentState } from '../modules/payments/lifecycle';

const LIST_SELECT = `
  SELECT
    pay.id, pay.application_id, pay.provider, pay.provider_payment_id,
    pay.amount_kopecks, pay.currency, pay.status, pay.paid_at, pay.created_at,
    pay.payment_account_id,
    a.federation_id AS access_federation_id,
    p.id AS person_id, p.last_name AS person_last_name, p.first_name AS person_first_name, p.patronymic AS person_patronymic,
    f.id AS federation_id, f.name AS federation_name,
    ip.id AS product_id, ip.name AS product_name, ip.category AS access_category,
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

function assertReturnUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestError('invalid_return_url');
  }
  if (url.username || url.password || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new BadRequestError('invalid_return_url');
  }

  const allowedOrigins = (process.env.PAYMENT_RETURN_URL_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === 'production') {
    if (url.protocol !== 'https:' || allowedOrigins.length === 0 || !allowedOrigins.includes(url.origin)) {
      throw new BadRequestError('return_url_not_allowed');
    }
  } else if (allowedOrigins.length > 0 && !allowedOrigins.includes(url.origin)) {
    throw new BadRequestError('return_url_not_allowed');
  }
  return url.toString();
}

function assertVerifiedPayment(
  payment: YookassaPayment,
  expected: { providerPaymentId: string; applicationId: string; amountKopecks: number; currency: string },
): void {
  const amountKopecks = yookassaAmountToKopecks(payment.amount);
  if (
    payment.id !== expected.providerPaymentId ||
    amountKopecks !== expected.amountKopecks ||
    expected.currency !== 'RUB' ||
    (payment.metadata?.application_id !== undefined && payment.metadata.application_id !== expected.applicationId)
  ) {
    throw new Error('yookassa_payment_verification_failed');
  }
}

type YookassaWebhookEvent =
  | 'payment.waiting_for_capture'
  | 'payment.succeeded'
  | 'payment.canceled'
  | 'refund.succeeded';

function parseWebhook(body: unknown): { event: YookassaWebhookEvent; providerPaymentId: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestError('invalid_webhook');
  }
  const notification = body as Record<string, unknown>;
  const supportedEvents = new Set<YookassaWebhookEvent>([
    'payment.waiting_for_capture',
    'payment.succeeded',
    'payment.canceled',
    'refund.succeeded',
  ]);
  if (notification.type !== 'notification' || !supportedEvents.has(notification.event as YookassaWebhookEvent)) {
    throw new BadRequestError('unsupported_webhook_event');
  }
  if (!notification.object || typeof notification.object !== 'object' || Array.isArray(notification.object)) {
    throw new BadRequestError('invalid_webhook');
  }
  const event = notification.event as YookassaWebhookEvent;
  const object = notification.object as Record<string, unknown>;
  const expectedStatus = event === 'payment.succeeded'
    ? 'succeeded'
    : event === 'payment.canceled'
      ? 'canceled'
      : event === 'payment.waiting_for_capture'
        ? 'waiting_for_capture'
        : 'succeeded';
  if (object.status !== expectedStatus) {
    throw new BadRequestError('invalid_webhook');
  }
  const providerPaymentId = event === 'refund.succeeded' ? object.payment_id : object.id;
  if (typeof providerPaymentId !== 'string' || providerPaymentId.length === 0 || providerPaymentId.length > 200) {
    throw new BadRequestError('invalid_webhook');
  }
  return { event, providerPaymentId };
}

async function fetchAndVerifyYookassaPayment(row: Record<string, unknown>): Promise<YookassaPayment> {
  const credentials = await getCredentialsForPaymentAccount(row.payment_account_id as string | null);
  const payment = await getYookassaPayment(row.provider_payment_id as string, credentials);
  assertVerifiedPayment(payment, {
    providerPaymentId: row.provider_payment_id as string,
    applicationId: row.application_id as string,
    amountKopecks: toNumber(row.amount_kopecks),
    currency: row.currency as string,
  });
  return payment;
}

export async function paymentsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/payments', async (request, reply) => {
    const account = await authenticate(request);

    // Payment records are financial data: only super_admin and federation_director
    // (never federation_secretary) may list them. Athletes are denied below by
    // getAccessibleFederationIds regardless (unchanged).
    if (!isFinanceAllowed(account.role)) {
      throw new AuthError(403, 'forbidden');
    }

    const federationIds = await getAccessibleFederationIds(account);
    const categories = await getAccessibleCategories(account);

    const result = await pool.query(
      `${LIST_SELECT}
       WHERE ($1::uuid[] IS NULL OR a.federation_id = ANY($1::uuid[]))
         AND ($2::text[] IS NULL OR ip.category = ANY($2::text[]))
       ORDER BY pay.created_at DESC`,
      [federationIds, categories],
    );

    return reply.status(200).send(result.rows.map(mapPaymentRow));
  });

  app.get<{ Params: { id: string } }>('/api/payments/:id', async (request, reply) => {
    const account = await authenticate(request);

    // Same finance-only rule as the list route, but athletes keep their existing
    // access to their own payment record (handled below by assertApplicationRecordAccess).
    if (account.role !== 'athlete' && !isFinanceAllowed(account.role)) {
      throw new AuthError(403, 'forbidden');
    }

    assertUuid(request.params.id);

    const result = await pool.query(`${LIST_SELECT} WHERE pay.id = $1`, [request.params.id]);
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError('payment_not_found');
    }

    await assertApplicationRecordAccess(account, {
      federationId: row.access_federation_id as string | null,
      personId: row.person_id as string | null,
      category: row.access_category as string | null,
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
    const rawReturnUrl = request.body?.return_url;
    if (!applicationId || !rawReturnUrl) {
      throw new BadRequestError('application_id_and_return_url_required');
    }
    assertUuid(applicationId);
    const returnUrl = assertReturnUrl(rawReturnUrl);

    const applicationResult = await pool.query(
      `SELECT a.id, a.status, a.amount_kopecks, a.person_id, a.federation_id AS access_federation_id,
              ip.id AS product_id, ip.name AS product_name, ip.category AS access_category,
              p.email AS person_email
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
      category: application.access_category as string | null,
    });

    if (application.status === 'paid' || application.status === 'policy_issued') {
      throw new BadRequestError('application_already_paid');
    }
    if (application.status === 'cancelled') {
      throw new BadRequestError('application_cancelled');
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

    // Which shop/secret to charge is decided entirely server-side from the application's
    // own product/federation/category — the client has no say in payment routing.
    const credentials = await resolvePaymentCredentials({
      productId: application.product_id as string,
      federationId: application.access_federation_id as string | null,
      category: application.access_category as string,
    });

    const yookassaPayment = await createYookassaPayment({
      amountKopecks,
      returnUrl,
      description,
      idempotenceKey,
      customerEmail: personEmail,
      metadata: { application_id: applicationId },
      credentials,
    });

    const status = mapYookassaStatus(yookassaPayment.status);

    const insertResult = await pool.query(
      `INSERT INTO payments (application_id, provider, provider_payment_id, amount_kopecks, currency, status, payment_account_id)
       VALUES ($1, 'yookassa', $2, $3, 'RUB', $4, $5)
       RETURNING id`,
      [applicationId, yookassaPayment.id, amountKopecks, status, credentials.paymentAccountId],
    );

    const verifiedState = mapYookassaPaymentState(yookassaPayment);
    if (verifiedState !== 'pending') {
      const lifecycle = await applyVerifiedPaymentState(yookassaPayment.id, verifiedState);
      if (lifecycle?.pdfError) {
        request.log.error(lifecycle.pdfError, 'Automatic policy PDF generation failed');
      }
    }

    return reply.status(200).send({
      payment_id: insertResult.rows[0].id,
      confirmation_url: yookassaPayment.confirmation?.confirmation_url ?? null,
      status,
    });
  });

  // Fetches the live status from YooKassa, applies the same idempotent payment,
  // application, and policy lifecycle as the webhook, and returns the current status.
  app.get<{ Params: { id: string } }>('/api/payments/:id/status', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const result = await pool.query(
      `SELECT pay.id, pay.application_id, pay.provider, pay.provider_payment_id, pay.amount_kopecks,
              pay.currency, pay.status, pay.paid_at,
              pay.payment_account_id,
              a.person_id, a.federation_id AS access_federation_id, a.status AS application_status,
              ip.category AS access_category
       FROM payments pay
       JOIN applications a ON a.id = pay.application_id
       JOIN insurance_products ip ON ip.id = a.product_id
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
      category: row.access_category as string | null,
    });

    if (row.provider !== 'yookassa') {
      throw new BadRequestError('unsupported_provider');
    }

    const yookassaPayment = await fetchAndVerifyYookassaPayment(row);
    const lifecycle = await applyVerifiedPaymentState(
      row.provider_payment_id as string,
      mapYookassaPaymentState(yookassaPayment),
    );
    if (!lifecycle) {
      throw new NotFoundError('payment_not_found');
    }
    if (lifecycle.pdfError) {
      request.log.error(lifecycle.pdfError, 'Automatic policy PDF generation failed');
    }

    return reply.status(200).send({
      payment_id: lifecycle.paymentId,
      status: lifecycle.status,
      paid_at: lifecycle.paidAt,
    });
  });

  // YooKassa does not sign Basic Auth webhooks. Validate the notification shape, then
  // read the payment back from YooKassa with the exact payment_account_id credentials
  // used at creation time before applying any state. Duplicate delivery is safe.
  app.post<{ Body: unknown }>('/api/payments/yookassa/webhook', async (request, reply) => {
    const notification = parseWebhook(request.body);
    const paymentResult = await pool.query(
      `SELECT id, application_id, provider_payment_id, amount_kopecks, currency, payment_account_id
       FROM payments
       WHERE provider = 'yookassa' AND provider_payment_id = $1`,
      [notification.providerPaymentId],
    );
    const row = paymentResult.rows[0];
    if (!row) {
      throw new NotFoundError('payment_not_found');
    }

    const yookassaPayment = await fetchAndVerifyYookassaPayment(row);
    const verifiedState = mapYookassaPaymentState(yookassaPayment);
    if (notification.event === 'refund.succeeded' && verifiedState !== 'refunded') {
      throw new Error('yookassa_refund_not_confirmed');
    }
    const lifecycle = await applyVerifiedPaymentState(notification.providerPaymentId, verifiedState);
    if (!lifecycle) {
      throw new NotFoundError('payment_not_found');
    }
    if (lifecycle.pdfError) {
      request.log.error(lifecycle.pdfError, 'Automatic policy PDF generation failed');
    }

    return reply.status(200).send({ status: 'ok' });
  });
}
