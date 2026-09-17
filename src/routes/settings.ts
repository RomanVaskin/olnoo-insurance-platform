import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../modules/auth/guards';
import { getYookassaAccountInfo, YookassaError } from '../modules/payments/yookassa';

/** Masks a shop id for display, keeping only the last 4 characters, e.g. "****1234". */
function maskShopId(shopId: string): string {
  if (shopId.length <= 4) {
    return '*'.repeat(shopId.length);
  }
  return `****${shopId.slice(-4)}`;
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
}
