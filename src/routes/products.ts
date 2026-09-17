import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds, AuthError } from '../modules/auth/guards';
import { getAccessibleCategories, requireCategoryManage } from '../modules/auth/insurance-access';
import { assertUuid, BadRequestError, NotFoundError, toNumber, toNullableNumber } from '../lib/api-helpers';

const LIST_SELECT = `
  SELECT id, name, category, insurer_name, coverage_amount_kopecks, validity_days,
         base_price_kopecks, status
  FROM insurance_products
`;

// insurance_products.category has no DB CHECK constraint, but this is the documented
// set of verticals the platform supports (DATABASE.md's insurance_categories list) —
// writes are restricted to it to keep the catalog consistent.
const CATEGORY_VALUES = ['sport', 'travel', 'health', 'auto', 'property', 'business'];

// insurance_products.status has no DB CHECK constraint, but the admin UI
// (ProductStatusBadge) only renders these two values.
const STATUS_VALUES = ['active', 'inactive'];

function mapProductRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    insurer_name: row.insurer_name,
    coverage_amount_kopecks: toNullableNumber(row.coverage_amount_kopecks),
    validity_days: toNumber(row.validity_days),
    base_price_kopecks: toNumber(row.base_price_kopecks),
    status: row.status,
  };
}

function assertProductName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError('name_required');
  }
  return value.trim();
}

function assertProductCategory(value: unknown): string {
  if (typeof value !== 'string' || !CATEGORY_VALUES.includes(value)) {
    throw new BadRequestError('invalid_category');
  }
  return value;
}

function assertProductStatus(value: unknown): string {
  if (typeof value !== 'string' || !STATUS_VALUES.includes(value)) {
    throw new BadRequestError('invalid_status');
  }
  return value;
}

/** insurer_name is nullable — an explicit `null` clears it, a non-empty string sets it. */
function assertInsurerName(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError('invalid_insurer_name');
  }
  return value.trim();
}

function assertPositiveInt(value: unknown, code: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestError(code);
  }
  return value;
}

function assertNonNegativeInt(value: unknown, code: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new BadRequestError(code);
  }
  return value;
}

/** coverage_amount_kopecks is nullable — an explicit `null` clears it. */
function assertNullableNonNegativeInt(value: unknown, code: string): number | null {
  if (value === null) {
    return null;
  }
  return assertNonNegativeInt(value, code);
}

function assertBoolean(value: unknown, code: string): boolean {
  if (typeof value !== 'boolean') {
    throw new BadRequestError(code);
  }
  return value;
}

/** Translates a Postgres unique_violation into the route's 400 contract. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

export async function productsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/products', async (request, reply) => {
    const account = await authenticate(request);
    // Products aren't federation-owned, but this still excludes roles (athlete, guardian)
    // that have no business browsing the admin catalog, consistent with the other list routes.
    await getAccessibleFederationIds(account);
    // 'admin' only sees products within its assigned insurance types; everyone else unrestricted.
    const categories = await getAccessibleCategories(account);

    const result = await pool.query(
      `${LIST_SELECT} WHERE ($1::text[] IS NULL OR category = ANY($1::text[])) ORDER BY name`,
      [categories],
    );
    return reply.status(200).send(result.rows.map(mapProductRow));
  });

  app.get<{ Params: { id: string } }>('/api/products/:id', async (request, reply) => {
    const account = await authenticate(request);
    const federationIds = await getAccessibleFederationIds(account);
    const categories = await getAccessibleCategories(account);
    assertUuid(request.params.id);

    const productResult = await pool.query(`${LIST_SELECT} WHERE id = $1`, [request.params.id]);
    const product = productResult.rows[0];
    if (!product) {
      throw new NotFoundError('product_not_found');
    }

    if (categories !== null && !categories.includes(product.category as string)) {
      throw new AuthError(403, 'forbidden');
    }

    const assignmentsResult = await pool.query(
      `SELECT fp.id AS assignment_id, fp.price_kopecks, fp.active,
              f.id AS federation_id, f.name AS federation_name
       FROM federation_products fp
       JOIN federations f ON f.id = fp.federation_id
       WHERE fp.product_id = $1 AND ($2::uuid[] IS NULL OR fp.federation_id = ANY($2::uuid[]))
       ORDER BY f.name`,
      [request.params.id, federationIds],
    );

    return reply.status(200).send({
      ...mapProductRow(product),
      federation_assignments: assignmentsResult.rows.map((row) => ({
        id: row.assignment_id,
        federation: { id: row.federation_id, name: row.federation_name },
        price_kopecks: toNumber(row.price_kopecks),
        active: row.active,
      })),
    });
  });

  app.post<{
    Body: {
      name?: unknown;
      category?: unknown;
      insurer_name?: unknown;
      coverage_amount_kopecks?: unknown;
      validity_days?: unknown;
      base_price_kopecks?: unknown;
      status?: unknown;
    };
  }>('/api/products', async (request, reply) => {
    const account = await authenticate(request);

    const body = request.body ?? {};
    const name = assertProductName(body.name);
    const category = assertProductCategory(body.category);
    // super_admin always passes; 'admin' needs 'manage' on this specific category;
    // every other role (federation staff, athlete) is denied.
    await requireCategoryManage(account, category);
    const insurerName = body.insurer_name === undefined ? null : assertInsurerName(body.insurer_name);
    const coverageAmount =
      body.coverage_amount_kopecks === undefined
        ? null
        : assertNullableNonNegativeInt(body.coverage_amount_kopecks, 'invalid_coverage_amount_kopecks');
    const validityDays = assertPositiveInt(body.validity_days, 'invalid_validity_days');
    const basePrice = assertNonNegativeInt(body.base_price_kopecks, 'invalid_base_price_kopecks');
    const status = body.status === undefined ? 'active' : assertProductStatus(body.status);

    const result = await pool.query(
      `INSERT INTO insurance_products
         (name, category, insurer_name, coverage_amount_kopecks, validity_days, base_price_kopecks, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, category, insurer_name, coverage_amount_kopecks, validity_days, base_price_kopecks, status`,
      [name, category, insurerName, coverageAmount, validityDays, basePrice, status],
    );

    return reply.status(201).send(mapProductRow(result.rows[0]));
  });

  app.patch<{
    Params: { id: string };
    Body: {
      name?: unknown;
      category?: unknown;
      insurer_name?: unknown;
      coverage_amount_kopecks?: unknown;
      validity_days?: unknown;
      base_price_kopecks?: unknown;
      status?: unknown;
    };
  }>('/api/products/:id', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const existingResult = await pool.query<{ category: string }>(`SELECT category FROM insurance_products WHERE id = $1`, [
      request.params.id,
    ]);
    const existingProduct = existingResult.rows[0];
    if (!existingProduct) {
      throw new NotFoundError('product_not_found');
    }
    // Manage access on the product's *current* category is always required.
    await requireCategoryManage(account, existingProduct.category);

    const body = request.body ?? {};
    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) {
      values.push(assertProductName(body.name));
      updates.push(`name = $${values.length}`);
    }
    if (body.category !== undefined) {
      const newCategory = assertProductCategory(body.category);
      if (newCategory !== existingProduct.category) {
        // Also require manage access on the *new* category — an admin must not be able
        // to move a product into a category they don't manage (or out of one they do).
        await requireCategoryManage(account, newCategory);
      }
      values.push(newCategory);
      updates.push(`category = $${values.length}`);
    }
    if (body.insurer_name !== undefined) {
      values.push(assertInsurerName(body.insurer_name));
      updates.push(`insurer_name = $${values.length}`);
    }
    if (body.coverage_amount_kopecks !== undefined) {
      values.push(assertNullableNonNegativeInt(body.coverage_amount_kopecks, 'invalid_coverage_amount_kopecks'));
      updates.push(`coverage_amount_kopecks = $${values.length}`);
    }
    if (body.validity_days !== undefined) {
      values.push(assertPositiveInt(body.validity_days, 'invalid_validity_days'));
      updates.push(`validity_days = $${values.length}`);
    }
    if (body.base_price_kopecks !== undefined) {
      values.push(assertNonNegativeInt(body.base_price_kopecks, 'invalid_base_price_kopecks'));
      updates.push(`base_price_kopecks = $${values.length}`);
    }
    if (body.status !== undefined) {
      values.push(assertProductStatus(body.status));
      updates.push(`status = $${values.length}`);
    }

    if (updates.length === 0) {
      throw new BadRequestError('no_fields_to_update');
    }

    values.push(request.params.id);

    const result = await pool.query(
      `UPDATE insurance_products SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${values.length}
       RETURNING id, name, category, insurer_name, coverage_amount_kopecks, validity_days, base_price_kopecks, status`,
      values,
    );

    // id is never part of `updates` above — the WHERE clause pins the row by its
    // existing id, so it is preserved by construction.
    const product = result.rows[0];
    if (!product) {
      throw new NotFoundError('product_not_found');
    }

    return reply.status(200).send(mapProductRow(product));
  });

  // Assigns a product to a federation with a federation-specific price. The DB enforces
  // (via uq_federation_products_one_active_per_federation) that a federation can have at
  // most one *active* federation_products row at a time, across all products — attempting
  // to add a second active assignment for the same federation is a 400, not a 500.
  app.post<{
    Params: { id: string };
    Body: { federation_id?: unknown; price_kopecks?: unknown; active?: unknown };
  }>('/api/products/:id/federations', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const productId = request.params.id;
    const productResult = await pool.query<{ category: string }>(`SELECT category FROM insurance_products WHERE id = $1`, [
      productId,
    ]);
    const productRow = productResult.rows[0];
    if (!productRow) {
      throw new NotFoundError('product_not_found');
    }
    await requireCategoryManage(account, productRow.category);

    const body = request.body ?? {};
    if (typeof body.federation_id !== 'string') {
      throw new BadRequestError('federation_id_required');
    }
    assertUuid(body.federation_id);
    const federationId = body.federation_id;

    const federationExists = await pool.query(`SELECT 1 FROM federations WHERE id = $1`, [federationId]);
    if (federationExists.rowCount === 0) {
      throw new NotFoundError('federation_not_found');
    }

    const priceKopecks = assertNonNegativeInt(body.price_kopecks, 'invalid_price_kopecks');
    const active = body.active === undefined ? true : assertBoolean(body.active, 'invalid_active');

    let assignmentId: string;
    try {
      const insertResult = await pool.query(
        `INSERT INTO federation_products (federation_id, product_id, price_kopecks, active)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [federationId, productId, priceKopecks, active],
      );
      assignmentId = insertResult.rows[0].id;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BadRequestError('federation_already_has_active_product');
      }
      throw error;
    }

    const assignmentResult = await pool.query(
      `SELECT fp.id, fp.price_kopecks, fp.active, f.id AS federation_id, f.name AS federation_name
       FROM federation_products fp
       JOIN federations f ON f.id = fp.federation_id
       WHERE fp.id = $1`,
      [assignmentId],
    );
    const row = assignmentResult.rows[0];

    return reply.status(201).send({
      id: row.id,
      federation: { id: row.federation_id, name: row.federation_name },
      price_kopecks: toNumber(row.price_kopecks),
      active: row.active,
    });
  });

  // Updates the price and/or active flag of the (product, federation) assignment. Targets
  // the most recently created matching row — in practice there is at most one, since a new
  // active assignment for the same federation is blocked by the DB constraint above.
  app.patch<{
    Params: { id: string; federationId: string };
    Body: { price_kopecks?: unknown; active?: unknown };
  }>('/api/products/:id/federations/:federationId', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);
    assertUuid(request.params.federationId);

    const productResult = await pool.query<{ category: string }>(`SELECT category FROM insurance_products WHERE id = $1`, [
      request.params.id,
    ]);
    const productRow = productResult.rows[0];
    if (!productRow) {
      throw new NotFoundError('product_not_found');
    }
    await requireCategoryManage(account, productRow.category);

    const body = request.body ?? {};
    const priceKopecks =
      body.price_kopecks === undefined ? null : assertNonNegativeInt(body.price_kopecks, 'invalid_price_kopecks');
    const active = body.active === undefined ? null : assertBoolean(body.active, 'invalid_active');

    if (priceKopecks === null && active === null) {
      throw new BadRequestError('no_fields_to_update');
    }

    let assignment;
    try {
      const result = await pool.query(
        `UPDATE federation_products
         SET price_kopecks = COALESCE($1, price_kopecks),
             active = COALESCE($2, active),
             updated_at = now()
         WHERE id = (
           SELECT id FROM federation_products
           WHERE product_id = $3 AND federation_id = $4
           ORDER BY created_at DESC LIMIT 1
         )
         RETURNING id, price_kopecks, active, federation_id`,
        [priceKopecks, active, request.params.id, request.params.federationId],
      );
      assignment = result.rows[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BadRequestError('federation_already_has_active_product');
      }
      throw error;
    }

    if (!assignment) {
      throw new NotFoundError('assignment_not_found');
    }

    const federationResult = await pool.query(`SELECT id, name FROM federations WHERE id = $1`, [
      assignment.federation_id,
    ]);

    return reply.status(200).send({
      id: assignment.id,
      federation: { id: federationResult.rows[0].id, name: federationResult.rows[0].name },
      price_kopecks: toNumber(assignment.price_kopecks),
      active: assignment.active,
    });
  });

  // Removes a federation's access to a product. A hard DELETE is unsafe here: applications
  // reference federation_products via federation_product_id with no ON DELETE clause (i.e.
  // RESTRICT), so any assignment that was ever used to buy a policy cannot be hard-deleted.
  // Deactivating is the safest behavior the existing schema actually supports.
  app.delete<{ Params: { id: string; federationId: string } }>(
    '/api/products/:id/federations/:federationId',
    async (request, reply) => {
      const account = await authenticate(request);
      assertUuid(request.params.id);
      assertUuid(request.params.federationId);

      const productResult = await pool.query<{ category: string }>(`SELECT category FROM insurance_products WHERE id = $1`, [
        request.params.id,
      ]);
      const productRow = productResult.rows[0];
      if (!productRow) {
        throw new NotFoundError('product_not_found');
      }
      await requireCategoryManage(account, productRow.category);

      const result = await pool.query(
        `UPDATE federation_products
         SET active = false, updated_at = now()
         WHERE id = (
           SELECT id FROM federation_products
           WHERE product_id = $1 AND federation_id = $2
           ORDER BY created_at DESC LIMIT 1
         )
         RETURNING id, price_kopecks, active`,
        [request.params.id, request.params.federationId],
      );

      const assignment = result.rows[0];
      if (!assignment) {
        throw new NotFoundError('assignment_not_found');
      }

      return reply.status(200).send({
        id: assignment.id,
        price_kopecks: toNumber(assignment.price_kopecks),
        active: assignment.active,
      });
    },
  );
}
