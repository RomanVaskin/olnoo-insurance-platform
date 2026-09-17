import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, requireRole } from '../modules/auth/guards';
import { hashPassword } from '../modules/auth/password';
import { assertUuid, BadRequestError, NotFoundError } from '../lib/api-helpers';

// This subsystem manages platform *staff* accounts only (super_admin, admin, and
// federation staff). Athlete/guardian accounts remain exclusively owned by Athletes
// CRUD (person-centric, see src/routes/athletes.ts) — never created, edited, or
// password-reset through here.
const MANAGED_ROLES = ['super_admin', 'admin', 'federation_secretary', 'federation_director'];

// accounts.status has no DB CHECK constraint, but this is the convention every other
// status field in this codebase already uses, and it's the value auth.ts's login route
// actually checks (`status !== 'active'` blocks login).
const STATUS_VALUES = ['active', 'inactive'];

// Mirrors insurance_products.category's app-level allow-list (src/routes/products.ts) —
// admin_insurance_access.insurance_type reuses the same values, no parallel model.
const INSURANCE_TYPE_VALUES = ['sport', 'travel', 'health', 'auto', 'property', 'business'];
const PERMISSION_VALUES = ['read', 'manage'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USER_SELECT = `
  SELECT
    a.id, a.email, a.phone, a.role, a.status, a.created_at, a.updated_at,
    p.id AS person_id, p.last_name AS person_last_name, p.first_name AS person_first_name, p.patronymic AS person_patronymic,
    fed.federation_id, fed.federation_name, fed.federation_role,
    access.insurance_access
  FROM accounts a
  LEFT JOIN persons p ON p.id = a.person_id
  LEFT JOIN LATERAL (
    SELECT fu.role AS federation_role, f.id AS federation_id, f.name AS federation_name
    FROM federation_users fu
    JOIN federations f ON f.id = fu.federation_id
    WHERE fu.account_id = a.id
    ORDER BY fu.created_at DESC
    LIMIT 1
  ) fed ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object('insurance_type', aia.insurance_type, 'permission', aia.permission) ORDER BY aia.insurance_type),
      '[]'::jsonb
    ) AS insurance_access
    FROM admin_insurance_access aia
    WHERE aia.account_id = a.id
  ) access ON true
`;

function mapUserRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    person: row.person_id
      ? {
          id: row.person_id,
          last_name: row.person_last_name,
          first_name: row.person_first_name,
          patronymic: row.person_patronymic,
        }
      : null,
    federation: row.federation_id
      ? { id: row.federation_id, name: row.federation_name, role: row.federation_role }
      : null,
    insurance_access: row.insurance_access ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadUserResponse(id: string) {
  const result = await pool.query(`${USER_SELECT} WHERE a.id = $1`, [id]);
  return mapUserRow(result.rows[0]);
}

function assertManagedRole(value: unknown): string {
  if (typeof value !== 'string' || !MANAGED_ROLES.includes(value)) {
    throw new BadRequestError('invalid_role');
  }
  return value;
}

function assertInsuranceType(value: unknown): string {
  if (typeof value !== 'string' || !INSURANCE_TYPE_VALUES.includes(value)) {
    throw new BadRequestError('invalid_insurance_type');
  }
  return value;
}

function assertPermission(value: unknown): string {
  if (typeof value !== 'string' || !PERMISSION_VALUES.includes(value)) {
    throw new BadRequestError('invalid_permission');
  }
  return value;
}

function assertStatus(value: unknown): string {
  if (typeof value !== 'string' || !STATUS_VALUES.includes(value)) {
    throw new BadRequestError('invalid_status');
  }
  return value;
}

// Login (src/routes/auth.ts) only ever looks accounts up by email, so an account
// created without one would be unusable — email is required here even though the
// column itself is nullable.
function assertRequiredEmail(value: unknown): string {
  if (typeof value !== 'string' || !EMAIL_RE.test(value)) {
    throw new BadRequestError('invalid_email');
  }
  return value;
}

function assertNullablePhone(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError('invalid_phone');
  }
  return value.trim();
}

function assertPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8) {
    throw new BadRequestError('invalid_password');
  }
  return value;
}

function federationUsersRole(accountRole: string): 'secretary' | 'director' {
  return accountRole === 'federation_secretary' ? 'secretary' : 'director';
}

/** Postgres unique_violation constraint name, if any — lets us tell email vs phone apart. */
function uniqueViolationConstraint(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
    return (error as { constraint?: string }).constraint ?? null;
  }
  return null;
}

type UserWriteBody = {
  email?: unknown;
  phone?: unknown;
  status?: unknown;
  role?: unknown;
  password?: unknown;
  federation_id?: unknown;
  insurance_access?: unknown;
};

/** Validates a POST /api/users `insurance_access` array: [{insurance_type, permission}]. */
function assertInsuranceAccessList(value: unknown): { insurance_type: string; permission: string }[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestError('insurance_access_required');
  }
  const seen = new Set<string>();
  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new BadRequestError('invalid_insurance_access');
    }
    const insuranceType = assertInsuranceType((entry as { insurance_type?: unknown }).insurance_type);
    const permission = assertPermission((entry as { permission?: unknown }).permission);
    if (seen.has(insuranceType)) {
      throw new BadRequestError('duplicate_insurance_type');
    }
    seen.add(insuranceType);
    return { insurance_type: insuranceType, permission };
  });
}

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/users', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);

    const result = await pool.query(`${USER_SELECT} ORDER BY a.created_at DESC`);
    return reply.status(200).send(result.rows.map(mapUserRow));
  });

  app.get<{ Params: { id: string } }>('/api/users/:id', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);
    assertUuid(request.params.id);

    const result = await pool.query(`${USER_SELECT} WHERE a.id = $1`, [request.params.id]);
    if (result.rowCount === 0) {
      throw new NotFoundError('user_not_found');
    }

    return reply.status(200).send(mapUserRow(result.rows[0]));
  });

  // Creates a staff account (super_admin / federation_secretary / federation_director)
  // and, for federation staff, its federation_users row, in one transaction. Never
  // creates an athlete/guardian account — those belong to Athletes CRUD.
  app.post<{ Body: UserWriteBody }>('/api/users', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);

    const body = request.body ?? {};
    const role = assertManagedRole(body.role);
    const email = assertRequiredEmail(body.email);
    const phone = body.phone === undefined ? null : assertNullablePhone(body.phone);
    const password = assertPassword(body.password);

    let federationId: string | null = null;
    if (role === 'federation_secretary' || role === 'federation_director') {
      if (typeof body.federation_id !== 'string') {
        throw new BadRequestError('federation_id_required');
      }
      assertUuid(body.federation_id);
      federationId = body.federation_id;

      const federationExists = await pool.query(`SELECT 1 FROM federations WHERE id = $1`, [federationId]);
      if (federationExists.rowCount === 0) {
        throw new NotFoundError('federation_not_found');
      }
    } else if (body.federation_id !== undefined) {
      throw new BadRequestError('federation_id_not_allowed_for_role');
    }

    // An 'admin' account is useless with zero access, so at least one insurance type is
    // required at creation time (see db/migrations/004_admin_hierarchy_and_payments.sql).
    const insuranceAccess = role === 'admin' ? assertInsuranceAccessList(body.insurance_access) : null;
    if (role !== 'admin' && body.insurance_access !== undefined) {
      throw new BadRequestError('insurance_access_not_allowed_for_role');
    }

    const passwordHash = await hashPassword(password);

    const client = await pool.connect();
    let accountId: string;
    try {
      await client.query('BEGIN');

      try {
        const insertResult = await client.query(
          `INSERT INTO accounts (email, phone, password_hash, role, status)
           VALUES ($1, $2, $3, $4, 'active')
           RETURNING id`,
          [email, phone, passwordHash, role],
        );
        accountId = insertResult.rows[0].id;
      } catch (error) {
        const constraint = uniqueViolationConstraint(error);
        if (constraint === 'accounts_email_key') throw new BadRequestError('email_taken');
        if (constraint === 'accounts_phone_key') throw new BadRequestError('phone_taken');
        throw error;
      }

      if (federationId) {
        await client.query(
          `INSERT INTO federation_users (federation_id, account_id, role) VALUES ($1, $2, $3)`,
          [federationId, accountId, federationUsersRole(role)],
        );
      }

      if (insuranceAccess) {
        for (const grant of insuranceAccess) {
          await client.query(
            `INSERT INTO admin_insurance_access (account_id, insurance_type, permission) VALUES ($1, $2, $3)`,
            [accountId, grant.insurance_type, grant.permission],
          );
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return reply.status(201).send(await loadUserResponse(accountId));
  });

  // Edits a staff account's email/phone/status/role, and its federation assignment
  // where applicable. Role and federation changes are applied transactionally
  // alongside the federation_users row so the two never end up out of sync.
  app.patch<{ Params: { id: string }; Body: UserWriteBody }>('/api/users/:id', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);
    assertUuid(request.params.id);
    const userId = request.params.id;

    const existingResult = await pool.query<{ role: string }>(`SELECT role FROM accounts WHERE id = $1`, [userId]);
    const existing = existingResult.rows[0];
    if (!existing) {
      throw new NotFoundError('user_not_found');
    }
    if (!MANAGED_ROLES.includes(existing.role)) {
      // Athlete/guardian accounts are out of scope for this subsystem entirely.
      throw new BadRequestError('unsupported_role');
    }

    const body = request.body ?? {};

    if (body.role !== undefined && userId === account.id) {
      throw new BadRequestError('cannot_change_own_role');
    }

    const accountUpdates: string[] = [];
    const accountValues: unknown[] = [];

    if (body.email !== undefined) {
      accountValues.push(assertRequiredEmail(body.email));
      accountUpdates.push(`email = $${accountValues.length}`);
    }
    if (body.phone !== undefined) {
      accountValues.push(assertNullablePhone(body.phone));
      accountUpdates.push(`phone = $${accountValues.length}`);
    }
    if (body.status !== undefined) {
      accountValues.push(assertStatus(body.status));
      accountUpdates.push(`status = $${accountValues.length}`);
    }

    let newRole = existing.role;
    if (body.role !== undefined) {
      newRole = assertManagedRole(body.role);
      accountValues.push(newRole);
      accountUpdates.push(`role = $${accountValues.length}`);
    }

    const editsMembership = body.role !== undefined || body.federation_id !== undefined;

    if (accountUpdates.length === 0 && !editsMembership) {
      throw new BadRequestError('no_fields_to_update');
    }

    // Resolve the federation_users write up front, before any DB write, so a rejected
    // request (bad federation, missing federation_id, …) leaves everything untouched.
    let federationPlan: { action: 'upsert'; federationId: string; role: 'secretary' | 'director' } | { action: 'clear' } | null =
      null;

    if (editsMembership) {
      if (newRole === 'federation_secretary' || newRole === 'federation_director') {
        let federationId: string | undefined;
        if (body.federation_id !== undefined) {
          if (typeof body.federation_id !== 'string') {
            throw new BadRequestError('invalid_federation_id');
          }
          assertUuid(body.federation_id);
          federationId = body.federation_id;
          const federationExists = await pool.query(`SELECT 1 FROM federations WHERE id = $1`, [federationId]);
          if (federationExists.rowCount === 0) {
            throw new NotFoundError('federation_not_found');
          }
        } else {
          const existingMembership = await pool.query<{ federation_id: string }>(
            `SELECT federation_id FROM federation_users WHERE account_id = $1`,
            [userId],
          );
          federationId = existingMembership.rows[0]?.federation_id;
        }
        if (!federationId) {
          throw new BadRequestError('federation_id_required');
        }
        federationPlan = { action: 'upsert', federationId, role: federationUsersRole(newRole) };
      } else if (newRole === 'super_admin' || newRole === 'admin') {
        if (body.federation_id !== undefined) {
          throw new BadRequestError('federation_id_not_allowed_for_role');
        }
        // Neither super_admin nor admin is federation-scoped (guards.ts bypasses
        // federation_users for both) — drop any stale row from a prior secretary/director role.
        federationPlan = { action: 'clear' };
      }
    }

    // Dropping the 'admin' role removes any insurance-type grants along with it — they'd
    // otherwise be dead rows for a role that can no longer use them.
    const clearInsuranceAccess = body.role !== undefined && existing.role === 'admin' && newRole !== 'admin';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (accountUpdates.length > 0) {
        accountValues.push(userId);
        try {
          await client.query(
            `UPDATE accounts SET ${accountUpdates.join(', ')}, updated_at = now() WHERE id = $${accountValues.length}`,
            accountValues,
          );
        } catch (error) {
          const constraint = uniqueViolationConstraint(error);
          if (constraint === 'accounts_email_key') throw new BadRequestError('email_taken');
          if (constraint === 'accounts_phone_key') throw new BadRequestError('phone_taken');
          throw error;
        }
      }

      if (federationPlan?.action === 'upsert') {
        const existingRow = await client.query<{ id: string }>(
          `SELECT id FROM federation_users WHERE account_id = $1`,
          [userId],
        );
        if (existingRow.rows[0]) {
          await client.query(`UPDATE federation_users SET federation_id = $1, role = $2 WHERE id = $3`, [
            federationPlan.federationId,
            federationPlan.role,
            existingRow.rows[0].id,
          ]);
        } else {
          await client.query(
            `INSERT INTO federation_users (federation_id, account_id, role) VALUES ($1, $2, $3)`,
            [federationPlan.federationId, userId, federationPlan.role],
          );
        }
      } else if (federationPlan?.action === 'clear') {
        await client.query(`DELETE FROM federation_users WHERE account_id = $1`, [userId]);
      }

      if (clearInsuranceAccess) {
        await client.query(`DELETE FROM admin_insurance_access WHERE account_id = $1`, [userId]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return reply.status(200).send(await loadUserResponse(userId));
  });

  // Sets a new password for a staff account. super_admin only; never usable on
  // athlete/guardian accounts (out of scope for this subsystem).
  app.post<{ Params: { id: string }; Body: { password?: unknown } }>(
    '/api/users/:id/reset-password',
    async (request, reply) => {
      const account = await authenticate(request);
      requireRole(account, ['super_admin']);
      assertUuid(request.params.id);

      const existingResult = await pool.query<{ role: string }>(`SELECT role FROM accounts WHERE id = $1`, [
        request.params.id,
      ]);
      const existing = existingResult.rows[0];
      if (!existing) {
        throw new NotFoundError('user_not_found');
      }
      if (!MANAGED_ROLES.includes(existing.role)) {
        throw new BadRequestError('unsupported_role');
      }

      const password = assertPassword((request.body ?? {}).password);
      const passwordHash = await hashPassword(password);

      await pool.query(`UPDATE accounts SET password_hash = $1, updated_at = now() WHERE id = $2`, [
        passwordHash,
        request.params.id,
      ]);

      return reply.status(200).send({ ok: true });
    },
  );

  // Grants (or updates, if the pair already exists) an 'admin' account's access to one
  // insurance type. super_admin only; only ever applies to accounts with role='admin'.
  app.post<{ Params: { id: string }; Body: { insurance_type?: unknown; permission?: unknown } }>(
    '/api/users/:id/insurance-access',
    async (request, reply) => {
      const account = await authenticate(request);
      requireRole(account, ['super_admin']);
      assertUuid(request.params.id);

      if (request.params.id === account.id) {
        throw new BadRequestError('cannot_change_own_insurance_access');
      }

      const targetResult = await pool.query<{ role: string }>(`SELECT role FROM accounts WHERE id = $1`, [
        request.params.id,
      ]);
      const target = targetResult.rows[0];
      if (!target) {
        throw new NotFoundError('user_not_found');
      }
      if (target.role !== 'admin') {
        throw new BadRequestError('unsupported_role');
      }

      const body = request.body ?? {};
      const insuranceType = assertInsuranceType(body.insurance_type);
      const permission = assertPermission(body.permission);

      await pool.query(
        `INSERT INTO admin_insurance_access (account_id, insurance_type, permission)
         VALUES ($1, $2, $3)
         ON CONFLICT (account_id, insurance_type) DO UPDATE SET permission = EXCLUDED.permission, updated_at = now()`,
        [request.params.id, insuranceType, permission],
      );

      return reply.status(200).send(await loadUserResponse(request.params.id));
    },
  );

  // Changes the permission of an existing insurance-type grant.
  app.patch<{ Params: { id: string; insuranceType: string }; Body: { permission?: unknown } }>(
    '/api/users/:id/insurance-access/:insuranceType',
    async (request, reply) => {
      const account = await authenticate(request);
      requireRole(account, ['super_admin']);
      assertUuid(request.params.id);

      if (request.params.id === account.id) {
        throw new BadRequestError('cannot_change_own_insurance_access');
      }

      const targetResult = await pool.query<{ role: string }>(`SELECT role FROM accounts WHERE id = $1`, [
        request.params.id,
      ]);
      const target = targetResult.rows[0];
      if (!target) {
        throw new NotFoundError('user_not_found');
      }
      if (target.role !== 'admin') {
        throw new BadRequestError('unsupported_role');
      }

      const insuranceType = assertInsuranceType(request.params.insuranceType);
      const permission = assertPermission((request.body ?? {}).permission);

      const result = await pool.query(
        `UPDATE admin_insurance_access SET permission = $1, updated_at = now()
         WHERE account_id = $2 AND insurance_type = $3`,
        [permission, request.params.id, insuranceType],
      );
      if (result.rowCount === 0) {
        throw new NotFoundError('insurance_access_not_found');
      }

      return reply.status(200).send(await loadUserResponse(request.params.id));
    },
  );

  // Revokes an 'admin' account's access to one insurance type.
  app.delete<{ Params: { id: string; insuranceType: string } }>(
    '/api/users/:id/insurance-access/:insuranceType',
    async (request, reply) => {
      const account = await authenticate(request);
      requireRole(account, ['super_admin']);
      assertUuid(request.params.id);

      if (request.params.id === account.id) {
        throw new BadRequestError('cannot_change_own_insurance_access');
      }

      const targetResult = await pool.query<{ role: string }>(`SELECT role FROM accounts WHERE id = $1`, [
        request.params.id,
      ]);
      const target = targetResult.rows[0];
      if (!target) {
        throw new NotFoundError('user_not_found');
      }
      if (target.role !== 'admin') {
        throw new BadRequestError('unsupported_role');
      }

      const insuranceType = assertInsuranceType(request.params.insuranceType);

      const result = await pool.query(
        `DELETE FROM admin_insurance_access WHERE account_id = $1 AND insurance_type = $2`,
        [request.params.id, insuranceType],
      );
      if (result.rowCount === 0) {
        throw new NotFoundError('insurance_access_not_found');
      }

      return reply.status(200).send(await loadUserResponse(request.params.id));
    },
  );
}
