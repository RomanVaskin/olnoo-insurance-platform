import type { FastifyRequest } from 'fastify';
import { pool } from '../../db/pool';
import { SESSION_COOKIE_NAME, getAccountBySessionToken, type SessionAccount } from './session';

export type FederationRole = 'secretary' | 'director';

export class AuthError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

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
  if (account.role === 'super_admin') {
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
