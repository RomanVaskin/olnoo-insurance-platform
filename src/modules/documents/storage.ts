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
  return path.join(DOCUMENTS_DIR, filename);
}

export function documentContentType(filename: string): string {
  return MIME_BY_EXTENSION[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
}
