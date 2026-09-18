import { pool } from '../../db/pool';
import type { SessionAccount } from './session';
import { AuthError } from './errors';

export type InsurancePermission = 'read' | 'manage';

/**
 * Which insurance types (insurance_products.category values) an account may access,
 * and at what permission. Only the 'admin' role is actually restricted by this —
 * every other role (including super_admin) is unrestricted on this dimension; their
 * access is governed by their own existing rules (federation scoping, own-person, etc).
 *
 * Returns null = unrestricted (sees/manages every insurance type). A non-null array is
 * the exact set of insurance types the account may at least read; an empty array means
 * an 'admin' account with zero grants — sees nothing until a super_admin assigns one.
 */
export async function getAccessibleCategories(account: SessionAccount): Promise<string[] | null> {
  if (account.role !== 'admin') {
    return null;
  }

  const result = await pool.query<{ insurance_type: string }>(
    `SELECT insurance_type FROM admin_insurance_access WHERE account_id = $1`,
    [account.id],
  );
  return result.rows.map((row) => row.insurance_type);
}

/** The account's exact permission for one insurance type, or null if it has none. */
export async function getCategoryPermission(
  account: SessionAccount,
  category: string,
): Promise<InsurancePermission | null> {
  if (account.role === 'super_admin') {
    return 'manage';
  }
  if (account.role !== 'admin') {
    return null;
  }

  const result = await pool.query<{ permission: InsurancePermission }>(
    `SELECT permission FROM admin_insurance_access WHERE account_id = $1 AND insurance_type = $2`,
    [account.id, category],
  );
  return result.rows[0]?.permission ?? null;
}

/**
 * Federations that currently have at least one federation_products assignment (any
 * status) whose product category is in `categories`. Federations and athletes have no
 * category column of their own, so an 'admin' account's visibility into those two
 * entities is derived through this join instead — used by federations.ts and
 * athletes.ts to keep "must not see federations/athletes outside assigned insurance
 * types" true for those two entities too, not just the directly-categorized ones
 * (products, applications, policies, payments).
 */
export async function getFederationIdsForCategories(categories: string[]): Promise<string[]> {
  if (categories.length === 0) {
    return [];
  }
  const result = await pool.query<{ federation_id: string }>(
    `SELECT DISTINCT fp.federation_id
     FROM federation_products fp
     JOIN insurance_products ip ON ip.id = fp.product_id
     WHERE ip.category = ANY($1::text[])`,
    [categories],
  );
  return result.rows.map((row) => row.federation_id);
}

/**
 * Write-access guard for anything scoped to a single insurance type (products,
 * federation_products assignments, policy PDF generation, payment creation, …):
 * super_admin always passes; 'admin' passes only with an explicit 'manage' row for
 * `category`; every other role is denied here (their writes, if any, are governed by
 * their own existing role/federation guards elsewhere, not this one).
 */
export async function requireCategoryManage(account: SessionAccount, category: string): Promise<void> {
  if (account.role === 'super_admin') {
    return;
  }
  if (account.role !== 'admin') {
    throw new AuthError(403, 'forbidden');
  }

  const permission = await getCategoryPermission(account, category);
  if (permission !== 'manage') {
    throw new AuthError(403, 'forbidden');
  }
}

/** Whether this account is the sport-scoped operational administrator. */
export async function canManageSport(account: SessionAccount): Promise<boolean> {
  if (account.role === 'super_admin') return true;
  return (await getCategoryPermission(account, 'sport')) === 'manage';
}

/** Requires read or manage access to the sport operational domain. */
export async function requireSportAccess(account: SessionAccount): Promise<void> {
  if ((await getCategoryPermission(account, 'sport')) === null) {
    throw new AuthError(403, 'forbidden');
  }
}

/** Requires operational management rights for the sport vertical. */
export async function requireSportManage(account: SessionAccount): Promise<void> {
  if (!(await canManageSport(account))) {
    throw new AuthError(403, 'forbidden');
  }
}

/** Confirms that a federation participates in the sport vertical. */
export async function federationHasCategory(federationId: string, category: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1
     FROM federation_products fp
     JOIN insurance_products ip ON ip.id = fp.product_id
     WHERE fp.federation_id = $1 AND ip.category = $2
     LIMIT 1`,
    [federationId, category],
  );
  return result.rowCount === 1;
}
