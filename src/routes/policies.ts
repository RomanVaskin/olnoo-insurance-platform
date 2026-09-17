import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds, isFinanceAllowed } from '../modules/auth/guards';
import { getAccessibleCategories, requireCategoryManage } from '../modules/auth/insurance-access';
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
    ip.id AS product_id, ip.name AS product_name, ip.category AS access_category
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

/**
 * Same access rule as GET /api/policies/:id, shared with the PDF generate/download
 * routes. 'admin' is scoped by insurance type instead of federation — pass the
 * policy's product category for that branch to work.
 */
async function assertPolicyAccess(
  account: SessionAccount,
  accessFederationId: string | null,
  category?: string | null,
): Promise<void> {
  if (account.role === 'super_admin') {
    return;
  }
  if (account.role === 'admin') {
    const categories = await getAccessibleCategories(account);
    if (categories !== null && (!category || !categories.includes(category))) {
      throw new HttpError(403, 'forbidden');
    }
    return;
  }
  const federationIds = await getAccessibleFederationIds(account);
  if (!accessFederationId || !federationIds?.includes(accessFederationId)) {
    throw new HttpError(403, 'forbidden');
  }
}

/**
 * Write-access rule for policy management (PATCH policy_number, cancel, reactivate,
 * expire): super_admin unrestricted; 'admin' needs 'manage' permission on the policy's
 * product category (not just 'read'); federation_secretary/director scoped to their own
 * federation (same operational access they already have for reading/generating PDFs);
 * athlete/guardian denied. Mirrors requireApplicationManageAccess in applications.ts.
 */
async function requirePolicyManageAccess(
  account: SessionAccount,
  record: { federationId: string | null; category: string | null },
): Promise<void> {
  if (account.role === 'super_admin') {
    return;
  }
  if (account.role === 'admin') {
    if (!record.category) {
      throw new HttpError(403, 'forbidden');
    }
    await requireCategoryManage(account, record.category);
    return;
  }
  if (account.role === 'federation_secretary' || account.role === 'federation_director') {
    const federationIds = await getAccessibleFederationIds(account);
    if (!record.federationId || !federationIds?.includes(record.federationId)) {
      throw new HttpError(403, 'forbidden');
    }
    return;
  }
  throw new HttpError(403, 'forbidden');
}

async function fetchPolicyRow(id: string): Promise<Record<string, unknown> | undefined> {
  const result = await pool.query(`${LIST_SELECT} WHERE pol.id = $1`, [id]);
  return result.rows[0];
}

async function buildPolicyDetailResponse(row: Record<string, unknown>, account: SessionAccount) {
  const applicationResult = await pool.query(
    `SELECT id, status, amount_kopecks, created_at FROM applications WHERE id = $1`,
    [row.application_id],
  );
  const applicationRow = applicationResult.rows[0];
  const application = applicationRow
    ? {
        id: applicationRow.id,
        status: applicationRow.status,
        amount_kopecks: isFinanceAllowed(account.role) ? toNumber(applicationRow.amount_kopecks) : null,
        created_at: applicationRow.created_at,
      }
    : null;

  const payment = isFinanceAllowed(account.role)
    ? await getLatestPaymentForApplication(row.application_id as string)
    : null;

  // The payment sub-object is finance-only data: federation_secretary must never see it.
  const showPayment = isFinanceAllowed(account.role);

  return {
    ...mapPolicyRow(row),
    application,
    payment: showPayment ? payment : null,
  };
}

/** Translates a Postgres unique_violation (policy_number) into the route's 400 contract. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

function assertEmptyActionBody(body: unknown): void {
  if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0)) {
    throw new BadRequestError('invalid_fields');
  }
}

export async function policiesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/policies', async (request, reply) => {
    const account = await authenticate(request);
    const federationIds = await getAccessibleFederationIds(account);
    const categories = await getAccessibleCategories(account);

    const result = await pool.query(
      `${LIST_SELECT}
       WHERE ($1::uuid[] IS NULL OR pol.federation_id = ANY($1::uuid[]))
         AND ($2::text[] IS NULL OR ip.category = ANY($2::text[]))
       ORDER BY pol.valid_from DESC`,
      [federationIds, categories],
    );

    return reply.status(200).send(result.rows.map(mapPolicyRow));
  });

  app.get<{ Params: { id: string } }>('/api/policies/:id', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const row = await fetchPolicyRow(request.params.id);
    if (!row) {
      throw new NotFoundError('policy_not_found');
    }

    await assertPolicyAccess(account, row.access_federation_id as string | null, row.access_category as string | null);

    return reply.status(200).send(await buildPolicyDetailResponse(row, account));
  });

  // Generates (or regenerates — same endpoint, reused rather than adding a duplicate
  // /regenerate-pdf) the policy PDF from current platform data and records it as
  // policies.policy_url. This is a write action, so it uses requirePolicyManageAccess
  // (admin needs 'manage', not just 'read') rather than the read-only assertPolicyAccess.
  app.post<{ Params: { id: string } }>('/api/policies/:id/generate-pdf', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const row = await fetchPolicyRow(request.params.id);
    if (!row) {
      throw new NotFoundError('policy_not_found');
    }
    await requirePolicyManageAccess(account, {
      federationId: row.access_federation_id as string | null,
      category: row.access_category as string | null,
    });

    assertEmptyActionBody(request.body);
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

  // Number correction is limited to active, unexpired records before payment,
  // issuance or PDF generation. Issued documents are immutable here.
  app.patch<{ Params: { id: string }; Body: { policy_number?: unknown } }>(
    '/api/policies/:id',
    async (request, reply) => {
      const account = await authenticate(request);
      assertUuid(request.params.id);

      const row = await fetchPolicyRow(request.params.id);
      if (!row) {
        throw new NotFoundError('policy_not_found');
      }
      await requirePolicyManageAccess(account, {
        federationId: row.access_federation_id as string | null,
        category: row.access_category as string | null,
      });

      if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body) ||
          Object.keys(request.body).some((key) => key !== 'policy_number')) {
        throw new BadRequestError('invalid_fields');
      }
      if (typeof request.body?.policy_number !== 'string' || request.body.policy_number.trim().length === 0) {
        throw new BadRequestError('policy_number_required');
      }
      const policyNumber = request.body.policy_number.trim();
      if (policyNumber.length > 200 || /[\x00-\x1f\x7f]/.test(policyNumber)) {
        throw new BadRequestError('invalid_policy_number');
      }

      if (row.status !== 'active') {
        throw new BadRequestError('policy_not_editable');
      }

      let updated;
      try {
        const result = await pool.query(
          `UPDATE policies pol SET policy_number = $1, updated_at = now()
           WHERE pol.id = $2 AND pol.status = 'active' AND pol.valid_to >= current_date
             AND pol.policy_url IS NULL
             AND EXISTS (SELECT 1 FROM applications a WHERE a.id = pol.application_id
                         AND a.status IN ('draft', 'pending_payment'))
             AND NOT EXISTS (SELECT 1 FROM payments pay WHERE pay.application_id = pol.application_id
                             AND (pay.status IN ('paid', 'refunded') OR pay.paid_at IS NOT NULL))
           RETURNING pol.id`,
          [policyNumber, request.params.id],
        );
        updated = result.rows[0];
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new BadRequestError('policy_number_taken');
        }
        throw error;
      }
      if (!updated) {
        // Status changed between the read above and this write — fail rather than
        // silently applying a stale-state edit.
        throw new BadRequestError('policy_not_editable');
      }

      const refreshed = await fetchPolicyRow(request.params.id);
      return reply.status(200).send(await buildPolicyDetailResponse(refreshed as Record<string, unknown>, account));
    },
  );

  // Cancels an active policy. Cancelling never deletes or overwrites any other field
  // (policy_number, dates, PDF) — the record and its history stay intact and inspectable.
  app.post<{ Params: { id: string } }>('/api/policies/:id/cancel', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const row = await fetchPolicyRow(request.params.id);
    if (!row) {
      throw new NotFoundError('policy_not_found');
    }
    await requirePolicyManageAccess(account, {
      federationId: row.access_federation_id as string | null,
      category: row.access_category as string | null,
    });

    assertEmptyActionBody(request.body);
    const result = await pool.query(
      `UPDATE policies SET status = 'cancelled', updated_at = now() WHERE id = $1 AND status = 'active' RETURNING id`,
      [request.params.id],
    );
    if (result.rowCount === 0) {
      throw new BadRequestError('invalid_transition');
    }

    const refreshed = await fetchPolicyRow(request.params.id);
    return reply.status(200).send(await buildPolicyDetailResponse(refreshed as Record<string, unknown>, account));
  });

  // Reactivates a cancelled policy — only while its coverage term hasn't already
  // lapsed (valid_to in the past). An expired term needs a new application/policy,
  // not a reactivated old one.
  app.post<{ Params: { id: string } }>('/api/policies/:id/reactivate', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const row = await fetchPolicyRow(request.params.id);
    if (!row) {
      throw new NotFoundError('policy_not_found');
    }
    await requirePolicyManageAccess(account, {
      federationId: row.access_federation_id as string | null,
      category: row.access_category as string | null,
    });

    assertEmptyActionBody(request.body);
    const result = await pool.query(
      `UPDATE policies SET status = 'active', updated_at = now()
       WHERE id = $1 AND status = 'cancelled' AND valid_to >= current_date
         AND EXISTS (SELECT 1 FROM applications a WHERE a.id = policies.application_id AND a.status <> 'cancelled')
         AND NOT EXISTS (SELECT 1 FROM payments pay WHERE pay.application_id = policies.application_id AND pay.status = 'refunded')
       RETURNING id`,
      [request.params.id],
    );
    if (result.rowCount === 0) {
      throw new BadRequestError('invalid_transition');
    }

    const refreshed = await fetchPolicyRow(request.params.id);
    return reply.status(200).send(await buildPolicyDetailResponse(refreshed as Record<string, unknown>, account));
  });

  // Marks an active policy expired — only once its coverage term has actually
  // lapsed (the day after valid_to). Terminal: nothing transitions out of 'expired'.
  app.post<{ Params: { id: string } }>('/api/policies/:id/expire', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const row = await fetchPolicyRow(request.params.id);
    if (!row) {
      throw new NotFoundError('policy_not_found');
    }
    await requirePolicyManageAccess(account, {
      federationId: row.access_federation_id as string | null,
      category: row.access_category as string | null,
    });

    assertEmptyActionBody(request.body);
    const result = await pool.query(
      `UPDATE policies SET status = 'expired', updated_at = now()
       WHERE id = $1 AND status = 'active' AND valid_to < current_date
       RETURNING id`,
      [request.params.id],
    );
    if (result.rowCount === 0) {
      throw new BadRequestError('invalid_transition');
    }

    const refreshed = await fetchPolicyRow(request.params.id);
    return reply.status(200).send(await buildPolicyDetailResponse(refreshed as Record<string, unknown>, account));
  });

  // Streams the privately stored policy PDF back to an authorized caller. The
  // file never has a public/static URL — this authenticated route is the only
  // access path (same pattern as GET /api/documents/:id/file).
  app.get<{ Params: { id: string } }>('/api/policies/:id/pdf', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const result = await pool.query(
      `SELECT pol.policy_number, pol.policy_url, pol.federation_id AS access_federation_id, ip.category AS access_category
       FROM policies pol JOIN insurance_products ip ON ip.id = pol.product_id
       WHERE pol.id = $1`,
      [request.params.id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError('policy_not_found');
    }
    await assertPolicyAccess(account, row.access_federation_id as string | null, row.access_category as string | null);

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
    reply.header('Content-Disposition', `attachment; filename="policy${path.extname(storedFilename)}"; filename*=UTF-8''${encodeURIComponent(String(row.policy_number) + path.extname(storedFilename)).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`);
    return reply.send(createReadStream(filePath));
  });
}
