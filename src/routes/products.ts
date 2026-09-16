import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds } from '../modules/auth/guards';
import { assertUuid, NotFoundError, toNumber, toNullableNumber } from '../lib/api-helpers';

const LIST_SELECT = `
  SELECT id, name, category, insurer_name, coverage_amount_kopecks, validity_days,
         base_price_kopecks, status
  FROM insurance_products
`;

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

export async function productsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/products', async (request, reply) => {
    const account = await authenticate(request);
    // Products aren't federation-owned, but this still excludes roles (athlete, guardian)
    // that have no business browsing the admin catalog, consistent with the other list routes.
    await getAccessibleFederationIds(account);

    const result = await pool.query(`${LIST_SELECT} ORDER BY name`);
    return reply.status(200).send(result.rows.map(mapProductRow));
  });

  app.get<{ Params: { id: string } }>('/api/products/:id', async (request, reply) => {
    const account = await authenticate(request);
    const federationIds = await getAccessibleFederationIds(account);
    assertUuid(request.params.id);

    const productResult = await pool.query(`${LIST_SELECT} WHERE id = $1`, [request.params.id]);
    const product = productResult.rows[0];
    if (!product) {
      throw new NotFoundError('product_not_found');
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
}
