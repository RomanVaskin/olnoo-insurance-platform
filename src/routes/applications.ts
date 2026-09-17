import type { FastifyInstance } from 'fastify';
import type { SessionAccount } from '../modules/auth/session';
import { pool } from '../db/pool';
import {
  authenticate,
  getAccessibleFederationIds,
  assertApplicationRecordAccess,
  isFinanceAllowed,
  AuthError,
} from '../modules/auth/guards';
import { getAccessibleCategories, requireCategoryManage } from '../modules/auth/insurance-access';
import { assertUuid, NotFoundError, BadRequestError, toNumber } from '../lib/api-helpers';
import { federationSummary, personSummary, productSummary } from '../lib/mappers';
import { getLatestPaymentForApplication, getPolicyForApplication } from '../lib/related-queries';

// Statuses in which the application is still "before payment" — the only window in
// which product/amount may change or the application may be cancelled (schema:
// applications.status CHECK IN ('draft','pending_payment','paid','policy_issued','cancelled')).
const EDITABLE_STATUSES = ['draft', 'pending_payment'];

const LIST_SELECT = `
  SELECT
    a.id, a.status, a.amount_kopecks, a.created_at, a.federation_id AS access_federation_id,
    p.id AS person_id, p.last_name AS person_last_name, p.first_name AS person_first_name, p.patronymic AS person_patronymic,
    f.id AS federation_id, f.name AS federation_name,
    ip.id AS product_id, ip.name AS product_name, ip.category AS access_category
  FROM applications a
  JOIN persons p ON p.id = a.person_id
  LEFT JOIN federations f ON f.id = a.federation_id
  JOIN insurance_products ip ON ip.id = a.product_id
`;

function mapApplicationRow(row: Record<string, unknown>, showAmount: boolean) {
  return {
    id: row.id,
    status: row.status,
    amount_kopecks: showAmount ? toNumber(row.amount_kopecks) : null,
    created_at: row.created_at,
    person: personSummary(row),
    federation: federationSummary(row),
    product: productSummary(row),
  };
}

/**
 * Write-access rule for the management endpoints below (PATCH, cancel, reopen):
 * super_admin unrestricted; 'admin' needs 'manage' permission on the application's
 * product category; federation_secretary/director are scoped to their own federation
 * (same operational access they already have for reading); athlete/guardian denied.
 * Distinct from assertApplicationRecordAccess (read access), which allows 'admin' with
 * only 'read' permission and lets an athlete read their own record.
 */
async function requireApplicationManageAccess(
  account: SessionAccount,
  record: { federationId: string | null; category: string | null },
): Promise<void> {
  if (account.role === 'super_admin') {
    return;
  }

  if (account.role === 'admin') {
    if (!record.category) {
      throw new AuthError(403, 'forbidden');
    }
    await requireCategoryManage(account, record.category);
    return;
  }

  if (account.role === 'federation_secretary' || account.role === 'federation_director') {
    const federationIds = await getAccessibleFederationIds(account);
    if (!record.federationId || !federationIds?.includes(record.federationId)) {
      throw new AuthError(403, 'forbidden');
    }
    return;
  }

  throw new AuthError(403, 'forbidden');
}

async function fetchApplicationRow(id: string): Promise<Record<string, unknown> | undefined> {
  const result = await pool.query(`${LIST_SELECT} WHERE a.id = $1`, [id]);
  return result.rows[0];
}

async function buildApplicationDetailResponse(row: Record<string, unknown>, account: SessionAccount) {
  const [payment, policy] = await Promise.all([
    getLatestPaymentForApplication(row.id as string),
    getPolicyForApplication(row.id as string),
  ]);

  // Finance-only data (the payment sub-object and the application's own
  // amount_kopecks): federation_secretary must never see it. Athletes need
  // it for their own checkout status/price.
  const showFinance = isFinanceAllowed(account.role) || account.role === 'athlete';

  return {
    ...mapApplicationRow(row, showFinance),
    payment: showFinance ? payment : null,
    policy,
  };
}

export async function applicationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/applications', async (request, reply) => {
    const account = await authenticate(request);

    // Athletes get their own applications only, never the federation-scoped
    // collection (getAccessibleFederationIds denies the athlete role outright).
    if (account.role === 'athlete') {
      if (!account.person_id) {
        return reply.status(200).send([]);
      }
      const result = await pool.query(
        `${LIST_SELECT} WHERE a.person_id = $1 ORDER BY a.created_at DESC`,
        [account.person_id],
      );
      return reply.status(200).send(result.rows.map((row) => mapApplicationRow(row, true)));
    }

    const federationIds = await getAccessibleFederationIds(account);
    const categories = await getAccessibleCategories(account);
    const showAmount = isFinanceAllowed(account.role);

    const result = await pool.query(
      `${LIST_SELECT}
       WHERE ($1::uuid[] IS NULL OR a.federation_id = ANY($1::uuid[]))
         AND ($2::text[] IS NULL OR ip.category = ANY($2::text[]))
       ORDER BY a.created_at DESC`,
      [federationIds, categories],
    );

    return reply.status(200).send(result.rows.map((row) => mapApplicationRow(row, showAmount)));
  });

  app.get<{ Params: { id: string } }>('/api/applications/:id', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const row = await fetchApplicationRow(request.params.id);
    if (!row) {
      throw new NotFoundError('application_not_found');
    }

    await assertApplicationRecordAccess(account, {
      federationId: row.access_federation_id as string | null,
      personId: row.person_id as string | null,
      category: row.access_category as string | null,
    });

    return reply.status(200).send(await buildApplicationDetailResponse(row, account));
  });

  // Athlete self-service creation: every value that determines cost or ownership
  // (person_id, federation_id, price) is derived server-side from the athlete's own
  // federation_products assignment — never accepted from the request body.
  app.post<{ Body: { product_id?: string } }>('/api/applications', async (request, reply) => {
    const account = await authenticate(request);

    if (account.role !== 'athlete') {
      throw new AuthError(403, 'forbidden');
    }
    if (!account.person_id) {
      throw new AuthError(403, 'forbidden');
    }

    const productId = request.body?.product_id;
    if (!productId) {
      throw new BadRequestError('product_id_required');
    }
    assertUuid(productId);

    const assignmentResult = await pool.query(
      `SELECT fp.id AS federation_product_id, fp.federation_id, fp.price_kopecks
       FROM federation_memberships fm
       JOIN federation_products fp ON fp.federation_id = fm.federation_id AND fp.active = true
       JOIN insurance_products ip ON ip.id = fp.product_id AND ip.status = 'active'
       WHERE fm.person_id = $1 AND fm.status = 'active' AND fp.product_id = $2`,
      [account.person_id, productId],
    );

    const assignment = assignmentResult.rows[0];
    if (!assignment) {
      throw new BadRequestError('product_not_available');
    }

    const insertResult = await pool.query(
      `INSERT INTO applications (person_id, federation_id, product_id, federation_product_id, status, amount_kopecks)
       VALUES ($1, $2, $3, $4, 'pending_payment', $5)
       RETURNING id, status, product_id, amount_kopecks`,
      [account.person_id, assignment.federation_id, productId, assignment.federation_product_id, assignment.price_kopecks],
    );

    const row = insertResult.rows[0];
    return reply.status(201).send({
      application_id: row.id,
      status: row.status,
      product_id: row.product_id,
      amount_kopecks: toNumber(row.amount_kopecks),
    });
  });

  // Management edit — the only field a caller may change directly. person_id,
  // federation_id and amount_kopecks are never accepted from the client: changing
  // product re-derives federation_product_id and amount_kopecks server-side from the
  // application's existing (fixed) federation's current active assignment for that
  // product, exactly like the athlete self-service POST above.
  app.patch<{ Params: { id: string }; Body: { product_id?: unknown } }>(
    '/api/applications/:id',
    async (request, reply) => {
      const account = await authenticate(request);
      assertUuid(request.params.id);

      const row = await fetchApplicationRow(request.params.id);
      if (!row) {
        throw new NotFoundError('application_not_found');
      }

      await requireApplicationManageAccess(account, {
        federationId: row.access_federation_id as string | null,
        category: row.access_category as string | null,
      });

      if (typeof request.body?.product_id !== 'string') {
        throw new BadRequestError('product_id_required');
      }
      const productId = request.body.product_id;
      assertUuid(productId);

      if (!EDITABLE_STATUSES.includes(row.status as string)) {
        throw new BadRequestError('application_not_editable');
      }

      // Defense in depth: a payment/policy should be impossible to reach while status
      // is still draft/pending_payment, but never trust status alone for something
      // this consequential — re-check directly before writing.
      const [existingPaidPayment, existingPolicy] = await Promise.all([
        pool.query(`SELECT 1 FROM payments WHERE application_id = $1 AND status = 'paid'`, [request.params.id]),
        getPolicyForApplication(request.params.id),
      ]);
      if ((existingPaidPayment.rowCount ?? 0) > 0 || existingPolicy) {
        throw new BadRequestError('application_not_editable');
      }

      const federationId = row.federation_id as string | null;
      if (!federationId) {
        throw new BadRequestError('product_change_requires_federation');
      }

      const productExists = await pool.query(`SELECT 1 FROM insurance_products WHERE id = $1`, [productId]);
      if (productExists.rowCount === 0) {
        throw new NotFoundError('product_not_found');
      }

      const assignmentResult = await pool.query(
        `SELECT fp.id AS federation_product_id, fp.price_kopecks
         FROM federation_products fp
         JOIN insurance_products ip ON ip.id = fp.product_id AND ip.status = 'active'
         WHERE fp.federation_id = $1 AND fp.product_id = $2 AND fp.active = true`,
        [federationId, productId],
      );
      const assignment = assignmentResult.rows[0];
      if (!assignment) {
        throw new BadRequestError('product_not_available_for_federation');
      }

      const updateResult = await pool.query(
        `UPDATE applications
         SET product_id = $1, federation_product_id = $2, amount_kopecks = $3, updated_at = now()
         WHERE id = $4 AND status = ANY($5::text[])
         RETURNING id`,
        [productId, assignment.federation_product_id, assignment.price_kopecks, request.params.id, EDITABLE_STATUSES],
      );
      if (updateResult.rowCount === 0) {
        // Status changed between the check above and this write (e.g. payment just
        // succeeded) — fail rather than silently applying a stale-state edit.
        throw new BadRequestError('application_not_editable');
      }

      const refreshed = await fetchApplicationRow(request.params.id);
      return reply.status(200).send(await buildApplicationDetailResponse(refreshed as Record<string, unknown>, account));
    },
  );

  // Cancels a draft/pending_payment application. Never reachable once paid or
  // policy-issued — the conditional WHERE below is the actual enforcement, not just
  // the pre-check, so a payment succeeding concurrently can't race past it.
  app.post<{ Params: { id: string } }>('/api/applications/:id/cancel', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const row = await fetchApplicationRow(request.params.id);
    if (!row) {
      throw new NotFoundError('application_not_found');
    }

    await requireApplicationManageAccess(account, {
      federationId: row.access_federation_id as string | null,
      category: row.access_category as string | null,
    });

    const updateResult = await pool.query(
      `UPDATE applications SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND status = ANY($2::text[])
       RETURNING id`,
      [request.params.id, EDITABLE_STATUSES],
    );
    if (updateResult.rowCount === 0) {
      throw new BadRequestError('invalid_transition');
    }

    const refreshed = await fetchApplicationRow(request.params.id);
    return reply.status(200).send(await buildApplicationDetailResponse(refreshed as Record<string, unknown>, account));
  });

  // Reopens a cancelled application back to pending_payment. Only ever reachable from
  // 'cancelled', and only cancel (above) can produce that status today, which itself
  // only fires from draft/pending_payment — so a paid payment or issued policy should
  // be structurally impossible here. Checked directly anyway before writing.
  app.post<{ Params: { id: string } }>('/api/applications/:id/reopen', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const row = await fetchApplicationRow(request.params.id);
    if (!row) {
      throw new NotFoundError('application_not_found');
    }

    await requireApplicationManageAccess(account, {
      federationId: row.access_federation_id as string | null,
      category: row.access_category as string | null,
    });

    const [existingPaidPayment, existingPolicy] = await Promise.all([
      pool.query(`SELECT 1 FROM payments WHERE application_id = $1 AND status = 'paid'`, [request.params.id]),
      getPolicyForApplication(request.params.id),
    ]);
    if ((existingPaidPayment.rowCount ?? 0) > 0 || existingPolicy) {
      throw new BadRequestError('invalid_transition');
    }

    const updateResult = await pool.query(
      `UPDATE applications SET status = 'pending_payment', updated_at = now()
       WHERE id = $1 AND status = 'cancelled'
       RETURNING id`,
      [request.params.id],
    );
    if (updateResult.rowCount === 0) {
      throw new BadRequestError('invalid_transition');
    }

    const refreshed = await fetchApplicationRow(request.params.id);
    return reply.status(200).send(await buildApplicationDetailResponse(refreshed as Record<string, unknown>, account));
  });
}
