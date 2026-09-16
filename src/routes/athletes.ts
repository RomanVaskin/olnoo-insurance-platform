import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds } from '../modules/auth/guards';
import { assertUuid, NotFoundError, HttpError, toNumber, toNullableNumber } from '../lib/api-helpers';
import { federationSummary, productSummary } from '../lib/mappers';

const LIST_SELECT = `
  SELECT
    p.id AS person_id, p.last_name AS person_last_name, p.first_name AS person_first_name, p.patronymic AS person_patronymic,
    p.birthdate, p.gender, p.phone, p.email,
    fm.club, fm.coach, fm.grade, fm.weight, fm.sport_name,
    f.id AS federation_id, f.name AS federation_name,
    active_pol.policy_number AS active_policy_number
  FROM federation_memberships fm
  JOIN persons p ON p.id = fm.person_id
  JOIN federations f ON f.id = fm.federation_id
  LEFT JOIN LATERAL (
    SELECT policy_number FROM policies
    WHERE person_id = fm.person_id AND status = 'active'
    ORDER BY valid_to DESC
    LIMIT 1
  ) active_pol ON true
`;

function mapAthleteRow(row: Record<string, unknown>) {
  return {
    id: row.person_id,
    last_name: row.person_last_name,
    first_name: row.person_first_name,
    patronymic: row.person_patronymic,
    birthdate: row.birthdate,
    gender: row.gender,
    phone: row.phone,
    email: row.email,
    federation: federationSummary(row),
    club: row.club,
    coach: row.coach,
    grade: row.grade,
    weight: toNullableNumber(row.weight),
    sport_name: row.sport_name,
    insured: row.active_policy_number !== null,
    active_policy_number: row.active_policy_number ?? null,
  };
}

export async function athletesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/athletes', async (request, reply) => {
    const account = await authenticate(request);
    const federationIds = await getAccessibleFederationIds(account);

    const result = await pool.query(
      `${LIST_SELECT}
       WHERE ($1::uuid[] IS NULL OR fm.federation_id = ANY($1::uuid[]))
       ORDER BY p.last_name, p.first_name`,
      [federationIds],
    );

    return reply.status(200).send(result.rows.map(mapAthleteRow));
  });

  app.get<{ Params: { id: string } }>('/api/athletes/:id', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);
    const personId = request.params.id;

    const personResult = await pool.query(
      `SELECT id, last_name, first_name, patronymic, birthdate, gender, phone, email
       FROM persons WHERE id = $1`,
      [personId],
    );
    const person = personResult.rows[0];
    if (!person) {
      throw new NotFoundError('person_not_found');
    }

    const federationIds = await getAccessibleFederationIds(account);

    const membershipResult = await pool.query(
      `SELECT fm.club, fm.coach, fm.grade, fm.weight, fm.sport_name, fm.status,
              f.id AS federation_id, f.name AS federation_name
       FROM federation_memberships fm
       JOIN federations f ON f.id = fm.federation_id
       WHERE fm.person_id = $1 AND ($2::uuid[] IS NULL OR fm.federation_id = ANY($2::uuid[]))
       ORDER BY f.name`,
      [personId, federationIds],
    );

    if (account.role !== 'super_admin' && membershipResult.rows.length === 0) {
      throw new HttpError(403, 'forbidden');
    }

    const federationMemberships = membershipResult.rows.map((row) => ({
      federation: federationSummary(row),
      club: row.club,
      coach: row.coach,
      grade: row.grade,
      weight: toNullableNumber(row.weight),
      sport_name: row.sport_name,
      status: row.status,
    }));

    const [applicationsResult, paymentsResult, policiesResult] = await Promise.all([
      pool.query(
        `SELECT a.id, a.status, a.amount_kopecks, a.created_at,
                f.id AS federation_id, f.name AS federation_name,
                ip.id AS product_id, ip.name AS product_name
         FROM applications a
         LEFT JOIN federations f ON f.id = a.federation_id
         JOIN insurance_products ip ON ip.id = a.product_id
         WHERE a.person_id = $1 AND ($2::uuid[] IS NULL OR a.federation_id = ANY($2::uuid[]))
         ORDER BY a.created_at DESC`,
        [personId, federationIds],
      ),
      pool.query(
        `SELECT pay.id, pay.application_id, pay.provider, pay.provider_payment_id,
                pay.amount_kopecks, pay.currency, pay.status, pay.paid_at, pay.created_at
         FROM payments pay
         JOIN applications a ON a.id = pay.application_id
         WHERE a.person_id = $1 AND ($2::uuid[] IS NULL OR a.federation_id = ANY($2::uuid[]))
         ORDER BY pay.created_at DESC`,
        [personId, federationIds],
      ),
      pool.query(
        `SELECT pol.id, pol.policy_number, pol.status, pol.valid_from, pol.valid_to, pol.policy_url,
                ip.id AS product_id, ip.name AS product_name
         FROM policies pol
         JOIN insurance_products ip ON ip.id = pol.product_id
         WHERE pol.person_id = $1 AND ($2::uuid[] IS NULL OR pol.federation_id = ANY($2::uuid[]))
         ORDER BY pol.valid_from DESC`,
        [personId, federationIds],
      ),
    ]);

    return reply.status(200).send({
      person: {
        id: person.id,
        last_name: person.last_name,
        first_name: person.first_name,
        patronymic: person.patronymic,
        birthdate: person.birthdate,
        gender: person.gender,
        phone: person.phone,
        email: person.email,
      },
      federation_memberships: federationMemberships,
      applications: applicationsResult.rows.map((row) => ({
        id: row.id,
        status: row.status,
        amount_kopecks: toNumber(row.amount_kopecks),
        created_at: row.created_at,
        federation: federationSummary(row),
        product: productSummary(row),
      })),
      payments: paymentsResult.rows.map((row) => ({
        id: row.id,
        application_id: row.application_id,
        provider: row.provider,
        provider_payment_id: row.provider_payment_id,
        amount_kopecks: toNumber(row.amount_kopecks),
        currency: row.currency,
        status: row.status,
        paid_at: row.paid_at,
        created_at: row.created_at,
      })),
      policies: policiesResult.rows.map((row) => ({
        id: row.id,
        policy_number: row.policy_number,
        status: row.status,
        valid_from: row.valid_from,
        valid_to: row.valid_to,
        policy_url: row.policy_url,
        product: productSummary(row),
      })),
    });
  });
}
