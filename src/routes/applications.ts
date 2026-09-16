import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds, assertApplicationRecordAccess, AuthError } from '../modules/auth/guards';
import { assertUuid, NotFoundError, BadRequestError, toNumber } from '../lib/api-helpers';
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
      return reply.status(200).send(result.rows.map(mapApplicationRow));
    }

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

    await assertApplicationRecordAccess(account, {
      federationId: row.access_federation_id as string | null,
      personId: row.person_id as string | null,
    });

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
}
