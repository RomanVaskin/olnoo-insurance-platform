import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { verifyPassword } from '../modules/auth/password';
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  createSession,
  deleteSessionByToken,
  getAccountBySessionToken,
  setSessionCookie,
} from '../modules/auth/session';

interface LoginBody {
  email?: string;
  password?: string;
}

interface AccountRow {
  id: string;
  person_id: string | null;
  email: string | null;
  role: string;
  password_hash: string | null;
  status: string;
}

async function toPublicAccount(account: { id: string; person_id: string | null; email: string | null; role: string }) {
  const insuranceAccess = account.role === 'admin'
    ? (await pool.query<{ insurance_type: string; permission: 'read' | 'manage' }>(
        `SELECT insurance_type, permission FROM admin_insurance_access WHERE account_id = $1 ORDER BY insurance_type`,
        [account.id],
      )).rows
    : [];
  return {
    id: account.id,
    person_id: account.person_id,
    email: account.email,
    role: account.role,
    insurance_access: insuranceAccess,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: LoginBody }>('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body ?? {};

    if (!email || !password) {
      return reply.status(401).send({ error: 'invalid_credentials' });
    }

    const result = await pool.query<AccountRow>(
      `SELECT id, person_id, email, role, password_hash, status FROM accounts WHERE email = $1`,
      [email],
    );
    const account = result.rows[0];

    if (!account || !account.password_hash || account.status !== 'active') {
      return reply.status(401).send({ error: 'invalid_credentials' });
    }

    const passwordValid = await verifyPassword(password, account.password_hash);
    if (!passwordValid) {
      return reply.status(401).send({ error: 'invalid_credentials' });
    }

    const { token, expiresAt } = await createSession(account.id);
    setSessionCookie(reply, token, expiresAt);

    await pool.query(`UPDATE accounts SET last_login_at = now() WHERE id = $1`, [account.id]);

    return reply.status(200).send({ account: await toPublicAccount(account) });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) {
      await deleteSessionByToken(token);
    }

    clearSessionCookie(reply);
    return reply.status(200).send({ status: 'ok' });
  });

  app.get('/api/auth/me', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    const account = token ? await getAccountBySessionToken(token) : null;

    if (!account) {
      return reply.status(401).send({ error: 'unauthorized' });
    }

    return reply.status(200).send({ account: await toPublicAccount(account) });
  });
}
