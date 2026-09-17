import crypto from 'node:crypto';

/**
 * Encrypts payment-profile secrets (e.g. a YooKassa secret key) at rest using
 * AES-256-GCM, keyed by the server-only PAYMENT_SECRETS_ENCRYPTION_KEY env var.
 *
 * Stored payload format: "v1:<iv_base64>:<authTag_base64>:<ciphertext_base64>".
 * The version prefix lets a future algorithm/format change coexist with old rows.
 *
 * Fails closed: any call with a missing/malformed key throws SecretsEncryptionError
 * rather than falling back to an unencrypted or weakly-derived key.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12; // standard GCM nonce size
const FORMAT_VERSION = 'v1';

export class SecretsEncryptionError extends Error {}

function loadKey(): Buffer {
  const raw = process.env.PAYMENT_SECRETS_ENCRYPTION_KEY;
  if (!raw || raw.trim() === '') {
    throw new SecretsEncryptionError('PAYMENT_SECRETS_ENCRYPTION_KEY is not set');
  }

  const trimmed = raw.trim();
  // Accept hex (64 chars) or base64 encoding of the 32-byte key. Reject anything
  // that doesn't decode to exactly 32 bytes instead of silently padding/truncating.
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'base64');

  if (key.length !== KEY_LENGTH_BYTES) {
    throw new SecretsEncryptionError(
      `PAYMENT_SECRETS_ENCRYPTION_KEY must decode to ${KEY_LENGTH_BYTES} bytes (got ${key.length})`,
    );
  }

  return key;
}

/** True iff the encryption key is present and well-formed — check before accepting a secret for storage. */
export function isSecretsEncryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypts a plaintext secret for storage. Never logs its input or output. */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [FORMAT_VERSION, iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Decrypts a payload produced by encryptSecret. Throws on tampering, wrong key, or an unrecognized format. */
export function decryptSecret(payload: string): string {
  const key = loadKey();
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new SecretsEncryptionError('unrecognized secret payload format');
  }

  const [, ivPart, authTagPart, ciphertextPart] = parts;
  const iv = Buffer.from(ivPart, 'base64');
  const authTag = Buffer.from(authTagPart, 'base64');
  const ciphertext = Buffer.from(ciphertextPart, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
