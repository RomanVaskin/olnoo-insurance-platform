/**
 * Universal policy PDF generator entry point. Template + structured data ->
 * PDF (see ARCHITECTURE.md "Policy generation"). Reused by every insurer;
 * insurer-specific layout lives only in templates.ts/coordinates.ts.
 */

import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { pool } from '../../db/pool';
import { normalizePdf } from './pdf';
import { fillIndividualTemplate, fillResoTemplate } from './templates';
import { loadPolicyGenerationInput, PolicyGenerationDataError, UnsupportedInsurerError, type InsurerCode } from './mapping';
import { savePolicyPdfFile } from './storage';

export { PolicyGenerationDataError, UnsupportedInsurerError };

export interface GeneratePolicyPdfResult {
  policyId: string;
  insurer: InsurerCode;
  policyUrl: string;
}

export async function generatePolicyPdf(policyId: string): Promise<GeneratePolicyPdfResult> {
  const input = await loadPolicyGenerationInput(policyId);

  const rawBytes =
    input.insurer === 'reso'
      ? await fillResoTemplate(input.context, input.participant)
      : await fillIndividualTemplate(input.context, input.participant);

  const rawPath = path.join(os.tmpdir(), `policy-${policyId}-${crypto.randomUUID()}-raw.pdf`);
  const normalizedPath = path.join(os.tmpdir(), `policy-${policyId}-${crypto.randomUUID()}-normalized.pdf`);

  try {
    await fs.writeFile(rawPath, rawBytes);
    normalizePdf(rawPath, normalizedPath);
    const finalBytes = await fs.readFile(normalizedPath);

    const filename = await savePolicyPdfFile(policyId, finalBytes);

    await pool.query(`UPDATE policies SET policy_url = $1, updated_at = now() WHERE id = $2`, [filename, policyId]);

    return { policyId, insurer: input.insurer, policyUrl: filename };
  } finally {
    await fs.rm(rawPath, { force: true });
    await fs.rm(normalizedPath, { force: true });
  }
}
