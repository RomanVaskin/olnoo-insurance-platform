import crypto from 'node:crypto';
import type { FastifyReply } from 'fastify';
import { pool } from '../../db/pool';

export const SESSION_COOKIE_NAME = 'olnoo_insurance_session';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionAccount {
  id: string;
  person_id: string | null;
  email: string | null;
  role: string;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(accountId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await pool.query(
    `INSERT INTO auth_sessions (account_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [accountId, tokenHash, expiresAt],
  );

  return { token, expiresAt };
}

export async function getAccountBySessionToken(token: string): Promise<SessionAccount | null> {
  const tokenHash = hashToken(token);
  const result = await pool.query<SessionAccount>(
    `SELECT a.id, a.person_id, a.email, a.role
     FROM auth_sessions s
     JOIN accounts a ON a.id = s.account_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND a.status = 'active'`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await pool.query(`DELETE FROM auth_sessions WHERE token_hash = $1`, [tokenHash]);
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: false,
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}
