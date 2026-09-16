import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, AuthError } from '../modules/auth/guards';
import { toNullableNumber, toNumber } from '../lib/api-helpers';
import { federationSummary } from '../lib/mappers';
import type { SessionAccount } from '../modules/auth/session';

/** Throws 403 for anything but an athlete account with a linked person; returns that person_id. */
function requireAthletePerson(account: SessionAccount): string {
  if (account.role !== 'athlete') {
    throw new AuthError(403, 'forbidden');
  }
  if (!account.person_id) {
    throw new AuthError(403, 'forbidden');
  }
  return account.person_id;
}

// Self-service endpoints for the athlete-facing checkout flow. Unlike /api/athletes
// (federation-staff view, keyed by :id), these are always scoped to the caller's own
// accounts.person_id and never accept a person/federation id from the client.
export async function athleteRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/athlete/profile', async (request, reply) => {
    const account = await authenticate(request);
    const personId = requireAthletePerson(account);

    const personResult = await pool.query(
      `SELECT id, last_name, first_name, patronymic, birthdate, gender, phone, email
       FROM persons WHERE id = $1`,
      [personId],
    );
    const person = personResult.rows[0];
    if (!person) {
      throw new AuthError(403, 'forbidden');
    }

    const membershipResult = await pool.query(
      `SELECT fm.club, fm.coach, fm.grade, fm.weight, fm.sport_name, fm.status,
              f.id AS federation_id, f.name AS federation_name
       FROM federation_memberships fm
       JOIN federations f ON f.id = fm.federation_id
       WHERE fm.person_id = $1
       ORDER BY f.name`,
      [personId],
    );

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
      federation_memberships: membershipResult.rows.map((row) => ({
        federation: federationSummary(row),
        club: row.club,
        coach: row.coach,
        grade: row.grade,
        weight: toNullableNumber(row.weight),
        sport_name: row.sport_name,
        status: row.status,
      })),
    });
  });

  app.get('/api/athlete/products', async (request, reply) => {
    const account = await authenticate(request);
    if (account.role !== 'athlete') {
      throw new AuthError(403, 'forbidden');
    }
    // No linked person: nothing to buy under, but this isn't an athlete-specific
    // authorization failure, so return the empty state rather than 403 — matching
    // GET /api/applications' handling of the same case.
    if (!account.person_id) {
      return reply.status(200).send([]);
    }

    const result = await pool.query(
      `SELECT fp.federation_id, fp.price_kopecks,
              ip.id AS product_id, ip.name AS product_name, ip.category,
              ip.insurer_name, ip.coverage_amount_kopecks, ip.validity_days,
              f.name AS federation_name
       FROM federation_memberships fm
       JOIN federation_products fp ON fp.federation_id = fm.federation_id AND fp.active = true
       JOIN insurance_products ip ON ip.id = fp.product_id AND ip.status = 'active'
       JOIN federations f ON f.id = fp.federation_id
       WHERE fm.person_id = $1 AND fm.status = 'active'
       ORDER BY ip.name`,
      [account.person_id],
    );

    return reply.status(200).send(
      result.rows.map((row) => ({
        product_id: row.product_id,
        name: row.product_name,
        category: row.category,
        insurer_name: row.insurer_name ?? null,
        coverage_amount_kopecks: toNullableNumber(row.coverage_amount_kopecks),
        validity_days: toNumber(row.validity_days),
        amount_kopecks: toNumber(row.price_kopecks),
        currency: 'RUB',
        federation: { id: row.federation_id, name: row.federation_name },
      })),
    );
  });
}
