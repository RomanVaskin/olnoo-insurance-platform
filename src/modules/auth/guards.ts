import type { FastifyRequest } from 'fastify';
import { pool } from '../../db/pool';
import { SESSION_COOKIE_NAME, getAccountBySessionToken, type SessionAccount } from './session';
import { getAccessibleCategories } from './insurance-access';
import { AuthError } from './errors';

export { AuthError };

export type FederationRole = 'secretary' | 'director';

/** Resolves the authenticated account from the session cookie, or throws 401. */
export async function authenticate(request: FastifyRequest): Promise<SessionAccount> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (!token) {
    throw new AuthError(401, 'unauthorized');
  }

  const account = await getAccountBySessionToken(token);
  if (!account) {
    throw new AuthError(401, 'unauthorized');
  }

  return account;
}

/** Throws 403 unless the account has one of the allowed roles. */
export function requireRole(account: SessionAccount, allowedRoles: string[]): void {
  if (!allowedRoles.includes(account.role)) {
    throw new AuthError(403, 'forbidden');
  }
}

/**
 * Verifies the account is a member of the given federation and returns its
 * federation-level role. super_admin is implicitly a member of every federation.
 * Never trust a federation_id from client input without going through this check.
 */
export async function requireFederationMembership(
  account: SessionAccount,
  federationId: string,
): Promise<FederationRole> {
  // 'admin' isn't federation-scoped at all (it's scoped by insurance type instead) — it
  // gets the same full access here as super_admin; callers that need to further restrict
  // it by category (e.g. federations.ts's assigned_products) do so separately.
  if (account.role === 'super_admin' || account.role === 'admin') {
    return 'director';
  }

  if (account.role !== 'federation_secretary' && account.role !== 'federation_director') {
    throw new AuthError(403, 'forbidden');
  }

  const result = await pool.query<{ role: FederationRole }>(
    `SELECT role FROM federation_users WHERE account_id = $1 AND federation_id = $2`,
    [account.id, federationId],
  );

  const membership = result.rows[0];
  if (!membership) {
    throw new AuthError(403, 'forbidden');
  }

  return membership.role;
}

/** Verifies the account may access financial data for the given federation. */
export async function requireFederationFinanceAccess(
  account: SessionAccount,
  federationId: string,
): Promise<void> {
  const membershipRole = await requireFederationMembership(account, federationId);
  if (membershipRole !== 'director') {
    throw new AuthError(403, 'forbidden');
  }
}

/** Verifies the account (athlete or super_admin) may access the given person's data. */
export function requireOwnPerson(account: SessionAccount, personId: string): void {
  if (account.role === 'super_admin') {
    return;
  }

  if (account.role !== 'athlete' || account.person_id !== personId) {
    throw new AuthError(403, 'forbidden');
  }
}

/**
 * Read-API collection guard: super_admin sees everything (returns null = no filter),
 * federation_secretary/federation_director are scoped to the federations they belong
 * to (returns their federation_id list, possibly empty). 'admin' is not federation-scoped
 * at all — it's restricted by insurance type instead (see modules/auth/insurance-access.ts),
 * so it is treated as unrestricted on this dimension, same as super_admin. Any other role
 * (athlete, guardian) is denied outright with 403.
 */
export async function getAccessibleFederationIds(account: SessionAccount): Promise<string[] | null> {
  if (account.role === 'super_admin' || account.role === 'admin') {
    return null;
  }

  if (account.role !== 'federation_secretary' && account.role !== 'federation_director') {
    throw new AuthError(403, 'forbidden');
  }

  const result = await pool.query<{ federation_id: string }>(
    `SELECT federation_id FROM federation_users WHERE account_id = $1`,
    [account.id],
  );

  return result.rows.map((row) => row.federation_id);
}

/** Whether the account may see federation-level financial aggregates (paid_amount_kopecks, policy_count, application_count). */
export function isFinanceAllowed(role: string): boolean {
  return role === 'super_admin' || role === 'federation_director' || role === 'admin';
}

/**
 * Per-record access rule shared by the applications/payments/policies read and write
 * routes: super_admin sees everything, an athlete may access only a record belonging
 * to their own person_id, federation staff are scoped to their federations (unchanged
 * behavior, via getAccessibleFederationIds), and 'admin' is scoped to its assigned
 * insurance types (via getAccessibleCategories) instead of any federation — callers
 * must pass the record's product category for that branch to work.
 */
export async function assertApplicationRecordAccess(
  account: SessionAccount,
  record: { federationId: string | null; personId: string | null; category?: string | null },
): Promise<void> {
  if (account.role === 'super_admin') {
    return;
  }

  if (account.role === 'athlete') {
    if (!account.person_id || account.person_id !== record.personId) {
      throw new AuthError(403, 'forbidden');
    }
    return;
  }

  if (account.role === 'admin') {
    const categories = await getAccessibleCategories(account);
    if (categories !== null && (!record.category || !categories.includes(record.category))) {
      throw new AuthError(403, 'forbidden');
    }
    return;
  }

  const federationIds = await getAccessibleFederationIds(account);
  if (!record.federationId || !federationIds?.includes(record.federationId)) {
    throw new AuthError(403, 'forbidden');
  }
}
