import { pool } from '../../db/pool';
import { decryptSecret } from '../crypto/secrets';
import type { YookassaCredentials } from './yookassa';

export type ResolvedPaymentCredentials = YookassaCredentials & {
  source: 'profile' | 'env';
  paymentAccountId: string | null;
};

/**
 * Resolves which payment profile (payment_accounts, via payment_routing) applies to a
 * purchase, with precedence product > federation > insurance_type > default — derived
 * purely from row specificity (see db/migrations/004_admin_hierarchy_and_payments.sql).
 *
 * Falls back to the env-based YOOKASSA_SHOP_ID/YOOKASSA_SECRET_KEY whenever no rule
 * matches, or the matched profile has no secret set yet — the existing working checkout
 * must never break while payment profiles are being migrated in (see task notes).
 *
 * Never accepts a payment_account_id from the client — this is the only place that
 * decides which credentials a purchase uses, driven entirely by server-known
 * product/federation/category values.
 */
export async function resolvePaymentCredentials(target: {
  productId: string;
  federationId: string | null;
  category: string;
}): Promise<ResolvedPaymentCredentials> {
  const result = await pool.query<{
    id: string;
    shop_id: string;
    secret_key_encrypted: string | null;
  }>(
    `SELECT pa.id, pa.shop_id, pa.secret_key_encrypted
     FROM payment_routing pr
     JOIN payment_accounts pa ON pa.id = pr.payment_account_id
     WHERE pa.status = 'active'
       AND (
         pr.product_id = $1
         OR pr.federation_id = $2
         OR pr.insurance_type = $3
         OR (pr.product_id IS NULL AND pr.federation_id IS NULL AND pr.insurance_type IS NULL)
       )
     ORDER BY
       CASE
         WHEN pr.product_id = $1 THEN 0
         WHEN pr.federation_id = $2 THEN 1
         WHEN pr.insurance_type = $3 THEN 2
         ELSE 3
       END
     LIMIT 1`,
    [target.productId, target.federationId, target.category],
  );

  const row = result.rows[0];
  if (row?.secret_key_encrypted) {
    return {
      shopId: row.shop_id,
      secretKey: decryptSecret(row.secret_key_encrypted),
      source: 'profile',
      paymentAccountId: row.id,
    };
  }

  return envCredentials();
}

function envCredentials(): ResolvedPaymentCredentials {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    throw new Error('no_payment_credentials_available');
  }
  return { shopId, secretKey, source: 'env', paymentAccountId: null };
}

/**
 * Re-resolves the *exact* credentials a payment was created with, by its stored
 * payments.payment_account_id (NULL = it used the env fallback at creation time).
 * Used by the status-check route — re-running routing there could pick a different
 * profile if the rules changed since, and querying YooKassa needs the same shop the
 * payment actually lives under.
 */
export async function getCredentialsForPaymentAccount(paymentAccountId: string | null): Promise<YookassaCredentials> {
  if (!paymentAccountId) {
    return envCredentials();
  }

  const result = await pool.query<{ shop_id: string; secret_key_encrypted: string | null }>(
    `SELECT shop_id, secret_key_encrypted FROM payment_accounts WHERE id = $1`,
    [paymentAccountId],
  );
  const row = result.rows[0];
  if (!row?.secret_key_encrypted) {
    throw new Error('payment_account_credentials_unavailable');
  }
  return { shopId: row.shop_id, secretKey: decryptSecret(row.secret_key_encrypted) };
}
