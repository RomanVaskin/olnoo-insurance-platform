/**
 * Private local storage for generated policy PDFs.
 *
 * Same pattern as ../documents/storage.ts: files live outside the repo and
 * outside any web root, never publicly reachable via Nginx or a static
 * route. The only access path is the authenticated GET /api/policies/:id/pdf
 * route. Filenames are keyed by policy id (already an unguessable UUID and
 * already access-checked by that route), so regenerating a policy's PDF
 * overwrites the same file instead of leaking old copies.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const POLICIES_DIR = process.env.POLICIES_DIR || '/var/lib/olnoo-insurance/policies';

/** Writes the PDF bytes under `<policyId>.pdf` and returns that filename (as stored in policies.policy_url). */
export async function savePolicyPdfFile(policyId: string, bytes: Buffer | Uint8Array): Promise<string> {
  await fs.mkdir(POLICIES_DIR, { recursive: true, mode: 0o700 });
  const filename = `${policyId}.pdf`;
  await fs.writeFile(path.join(POLICIES_DIR, filename), bytes, { mode: 0o600 });
  return filename;
}

export function policyPdfFilePath(filename: string): string {
  return path.join(POLICIES_DIR, filename);
}
