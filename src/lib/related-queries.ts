/** Small reusable lookups shared by the applications/policies routes. */
import { pool } from '../db/pool';
import { toNumber } from './api-helpers';

export interface PaymentSummary {
  id: string;
  provider: string;
  provider_payment_id: string;
  amount_kopecks: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

/** Returns the most recent payment attempt for an application, or null. */
export async function getLatestPaymentForApplication(applicationId: string): Promise<PaymentSummary | null> {
  const result = await pool.query(
    `SELECT id, provider, provider_payment_id, amount_kopecks, currency, status, paid_at, created_at
     FROM payments
     WHERE application_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [applicationId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    provider: row.provider,
    provider_payment_id: row.provider_payment_id,
    amount_kopecks: toNumber(row.amount_kopecks),
    currency: row.currency,
    status: row.status,
    paid_at: row.paid_at,
    created_at: row.created_at,
  };
}

export interface PolicySummary {
  id: string;
  policy_number: string;
  status: string;
  valid_from: string;
  valid_to: string;
  policy_url: string | null;
}

/** Returns the policy issued for an application, or null (policies.application_id is unique). */
export async function getPolicyForApplication(applicationId: string): Promise<PolicySummary | null> {
  const result = await pool.query(
    `SELECT id, policy_number, status, valid_from, valid_to, policy_url
     FROM policies
     WHERE application_id = $1`,
    [applicationId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    policy_number: row.policy_number,
    status: row.status,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    policy_url: row.policy_url,
  };
}
