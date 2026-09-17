import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds, isFinanceAllowed } from '../modules/auth/guards';
import type { SessionAccount } from '../modules/auth/session';
import { assertUuid, NotFoundError, HttpError, BadRequestError, toNumber } from '../lib/api-helpers';
import { federationSummary, personSummary, productSummary } from '../lib/mappers';
import { getLatestPaymentForApplication } from '../lib/related-queries';
import { generatePolicyPdf, PolicyGenerationDataError, UnsupportedInsurerError } from '../modules/policy-generator/generator';
import { policyPdfFilePath } from '../modules/policy-generator/storage';

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

/** Same access rule as GET /api/policies/:id, shared with the PDF generate/download routes. */
async function assertPolicyAccess(account: SessionAccount, accessFederationId: string | null): Promise<void> {
  if (account.role === 'super_admin') {
    return;
  }
  const federationIds = await getAccessibleFederationIds(account);
  if (!accessFederationId || !federationIds?.includes(accessFederationId)) {
    throw new HttpError(403, 'forbidden');
  }
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

    await assertPolicyAccess(account, row.access_federation_id as string | null);

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

    // The payment sub-object is finance-only data (amount, provider_payment_id,
    // paid_at): federation_secretary must never see it. assertPolicyAccess above
    // already excludes athletes from this route, so only staff roles reach here.
    const showPayment = isFinanceAllowed(account.role);

    return reply.status(200).send({
      ...mapPolicyRow(row),
      application,
      payment: showPayment ? payment : null,
    });
  });

  // Generates (or regenerates) the policy PDF from current platform data and
  // records it as policies.policy_url. Written by staff roles (super_admin /
  // federation_secretary / federation_director scoped to their federation) —
  // same access rule as reading the policy.
  app.post<{ Params: { id: string } }>('/api/policies/:id/generate-pdf', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const accessResult = await pool.query(
      `SELECT federation_id AS access_federation_id FROM policies WHERE id = $1`,
      [request.params.id],
    );
    const accessRow = accessResult.rows[0];
    if (!accessRow) {
      throw new NotFoundError('policy_not_found');
    }
    await assertPolicyAccess(account, accessRow.access_federation_id as string | null);

    try {
      const result = await generatePolicyPdf(request.params.id);
      return reply.status(200).send({ policy_id: result.policyId, insurer: result.insurer, policy_url: result.policyUrl });
    } catch (error) {
      if (error instanceof PolicyGenerationDataError) {
        throw new NotFoundError(error.message);
      }
      if (error instanceof UnsupportedInsurerError) {
        throw new BadRequestError('unsupported_insurer');
      }
      throw error;
    }
  });

  // Streams the privately stored policy PDF back to an authorized caller. The
  // file never has a public/static URL — this authenticated route is the only
  // access path (same pattern as GET /api/documents/:id/file).
  app.get<{ Params: { id: string } }>('/api/policies/:id/pdf', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const result = await pool.query(
      `SELECT policy_number, policy_url, federation_id AS access_federation_id FROM policies WHERE id = $1`,
      [request.params.id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError('policy_not_found');
    }
    await assertPolicyAccess(account, row.access_federation_id as string | null);

    const storedFilename = row.policy_url as string | null;
    if (!storedFilename) {
      throw new NotFoundError('policy_pdf_not_generated');
    }

    const filePath = policyPdfFilePath(storedFilename);
    try {
      await stat(filePath);
    } catch {
      throw new NotFoundError('policy_pdf_file_not_found');
    }

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${row.policy_number}${path.extname(storedFilename)}"`);
    return reply.send(createReadStream(filePath));
  });
}
