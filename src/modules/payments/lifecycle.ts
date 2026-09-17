import crypto from 'node:crypto';
import { pool } from '../../db/pool';
import { generatePolicyPdf } from '../policy-generator/generator';

export type VerifiedPaymentState = 'pending' | 'paid' | 'cancelled' | 'refunded';

export interface PaymentLifecycleResult {
  paymentId: string;
  applicationId: string;
  status: VerifiedPaymentState;
  paidAt: string | null;
  policyId: string | null;
  pdfGenerated: boolean;
  pdfError: unknown | null;
}

/**
 * Applies a status that was read back from YooKassa with the credentials originally
 * used for this payment. Payment, application, and policy changes are serialized on
 * the application row, making duplicate polling/webhook delivery idempotent.
 */
export async function applyVerifiedPaymentState(
  providerPaymentId: string,
  verifiedState: VerifiedPaymentState,
): Promise<PaymentLifecycleResult | null> {
  const client = await pool.connect();
  let paymentId = '';
  let applicationId = '';
  let status: VerifiedPaymentState = verifiedState;
  let paidAt: string | null = null;
  let policyId: string | null = null;
  let shouldGeneratePdf = false;

  try {
    await client.query('BEGIN');
    const paymentResult = await client.query(
      `SELECT pay.id, pay.application_id, pay.status, pay.paid_at,
              a.person_id, a.federation_id, a.product_id,
              ip.category, ip.validity_days
       FROM payments pay
       JOIN applications a ON a.id = pay.application_id
       JOIN insurance_products ip ON ip.id = a.product_id
       WHERE pay.provider = 'yookassa' AND pay.provider_payment_id = $1
       FOR UPDATE OF pay, a`,
      [providerPaymentId],
    );
    const row = paymentResult.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }

    paymentId = row.id as string;
    applicationId = row.application_id as string;
    const currentStatus = row.status as VerifiedPaymentState;
    paidAt = row.paid_at as string | null;

    // Never regress terminal financial history because an old notification arrived late.
    if (currentStatus === 'refunded') {
      status = 'refunded';
    } else if (verifiedState === 'pending') {
      status = currentStatus;
    } else if (verifiedState === 'cancelled' && currentStatus === 'paid') {
      status = 'paid';
    }

    if (status === 'paid') {
      paidAt = paidAt ?? new Date().toISOString();
      await client.query(
        `UPDATE payments SET status = 'paid', paid_at = $1, updated_at = now() WHERE id = $2`,
        [paidAt, paymentId],
      );

      const existingPolicy = await client.query(
        `SELECT id, status, policy_url FROM policies WHERE application_id = $1`,
        [applicationId],
      );
      let policy = existingPolicy.rows[0];
      if (!policy) {
        policyId = crypto.randomUUID();
        const category = String(row.category).toUpperCase().replace(/[^A-Z0-9]+/g, '-');
        const policyNumber = `OLNOO-${category}-${policyId.toUpperCase()}`;
        const insertPolicy = await client.query(
          `INSERT INTO policies
             (id, application_id, person_id, federation_id, product_id, policy_number,
              status, valid_from, valid_to)
           VALUES ($1, $2, $3, $4, $5, $6, 'active', current_date, current_date + $7::integer)
           ON CONFLICT (application_id) DO NOTHING
           RETURNING id, status, policy_url`,
          [
            policyId,
            applicationId,
            row.person_id,
            row.federation_id,
            row.product_id,
            policyNumber,
            row.validity_days,
          ],
        );
        policy = insertPolicy.rows[0];
        if (!policy) {
          const concurrentPolicy = await client.query(
            `SELECT id, status, policy_url FROM policies WHERE application_id = $1`,
            [applicationId],
          );
          policy = concurrentPolicy.rows[0];
        }
      }

      policyId = (policy?.id as string | undefined) ?? null;
      shouldGeneratePdf = Boolean(policyId && policy.status === 'active' && !policy.policy_url);
      await client.query(
        `UPDATE applications SET status = 'policy_issued', updated_at = now() WHERE id = $1`,
        [applicationId],
      );
    } else if (status === 'refunded') {
      paidAt = paidAt ?? new Date().toISOString();
      await client.query(
        `UPDATE payments SET status = 'refunded', paid_at = $1, updated_at = now() WHERE id = $2`,
        [paidAt, paymentId],
      );

      const otherPaidPayment = await client.query(
        `SELECT 1 FROM payments WHERE application_id = $1 AND id <> $2 AND status = 'paid' LIMIT 1`,
        [applicationId, paymentId],
      );
      if (otherPaidPayment.rowCount === 0) {
        await client.query(
          `UPDATE applications SET status = 'cancelled', updated_at = now() WHERE id = $1`,
          [applicationId],
        );
        await client.query(
          `UPDATE policies SET status = 'cancelled', updated_at = now()
           WHERE application_id = $1 AND status = 'active'`,
          [applicationId],
        );
      }
    } else if (status === 'cancelled' && currentStatus === 'pending') {
      await client.query(
        `UPDATE payments SET status = 'cancelled', updated_at = now() WHERE id = $1`,
        [paymentId],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  let pdfGenerated = false;
  let pdfError: unknown | null = null;
  if (shouldGeneratePdf && policyId) {
    try {
      await generatePolicyPdf(policyId);
      pdfGenerated = true;
    } catch (error) {
      // Financial and issuance state has already committed. The same webhook/poll or
      // the existing manual action can safely retry generation without duplicating a policy.
      pdfError = error;
    }
  }

  return { paymentId, applicationId, status, paidAt, policyId, pdfGenerated, pdfError };
}
