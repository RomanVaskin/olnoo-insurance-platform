import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import {
  authenticate,
  getAccessibleFederationIds,
  isFinanceAllowed,
  requireFederationMembership,
} from '../modules/auth/guards';
import {
  getAccessibleCategories,
  requireSportAccess,
  requireSportManage,
} from '../modules/auth/insurance-access';
import { assertUuid, BadRequestError, NotFoundError, toNumber } from '../lib/api-helpers';

// $2::text[] is the caller's accessible insurance types (NULL = unrestricted); only
// 'admin' ever passes a non-null value here — everyone else's financial aggregates are
// federation-scoped only, unaffected by category.
const LIST_SELECT = `
  SELECT
    f.id, f.name, f.slug, f.status,
    (SELECT count(*) FROM federation_memberships fm WHERE fm.federation_id = f.id) AS athlete_count,
    (SELECT count(*) FROM policies pol JOIN insurance_products ip ON ip.id = pol.product_id
       WHERE pol.federation_id = f.id AND ($2::text[] IS NULL OR ip.category = ANY($2::text[]))) AS policy_count,
    (SELECT COALESCE(sum(pay.amount_kopecks), 0) FROM payments pay
       JOIN applications a ON a.id = pay.application_id
       JOIN insurance_products ip ON ip.id = a.product_id
       WHERE a.federation_id = f.id AND pay.status = 'paid'
         AND ($2::text[] IS NULL OR ip.category = ANY($2::text[]))) AS paid_amount_kopecks
  FROM federations f
`;

// federations.status has no DB CHECK constraint, but the admin UI (FederationStatusBadge)
// only renders these two values — writes are restricted to them to keep data consistent.
const STATUS_VALUES = ['active', 'inactive'];

// Mirrors the slug format already used by seeded/production federations (lowercase,
// hyphen-separated). federations.slug has no DB format constraint of its own, only
// NOT NULL + UNIQUE, so this is an input-hygiene guard, not an invented DB rule.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function mapFederation(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    status: row.status as string,
  };
}

function assertFederationName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError('name_required');
  }
  return value.trim();
}

function assertFederationSlug(value: unknown): string {
  if (typeof value !== 'string' || !SLUG_RE.test(value)) {
    throw new BadRequestError('invalid_slug');
  }
  return value;
}

function assertFederationStatus(value: unknown): string {
  if (typeof value !== 'string' || !STATUS_VALUES.includes(value)) {
    throw new BadRequestError('invalid_status');
  }
  return value;
}

/** Translates a Postgres unique_violation (slug) into the route's 400 contract. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

export async function federationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/federations', async (request, reply) => {
    const account = await authenticate(request);
    const categories = await getAccessibleCategories(account);
    // Federations are a sport-domain entity. Only sport admins may browse the
    // global federation directory, and product assignment is not a prerequisite.
    if (account.role === 'admin') await requireSportAccess(account);
    const federationIds = account.role === 'admin' ? null : await getAccessibleFederationIds(account);
    const showFinance = isFinanceAllowed(account.role);

    const result = await pool.query(
      `${LIST_SELECT}
       WHERE ($1::uuid[] IS NULL OR f.id = ANY($1::uuid[]))
       ORDER BY f.name`,
      [federationIds, categories],
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

    // Throws 403 if the account is not super_admin/admin and not a member of this federation.
    const membershipRole = await requireFederationMembership(account, federationId);
    const showFinance = account.role === 'super_admin' || account.role === 'admin' || membershipRole === 'director';
    const categories = await getAccessibleCategories(account);

    if (account.role === 'admin') await requireSportAccess(account);

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
         WHERE fp.federation_id = $1 AND ($2::text[] IS NULL OR ip.category = ANY($2::text[]))
         ORDER BY fp.created_at DESC`,
        [federationId, categories],
      ),
      pool.query(`SELECT count(*) AS athlete_count FROM federation_memberships WHERE federation_id = $1`, [
        federationId,
      ]),
      pool.query(
        `SELECT
           (SELECT count(*) FROM applications a JOIN insurance_products ip ON ip.id = a.product_id
              WHERE a.federation_id = $1 AND ($2::text[] IS NULL OR ip.category = ANY($2::text[]))) AS application_count,
           (SELECT count(*) FROM policies pol JOIN insurance_products ip ON ip.id = pol.product_id
              WHERE pol.federation_id = $1 AND ($2::text[] IS NULL OR ip.category = ANY($2::text[]))) AS policy_count,
           (SELECT COALESCE(sum(pay.amount_kopecks), 0) FROM payments pay
              JOIN applications a ON a.id = pay.application_id
              JOIN insurance_products ip ON ip.id = a.product_id
              WHERE a.federation_id = $1 AND pay.status = 'paid'
                AND ($2::text[] IS NULL OR ip.category = ANY($2::text[]))) AS paid_amount_kopecks`,
        [federationId, categories],
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

  app.post<{ Body: { name?: unknown; slug?: unknown; status?: unknown } }>(
    '/api/federations',
    async (request, reply) => {
      const account = await authenticate(request);
      await requireSportManage(account);

      const body = request.body ?? {};
      const name = assertFederationName(body.name);
      const slug = assertFederationSlug(body.slug);
      const status = body.status === undefined ? 'active' : assertFederationStatus(body.status);

      let federation;
      try {
        const result = await pool.query(
          `INSERT INTO federations (name, slug, status) VALUES ($1, $2, $3)
           RETURNING id, name, slug, status`,
          [name, slug, status],
        );
        federation = result.rows[0];
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new BadRequestError('slug_taken');
        }
        throw error;
      }

      return reply.status(201).send(mapFederation(federation));
    },
  );

  app.patch<{ Params: { id: string }; Body: { name?: unknown; slug?: unknown; status?: unknown } }>(
    '/api/federations/:id',
    async (request, reply) => {
      const account = await authenticate(request);
      assertUuid(request.params.id);
      if (account.role !== 'super_admin') await requireSportManage(account);

      const body = request.body ?? {};
      const updates: string[] = [];
      const values: unknown[] = [];

      if (body.name !== undefined) {
        values.push(assertFederationName(body.name));
        updates.push(`name = $${values.length}`);
      }
      if (body.slug !== undefined) {
        values.push(assertFederationSlug(body.slug));
        updates.push(`slug = $${values.length}`);
      }
      if (body.status !== undefined) {
        values.push(assertFederationStatus(body.status));
        updates.push(`status = $${values.length}`);
      }

      if (updates.length === 0) {
        throw new BadRequestError('no_fields_to_update');
      }

      values.push(request.params.id);

      let federation;
      try {
        const result = await pool.query(
          `UPDATE federations SET ${updates.join(', ')}, updated_at = now()
           WHERE id = $${values.length}
           RETURNING id, name, slug, status`,
          values,
        );
        federation = result.rows[0];
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new BadRequestError('slug_taken');
        }
        throw error;
      }

      if (!federation) {
        throw new NotFoundError('federation_not_found');
      }

      // id is never part of `updates` above — the WHERE clause pins the row by
      // its existing id, so it is preserved by construction.
      return reply.status(200).send(mapFederation(federation));
    },
  );
}
