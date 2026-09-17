/**
 * Private local storage for uploaded documents (passports, birth certificates, ...).
 *
 * Files are kept outside the repository and outside any web root, under random
 * UUID filenames — never the original filename, never publicly reachable via
 * Nginx or a static route. The only access path is the authenticated
 * GET /api/documents/:id/file route.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DOCUMENTS_DIR = process.env.DOCUMENTS_DIR || '/var/lib/olnoo-insurance/documents';
const STORED_FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\.(?:jpe?g|png|webp|pdf))?$/i;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

function safeExtension(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase();
  return ext in MIME_BY_EXTENSION ? ext : '';
}

/** Writes the buffer under a fresh UUID filename and returns that filename (not a path or URL). */
export async function saveDocumentFile(buffer: Buffer, originalname: string): Promise<string> {
  await fs.mkdir(DOCUMENTS_DIR, { recursive: true, mode: 0o700 });
  const filename = `${crypto.randomUUID()}${safeExtension(originalname)}`;
  await fs.writeFile(path.join(DOCUMENTS_DIR, filename), buffer, { mode: 0o600 });
  return filename;
}

/** Resolves a stored filename (as saved in documents.file_url) to its absolute path on disk. */
export function documentFilePath(filename: string): string {
  if (!STORED_FILENAME_RE.test(filename) || path.basename(filename) !== filename) {
    throw new Error('invalid_document_filename');
  }
  return path.join(DOCUMENTS_DIR, filename);
}

/** Removes a freshly saved file when its matching database insert cannot be completed. */
export async function removeDocumentFile(filename: string): Promise<void> {
  await fs.rm(documentFilePath(filename), { force: true });
}

/**
 * Moves a file out of its live name before a database delete commits. The caller can
 * restore it on rollback, so a failed delete never leaves a live row without a file.
 */
export async function quarantineDocumentFile(filename: string): Promise<{ remove: () => Promise<void>; restore: () => Promise<void> }> {
  const livePath = documentFilePath(filename);
  const quarantinePath = path.join(DOCUMENTS_DIR, `.${filename}.${crypto.randomUUID()}.delete`);
  await fs.rename(livePath, quarantinePath);
  return {
    remove: () => fs.rm(quarantinePath, { force: true }),
    restore: () => fs.rename(quarantinePath, livePath),
  };
}

export function documentContentType(filename: string): string {
  return MIME_BY_EXTENSION[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
}
