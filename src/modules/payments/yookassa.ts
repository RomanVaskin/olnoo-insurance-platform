/**
 * Thin client for the YooKassa Payments API (https://api.yookassa.ru/v3).
 * No SDK — plain fetch with HTTP Basic Auth (shopId:secretKey), same shape as
 * the other external-service clients in modules/ (see modules/ocr/client.ts).
 */

const API_BASE = 'https://api.yookassa.ru/v3';

export class YookassaError extends Error {}

export type YookassaPaymentStatus = 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';

export interface YookassaPayment {
  id: string;
  status: YookassaPaymentStatus;
  paid: boolean;
  confirmation?: { type: string; confirmation_url?: string };
}

function authHeader(): string {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    throw new YookassaError('yookassa_not_configured');
  }
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
}

async function parseResponse(response: Response): Promise<YookassaPayment> {
  const raw = await response.text();
  let body: (YookassaPayment & { type?: string; description?: string }) | undefined;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    throw new YookassaError(`yookassa_invalid_response: ${raw.slice(0, 500)}`);
  }

  if (!response.ok || !body) {
    const detail = body?.description ? body.description : `http_${response.status}`;
    throw new YookassaError(detail);
  }

  return body;
}

/** Creates a YooKassa payment with a redirect confirmation. amountKopecks is converted to a decimal RUB string as the API requires. */
export async function createYookassaPayment(params: {
  amountKopecks: number;
  returnUrl: string;
  description: string;
  idempotenceKey: string;
  customerEmail: string;
  metadata?: Record<string, string>;
}): Promise<YookassaPayment> {
  const value = (params.amountKopecks / 100).toFixed(2);

  // Receipt shape matches the one already used successfully against this same
  // YooKassa shop by sportpolis/sport613 — do not change without re-checking that flow.
  const receipt = {
    customer: { email: params.customerEmail },
    items: [
      {
        description: params.description,
        quantity: '1.00',
        amount: { value, currency: 'RUB' },
        vat_code: 1,
        payment_mode: 'full_payment',
        payment_subject: 'service',
      },
    ],
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Idempotence-Key': params.idempotenceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: { value, currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: params.returnUrl },
        description: params.description,
        metadata: params.metadata,
        receipt,
      }),
    });
  } catch (error) {
    throw new YookassaError(`yookassa_unreachable: ${(error as Error).message}`);
  }

  return parseResponse(response);
}

/** Fetches the current state of a YooKassa payment by its provider id. */
export async function getYookassaPayment(providerPaymentId: string): Promise<YookassaPayment> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/payments/${encodeURIComponent(providerPaymentId)}`, {
      method: 'GET',
      headers: { Authorization: authHeader() },
    });
  } catch (error) {
    throw new YookassaError(`yookassa_unreachable: ${(error as Error).message}`);
  }

  return parseResponse(response);
}

export interface YookassaAccountInfo {
  account_id?: string;
  test?: boolean;
  status?: string;
}

/**
 * Calls GET /v3/me — YooKassa's read-only account-info endpoint, the standard
 * way to verify shop credentials without creating or touching any payment.
 */
export async function getYookassaAccountInfo(): Promise<YookassaAccountInfo> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/me`, {
      method: 'GET',
      headers: { Authorization: authHeader() },
    });
  } catch (error) {
    throw new YookassaError(`yookassa_unreachable: ${(error as Error).message}`);
  }

  const raw = await response.text();
  let body: (YookassaAccountInfo & { description?: string }) | undefined;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    throw new YookassaError(`yookassa_invalid_response: ${raw.slice(0, 500)}`);
  }

  if (!response.ok || !body) {
    const detail = body?.description ? body.description : `http_${response.status}`;
    throw new YookassaError(detail);
  }

  return body;
}

/** Maps a YooKassa payment status to this platform's payments.status values. */
export function mapYookassaStatus(status: YookassaPaymentStatus): 'pending' | 'paid' | 'cancelled' {
  if (status === 'succeeded') {
    return 'paid';
  }
  if (status === 'canceled') {
    return 'cancelled';
  }
  return 'pending';
}
