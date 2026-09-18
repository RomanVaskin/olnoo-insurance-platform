import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds } from '../modules/auth/guards';
import {
  getAccessibleCategories,
  requireSportAccess,
  requireSportManage,
} from '../modules/auth/insurance-access';
import type { SessionAccount } from '../modules/auth/session';
import { assertUuid, BadRequestError, NotFoundError, HttpError, toNumber, toNullableNumber } from '../lib/api-helpers';
import { federationSummary, productSummary } from '../lib/mappers';

// persons.gender has no DB CHECK constraint, but this is the convention already used by
// every seeded/production person row.
const GENDER_VALUES = ['male', 'female'];

// federation_memberships.status has no DB CHECK constraint, but this is the convention
// already used (default 'active') and mirrored by every other status field in this codebase.
const MEMBERSHIP_STATUS_VALUES = ['active', 'inactive'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertRequiredName(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError(code);
  }
  return value.trim();
}

/** Generic nullable free-text field (patronymic, phone, club, coach, grade, sport_name). */
function assertNullableText(value: unknown, code: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError(code);
  }
  return value.trim();
}

function assertGender(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || !GENDER_VALUES.includes(value)) {
    throw new BadRequestError('invalid_gender');
  }
  return value;
}

function assertBirthdate(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new BadRequestError('invalid_birthdate');
  }
  return value;
}

function assertEmail(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || !EMAIL_RE.test(value)) {
    throw new BadRequestError('invalid_email');
  }
  return value;
}

function assertMembershipStatus(value: unknown): string {
  if (typeof value !== 'string' || !MEMBERSHIP_STATUS_VALUES.includes(value)) {
    throw new BadRequestError('invalid_membership_status');
  }
  return value;
}

function assertNullableWeight(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BadRequestError('invalid_weight');
  }
  return value;
}

type AthleteWriteBody = {
  last_name?: unknown;
  first_name?: unknown;
  patronymic?: unknown;
  birthdate?: unknown;
  gender?: unknown;
  phone?: unknown;
  email?: unknown;
  federation_id?: unknown;
  club?: unknown;
  coach?: unknown;
  grade?: unknown;
  weight?: unknown;
  sport_name?: unknown;
  membership_status?: unknown;
};

const MEMBERSHIP_FIELD_KEYS = ['federation_id', 'club', 'coach', 'grade', 'weight', 'sport_name', 'membership_status'] as const;

function hasAnyMembershipField(body: AthleteWriteBody): boolean {
  return MEMBERSHIP_FIELD_KEYS.some((key) => body[key] !== undefined);
}

async function loadAthleteResponse(personId: string) {
  const personResult = await pool.query(
    `SELECT id, last_name, first_name, patronymic, birthdate, gender, phone, email
     FROM persons WHERE id = $1`,
    [personId],
  );
  const person = personResult.rows[0];

  const membershipResult = await pool.query(
    `SELECT fm.club, fm.coach, fm.grade, fm.weight, fm.sport_name, fm.status,
            f.id AS federation_id, f.name AS federation_name
     FROM federation_memberships fm
     JOIN federations f ON f.id = fm.federation_id
     WHERE fm.person_id = $1
     ORDER BY f.name`,
    [personId],
  );

  return {
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
  };
}

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

/**
 * Athletes are sport-domain entities. A sport admin sees every athlete regardless of
 * product assignment; federation staff retain their existing federation filter.
 */
async function resolveAthleteFederationFilter(account: SessionAccount): Promise<string[] | null> {
  const federationIds = await getAccessibleFederationIds(account);
  if (account.role !== 'admin') {
    return federationIds;
  }
  await requireSportAccess(account);
  return null;
}

export async function athletesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/athletes', async (request, reply) => {
    const account = await authenticate(request);
    const federationIds = await resolveAthleteFederationFilter(account);

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

    const federationIds = await resolveAthleteFederationFilter(account);

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

    const categories = await getAccessibleCategories(account);
    const [applicationsResult, paymentsResult, policiesResult] = await Promise.all([
      pool.query(
        `SELECT a.id, a.status, a.amount_kopecks, a.created_at,
                f.id AS federation_id, f.name AS federation_name,
                ip.id AS product_id, ip.name AS product_name, ip.category AS access_category
         FROM applications a
         LEFT JOIN federations f ON f.id = a.federation_id
         JOIN insurance_products ip ON ip.id = a.product_id
         WHERE a.person_id = $1 AND ($2::uuid[] IS NULL OR a.federation_id = ANY($2::uuid[]))
           AND ($3::text[] IS NULL OR ip.category = ANY($3::text[]))
         ORDER BY a.created_at DESC`,
        [personId, federationIds, categories],
      ),
      pool.query(
        `SELECT pay.id, pay.application_id, pay.provider, pay.provider_payment_id,
                pay.amount_kopecks, pay.currency, pay.status, pay.paid_at, pay.created_at
         FROM payments pay
         JOIN applications a ON a.id = pay.application_id
         JOIN insurance_products ip ON ip.id = a.product_id
         WHERE a.person_id = $1 AND ($2::uuid[] IS NULL OR a.federation_id = ANY($2::uuid[]))
           AND ($3::text[] IS NULL OR ip.category = ANY($3::text[]))
         ORDER BY pay.created_at DESC`,
        [personId, federationIds, categories],
      ),
      pool.query(
        `SELECT pol.id, pol.policy_number, pol.status, pol.valid_from, pol.valid_to, pol.policy_url,
                ip.id AS product_id, ip.name AS product_name, ip.category AS access_category
         FROM policies pol
         JOIN insurance_products ip ON ip.id = pol.product_id
         WHERE pol.person_id = $1 AND ($2::uuid[] IS NULL OR pol.federation_id = ANY($2::uuid[]))
           AND ($3::text[] IS NULL OR ip.category = ANY($3::text[]))
         ORDER BY pol.valid_from DESC`,
        [personId, federationIds, categories],
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

  // Creates a person (an "athlete" in this admin UI) and, only if federation data is
  // supplied, a single federation_memberships row for them. Never creates an accounts
  // row — login/account management is a separate, not-yet-built task.
  app.post<{ Body: AthleteWriteBody }>('/api/athletes', async (request, reply) => {
    const account = await authenticate(request);
    if (account.role !== 'super_admin') await requireSportManage(account);

    const body = request.body ?? {};
    const lastName = assertRequiredName(body.last_name, 'last_name_required');
    const firstName = assertRequiredName(body.first_name, 'first_name_required');
    const patronymic = body.patronymic === undefined ? null : assertNullableText(body.patronymic, 'invalid_patronymic');
    const birthdate = body.birthdate === undefined ? null : assertBirthdate(body.birthdate);
    const gender = body.gender === undefined ? null : assertGender(body.gender);
    const phone = body.phone === undefined ? null : assertNullableText(body.phone, 'invalid_phone');
    const email = body.email === undefined ? null : assertEmail(body.email);

    const wantsMembership = hasAnyMembershipField(body);
    if (account.role !== 'super_admin' && !wantsMembership) {
      throw new BadRequestError('federation_id_required');
    }
    let federationId: string | null = null;
    let club: string | null = null;
    let coach: string | null = null;
    let grade: string | null = null;
    let weight: number | null = null;
    let sportName: string | null = null;
    let membershipStatus = 'active';

    if (wantsMembership) {
      if (typeof body.federation_id !== 'string') {
        throw new BadRequestError('federation_id_required');
      }
      assertUuid(body.federation_id);
      federationId = body.federation_id;

      const federationExists = await pool.query(`SELECT 1 FROM federations WHERE id = $1`, [federationId]);
      if (federationExists.rowCount === 0) {
        throw new NotFoundError('federation_not_found');
      }

      club = body.club === undefined ? null : assertNullableText(body.club, 'invalid_club');
      coach = body.coach === undefined ? null : assertNullableText(body.coach, 'invalid_coach');
      grade = body.grade === undefined ? null : assertNullableText(body.grade, 'invalid_grade');
      weight = body.weight === undefined ? null : assertNullableWeight(body.weight);
      sportName = body.sport_name === undefined ? null : assertNullableText(body.sport_name, 'invalid_sport_name');
      membershipStatus = body.membership_status === undefined ? 'active' : assertMembershipStatus(body.membership_status);
    }

    const personResult = await pool.query(
      `INSERT INTO persons (last_name, first_name, patronymic, birthdate, gender, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [lastName, firstName, patronymic, birthdate, gender, phone, email],
    );
    const personId = personResult.rows[0].id;

    if (wantsMembership) {
      await pool.query(
        `INSERT INTO federation_memberships (federation_id, person_id, club, coach, grade, weight, sport_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [federationId, personId, club, coach, grade, weight, sportName, membershipStatus],
      );
    }

    return reply.status(201).send(await loadAthleteResponse(personId));
  });

  // Edits person fields and/or the athlete's federation membership. Reassigning an
  // *existing* membership to a different federation is intentionally not supported here
  // (see the 409 below) — see the task report for why.
  app.patch<{ Params: { id: string }; Body: AthleteWriteBody }>('/api/athletes/:id', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);
    const personId = request.params.id;

    if (account.role !== 'super_admin') {
      await requireSportManage(account);
    }

    const personExists = await pool.query(`SELECT 1 FROM persons WHERE id = $1`, [personId]);
    if (personExists.rowCount === 0) {
      throw new NotFoundError('person_not_found');
    }

    const body = request.body ?? {};

    const personUpdates: string[] = [];
    const personValues: unknown[] = [];

    if (body.last_name !== undefined) {
      personValues.push(assertRequiredName(body.last_name, 'last_name_required'));
      personUpdates.push(`last_name = $${personValues.length}`);
    }
    if (body.first_name !== undefined) {
      personValues.push(assertRequiredName(body.first_name, 'first_name_required'));
      personUpdates.push(`first_name = $${personValues.length}`);
    }
    if (body.patronymic !== undefined) {
      personValues.push(assertNullableText(body.patronymic, 'invalid_patronymic'));
      personUpdates.push(`patronymic = $${personValues.length}`);
    }
    if (body.birthdate !== undefined) {
      personValues.push(assertBirthdate(body.birthdate));
      personUpdates.push(`birthdate = $${personValues.length}`);
    }
    if (body.gender !== undefined) {
      personValues.push(assertGender(body.gender));
      personUpdates.push(`gender = $${personValues.length}`);
    }
    if (body.phone !== undefined) {
      personValues.push(assertNullableText(body.phone, 'invalid_phone'));
      personUpdates.push(`phone = $${personValues.length}`);
    }
    if (body.email !== undefined) {
      personValues.push(assertEmail(body.email));
      personUpdates.push(`email = $${personValues.length}`);
    }

    const editsMembership = hasAnyMembershipField(body);

    if (personUpdates.length === 0 && !editsMembership) {
      throw new BadRequestError('no_fields_to_update');
    }

    // Validate the membership write up front, before touching the DB, so a rejected
    // (e.g. federation-change) request leaves both person and membership untouched.
    let membershipPlan:
      | { action: 'insert'; federationId: string; club: string | null; coach: string | null; grade: string | null; weight: number | null; sportName: string | null; status: string }
      | { action: 'update'; membershipId: string; club?: string | null; coach?: string | null; grade?: string | null; weight?: number | null; sportName?: string | null; status?: string }
      | null = null;

    if (editsMembership) {
      const federationIdInput = body.federation_id === undefined ? undefined : (() => {
        if (typeof body.federation_id !== 'string') {
          throw new BadRequestError('invalid_federation_id');
        }
        assertUuid(body.federation_id);
        return body.federation_id;
      })();

      const club = body.club === undefined ? undefined : assertNullableText(body.club, 'invalid_club');
      const coach = body.coach === undefined ? undefined : assertNullableText(body.coach, 'invalid_coach');
      const grade = body.grade === undefined ? undefined : assertNullableText(body.grade, 'invalid_grade');
      const weight = body.weight === undefined ? undefined : assertNullableWeight(body.weight);
      const sportName = body.sport_name === undefined ? undefined : assertNullableText(body.sport_name, 'invalid_sport_name');
      const status = body.membership_status === undefined ? undefined : assertMembershipStatus(body.membership_status);

      const existingResult = await pool.query<{ id: string; federation_id: string }>(
        `SELECT id, federation_id FROM federation_memberships WHERE person_id = $1`,
        [personId],
      );
      const existing = existingResult.rows;

      if (existing.length === 0) {
        if (federationIdInput === undefined) {
          throw new BadRequestError('federation_id_required');
        }
        const federationExists = await pool.query(`SELECT 1 FROM federations WHERE id = $1`, [federationIdInput]);
        if (federationExists.rowCount === 0) {
          throw new NotFoundError('federation_not_found');
        }
        membershipPlan = {
          action: 'insert',
          federationId: federationIdInput,
          club: club ?? null,
          coach: coach ?? null,
          grade: grade ?? null,
          weight: weight ?? null,
          sportName: sportName ?? null,
          status: status ?? 'active',
        };
      } else {
        const target =
          federationIdInput === undefined
            ? existing[0]
            : existing.find((m) => m.federation_id === federationIdInput);

        if (!target) {
          if (existing.length === 1) {
            // Exactly one membership exists and the caller asked to point it at a
            // *different* federation. Silently deleting/recreating would destroy the
            // club/coach/grade/weight/sport_name/status history for the old federation
            // with no undo — flagged per the task's own instruction, not implemented.
            throw new HttpError(409, 'federation_change_not_supported');
          }
          if (federationIdInput === undefined) {
            throw new BadRequestError('federation_id_required');
          }
          // Person already has multiple memberships (not reachable via this API today,
          // but the schema allows it) — adding one more for a new federation is additive,
          // not destructive, unlike reassigning the single-membership case above.
          const federationExists = await pool.query(`SELECT 1 FROM federations WHERE id = $1`, [federationIdInput]);
          if (federationExists.rowCount === 0) {
            throw new NotFoundError('federation_not_found');
          }
          membershipPlan = {
            action: 'insert',
            federationId: federationIdInput as string,
            club: club ?? null,
            coach: coach ?? null,
            grade: grade ?? null,
            weight: weight ?? null,
            sportName: sportName ?? null,
            status: status ?? 'active',
          };
        } else {
          membershipPlan = { action: 'update', membershipId: target.id, club, coach, grade, weight, sportName, status };
        }
      }
    }

    if (personUpdates.length > 0) {
      personValues.push(personId);
      await pool.query(`UPDATE persons SET ${personUpdates.join(', ')}, updated_at = now() WHERE id = $${personValues.length}`, personValues);
    }

    if (membershipPlan?.action === 'insert') {
      await pool.query(
        `INSERT INTO federation_memberships (federation_id, person_id, club, coach, grade, weight, sport_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [membershipPlan.federationId, personId, membershipPlan.club, membershipPlan.coach, membershipPlan.grade, membershipPlan.weight, membershipPlan.sportName, membershipPlan.status],
      );
    } else if (membershipPlan?.action === 'update') {
      const updates: string[] = [];
      const values: unknown[] = [];
      if (membershipPlan.club !== undefined) { values.push(membershipPlan.club); updates.push(`club = $${values.length}`); }
      if (membershipPlan.coach !== undefined) { values.push(membershipPlan.coach); updates.push(`coach = $${values.length}`); }
      if (membershipPlan.grade !== undefined) { values.push(membershipPlan.grade); updates.push(`grade = $${values.length}`); }
      if (membershipPlan.weight !== undefined) { values.push(membershipPlan.weight); updates.push(`weight = $${values.length}`); }
      if (membershipPlan.sportName !== undefined) { values.push(membershipPlan.sportName); updates.push(`sport_name = $${values.length}`); }
      if (membershipPlan.status !== undefined) { values.push(membershipPlan.status); updates.push(`status = $${values.length}`); }
      if (updates.length > 0) {
        values.push(membershipPlan.membershipId);
        await pool.query(`UPDATE federation_memberships SET ${updates.join(', ')}, updated_at = now() WHERE id = $${values.length}`, values);
      }
    }

    return reply.status(200).send(await loadAthleteResponse(personId));
  });
}
