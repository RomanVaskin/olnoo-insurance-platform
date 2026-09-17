import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { authenticate, requireRole } from '../modules/auth/guards';
import { getYookassaAccountInfo, YookassaError } from '../modules/payments/yookassa';
import { encryptSecret, isSecretsEncryptionConfigured } from '../modules/crypto/secrets';
import { assertUuid, BadRequestError, NotFoundError } from '../lib/api-helpers';

/** Masks a shop id for display, keeping only the last 4 characters, e.g. "****1234". */
function maskShopId(shopId: string): string {
  if (shopId.length <= 4) {
    return '*'.repeat(shopId.length);
  }
  return `****${shopId.slice(-4)}`;
}

const PROVIDER_VALUES = ['yookassa'];
const STATUS_VALUES = ['active', 'inactive'];
// Mirrors insurance_products.category / admin_insurance_access.insurance_type.
const INSURANCE_TYPE_VALUES = ['sport', 'travel', 'health', 'auto', 'property', 'business'];

function mapPaymentAccountRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    shop_id_masked: maskShopId(row.shop_id as string),
    secret_configured: row.secret_key_encrypted !== null,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function assertProvider(value: unknown): string {
  if (typeof value !== 'string' || !PROVIDER_VALUES.includes(value)) {
    throw new BadRequestError('invalid_provider');
  }
  return value;
}

function assertProfileName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError('name_required');
  }
  return value.trim();
}

function assertShopId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError('shop_id_required');
  }
  return value.trim();
}

function assertProfileStatus(value: unknown): string {
  if (typeof value !== 'string' || !STATUS_VALUES.includes(value)) {
    throw new BadRequestError('invalid_status');
  }
  return value;
}

function assertNullableSecretKey(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError('invalid_secret_key');
  }
  return value;
}

function assertInsuranceType(value: unknown): string {
  if (typeof value !== 'string' || !INSURANCE_TYPE_VALUES.includes(value)) {
    throw new BadRequestError('invalid_insurance_type');
  }
  return value;
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // Read-only snapshot of the payment provider configuration. Never returns
  // YOOKASSA_SECRET_KEY; the shop id is masked server-side.
  app.get('/api/settings/payments', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);

    const shopId = process.env.YOOKASSA_SHOP_ID || null;
    const secretKeyConfigured = Boolean(process.env.YOOKASSA_SECRET_KEY);
    const configured = Boolean(shopId) && secretKeyConfigured;

    return reply.status(200).send({
      provider: 'yookassa',
      configured,
      shop_id_masked: shopId ? maskShopId(shopId) : null,
      secret_key_configured: secretKeyConfigured,
      mode: configured ? 'live' : 'not_configured',
      webhook_configured: false,
    });
  });

  // Harmless connectivity check against YooKassa's account-info endpoint
  // (GET /v3/me). Does not create or modify a payment and never touches credentials.
  app.post('/api/settings/payments/test', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);

    if (!process.env.YOOKASSA_SHOP_ID || !process.env.YOOKASSA_SECRET_KEY) {
      return reply.status(200).send({ ok: false, reason: 'not_configured' });
    }

    try {
      const info = await getYookassaAccountInfo();
      return reply.status(200).send({
        ok: true,
        account_id: info.account_id ?? null,
        test_mode: info.test ?? null,
      });
    } catch (error) {
      const reason = error instanceof YookassaError ? error.message : 'unknown_error';
      return reply.status(200).send({ ok: false, reason });
    }
  });

  // Payment profiles (payment_accounts) — reusable YooKassa (etc.) shop credentials.
  // super_admin only for all four; secret_key_encrypted / decrypted secrets never
  // leave the server — every response here is masked/boolean only.

  app.get('/api/settings/payment-accounts', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);

    const result = await pool.query(
      `SELECT id, provider, name, shop_id, secret_key_encrypted, status, created_at, updated_at
       FROM payment_accounts ORDER BY created_at DESC`,
    );
    return reply.status(200).send(result.rows.map(mapPaymentAccountRow));
  });

  app.post<{
    Body: { provider?: unknown; name?: unknown; shop_id?: unknown; secret_key?: unknown; status?: unknown };
  }>('/api/settings/payment-accounts', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);

    const body = request.body ?? {};
    const provider = assertProvider(body.provider);
    const name = assertProfileName(body.name);
    const shopId = assertShopId(body.shop_id);
    const secretKey = assertNullableSecretKey(body.secret_key);
    const status = body.status === undefined ? 'active' : assertProfileStatus(body.status);

    if (secretKey && !isSecretsEncryptionConfigured()) {
      throw new BadRequestError('secrets_encryption_not_configured');
    }
    const secretKeyEncrypted = secretKey ? encryptSecret(secretKey) : null;

    const result = await pool.query(
      `INSERT INTO payment_accounts (provider, name, shop_id, secret_key_encrypted, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, provider, name, shop_id, secret_key_encrypted, status, created_at, updated_at`,
      [provider, name, shopId, secretKeyEncrypted, status],
    );

    return reply.status(201).send(mapPaymentAccountRow(result.rows[0]));
  });

  app.patch<{
    Params: { id: string };
    Body: { name?: unknown; shop_id?: unknown; secret_key?: unknown; status?: unknown };
  }>('/api/settings/payment-accounts/:id', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);
    assertUuid(request.params.id);

    const body = request.body ?? {};
    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) {
      values.push(assertProfileName(body.name));
      updates.push(`name = $${values.length}`);
    }
    if (body.shop_id !== undefined) {
      values.push(assertShopId(body.shop_id));
      updates.push(`shop_id = $${values.length}`);
    }
    if (body.secret_key !== undefined) {
      const secretKey = assertNullableSecretKey(body.secret_key);
      if (secretKey && !isSecretsEncryptionConfigured()) {
        throw new BadRequestError('secrets_encryption_not_configured');
      }
      values.push(secretKey ? encryptSecret(secretKey) : null);
      updates.push(`secret_key_encrypted = $${values.length}`);
    }
    if (body.status !== undefined) {
      values.push(assertProfileStatus(body.status));
      updates.push(`status = $${values.length}`);
    }

    if (updates.length === 0) {
      throw new BadRequestError('no_fields_to_update');
    }

    values.push(request.params.id);

    const result = await pool.query(
      `UPDATE payment_accounts SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${values.length}
       RETURNING id, provider, name, shop_id, secret_key_encrypted, status, created_at, updated_at`,
      values,
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError('payment_account_not_found');
    }

    return reply.status(200).send(mapPaymentAccountRow(row));
  });

  // Payment routing (payment_routing) — which profile applies to a product /
  // federation / insurance type, precedence product > federation > insurance_type >
  // default. super_admin only. Never accepted from a checkout request — see
  // src/modules/payments/routing.ts, the only place that actually reads these rules
  // to pick a profile at payment-creation time.

  app.get('/api/settings/payment-routing', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);

    const result = await pool.query(
      `SELECT pr.id, pr.insurance_type, pr.created_at,
              pa.id AS payment_account_id, pa.name AS payment_account_name,
              f.id AS federation_id, f.name AS federation_name,
              ip.id AS product_id, ip.name AS product_name
       FROM payment_routing pr
       JOIN payment_accounts pa ON pa.id = pr.payment_account_id
       LEFT JOIN federations f ON f.id = pr.federation_id
       LEFT JOIN insurance_products ip ON ip.id = pr.product_id
       ORDER BY
         CASE WHEN pr.product_id IS NOT NULL THEN 0
              WHEN pr.federation_id IS NOT NULL THEN 1
              WHEN pr.insurance_type IS NOT NULL THEN 2
              ELSE 3 END,
         pr.created_at DESC`,
    );

    return reply.status(200).send(
      result.rows.map((row) => ({
        id: row.id,
        payment_account: { id: row.payment_account_id, name: row.payment_account_name },
        target:
          row.product_id !== null
            ? { level: 'product', product: { id: row.product_id, name: row.product_name } }
            : row.federation_id !== null
              ? { level: 'federation', federation: { id: row.federation_id, name: row.federation_name } }
              : row.insurance_type !== null
                ? { level: 'insurance_type', insurance_type: row.insurance_type }
                : { level: 'default' },
        created_at: row.created_at,
      })),
    );
  });

  app.post<{
    Body: { payment_account_id?: unknown; insurance_type?: unknown; federation_id?: unknown; product_id?: unknown };
  }>('/api/settings/payment-routing', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);

    const body = request.body ?? {};
    if (typeof body.payment_account_id !== 'string') {
      throw new BadRequestError('payment_account_id_required');
    }
    assertUuid(body.payment_account_id);

    const targets = [body.insurance_type, body.federation_id, body.product_id].filter((v) => v !== undefined);
    if (targets.length > 1) {
      throw new BadRequestError('only_one_target_allowed');
    }

    const paymentAccountExists = await pool.query(`SELECT 1 FROM payment_accounts WHERE id = $1`, [
      body.payment_account_id,
    ]);
    if (paymentAccountExists.rowCount === 0) {
      throw new NotFoundError('payment_account_not_found');
    }

    let insuranceType: string | null = null;
    let federationId: string | null = null;
    let productId: string | null = null;

    if (body.insurance_type !== undefined) {
      insuranceType = assertInsuranceType(body.insurance_type);
    } else if (body.federation_id !== undefined) {
      if (typeof body.federation_id !== 'string') throw new BadRequestError('invalid_federation_id');
      assertUuid(body.federation_id);
      const exists = await pool.query(`SELECT 1 FROM federations WHERE id = $1`, [body.federation_id]);
      if (exists.rowCount === 0) throw new NotFoundError('federation_not_found');
      federationId = body.federation_id;
    } else if (body.product_id !== undefined) {
      if (typeof body.product_id !== 'string') throw new BadRequestError('invalid_product_id');
      assertUuid(body.product_id);
      const exists = await pool.query(`SELECT 1 FROM insurance_products WHERE id = $1`, [body.product_id]);
      if (exists.rowCount === 0) throw new NotFoundError('product_not_found');
      productId = body.product_id;
    }
    // If none of the three were given, this is the single optional default rule.

    let routingId: string;
    try {
      const result = await pool.query(
        `INSERT INTO payment_routing (payment_account_id, insurance_type, federation_id, product_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [body.payment_account_id, insuranceType, federationId, productId],
      );
      routingId = result.rows[0].id;
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
        throw new BadRequestError('routing_rule_already_exists_for_target');
      }
      throw error;
    }

    return reply.status(201).send({ id: routingId });
  });

  app.delete<{ Params: { id: string } }>('/api/settings/payment-routing/:id', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);
    assertUuid(request.params.id);

    const result = await pool.query(`DELETE FROM payment_routing WHERE id = $1`, [request.params.id]);
    if (result.rowCount === 0) {
      throw new NotFoundError('payment_routing_not_found');
    }

    return reply.status(200).send({ ok: true });
  });
}
