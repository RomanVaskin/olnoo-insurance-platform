/**
 * Maps platform entities (policies + persons + insurance_products + documents +
 * federation_memberships) to the input shape the legacy PDF templates expect.
 * This is the only place that reads DB rows for PDF generation — Core stays
 * unaware of any specific insurer's field layout.
 */

import { pool } from '../../db/pool';
import { formatRuDate } from './date';
import type { PolicyParticipant, PolicyPdfContext } from './templates';

export type InsurerCode = 'reso' | 'ingos';

export class PolicyGenerationDataError extends Error {}
export class UnsupportedInsurerError extends Error {}

export interface PolicyGenerationInput {
  insurer: InsurerCode;
  context: PolicyPdfContext;
  participant: PolicyParticipant;
}

interface PolicyRow {
  policy_number: string;
  valid_from: string | Date;
  valid_to: string | Date;
  policy_created_at: string | Date;
  federation_id: string | null;
  person_id: string;
  last_name: string;
  first_name: string;
  patronymic: string | null;
  birthdate: string | Date | null;
  product_name: string;
  insurer_name: string | null;
  coverage_amount_kopecks: string | null;
}

interface ExtractedPassportData {
  passportSeries?: string;
  passportNumber?: string;
}

/**
 * insurance_products has no dedicated insurer-code column (DATABASE.md only
 * lists free-text `insurer_name`), so the template is selected by matching
 * that name. Any product whose insurer isn't РЕСО or Ингосстрах has no PDF
 * template yet — this is a real MVP gap, not a bug.
 */
function resolveInsurer(insurerName: string | null): InsurerCode {
  const normalized = (insurerName || '').toLowerCase();
  if (normalized.includes('рес')) {
    return 'reso';
  }
  if (normalized.includes('ингос')) {
    return 'ingos';
  }
  throw new UnsupportedInsurerError(`Нет PDF-шаблона для страховщика продукта: ${insurerName ?? '(не указан)'}`);
}

export async function loadPolicyGenerationInput(policyId: string): Promise<PolicyGenerationInput> {
  const policyResult = await pool.query<PolicyRow>(
    `SELECT
       pol.policy_number, pol.valid_from, pol.valid_to, pol.created_at AS policy_created_at, pol.federation_id,
       p.id AS person_id, p.last_name, p.first_name, p.patronymic, p.birthdate,
       ip.name AS product_name, ip.insurer_name, ip.coverage_amount_kopecks
     FROM policies pol
     JOIN persons p ON p.id = pol.person_id
     JOIN insurance_products ip ON ip.id = pol.product_id
     WHERE pol.id = $1`,
    [policyId],
  );

  const row = policyResult.rows[0];
  if (!row) {
    throw new PolicyGenerationDataError('policy_not_found');
  }

  const insurer = resolveInsurer(row.insurer_name);

  const [sportResult, passportResult] = await Promise.all([
    row.federation_id
      ? pool.query<{ sport_name: string | null }>(
          `SELECT sport_name FROM federation_memberships WHERE person_id = $1 AND federation_id = $2 LIMIT 1`,
          [row.person_id, row.federation_id],
        )
      : Promise.resolve({ rows: [] as Array<{ sport_name: string | null }> }),
    pool.query<{ extracted_data: ExtractedPassportData | null }>(
      `SELECT extracted_data FROM documents
       WHERE person_id = $1 AND type = 'passport' AND extracted_data IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [row.person_id],
    ),
  ]);

  // Best-effort discipline: federation membership's sport_name if the person
  // belongs to the policy's federation, else fall back to the product name.
  // insurance_products has no per-product "covered disciplines" field (the
  // legacy RESO generator hardcoded this text instead) — flagged as a gap.
  const sport = sportResult.rows[0]?.sport_name || row.product_name;

  // Passport data is optional here: a policy can exist without a confirmed
  // passport document yet. The template simply prints blank fields — no hard
  // requirement is enforced at this layer.
  const passport = passportResult.rows[0]?.extracted_data ?? null;

  const coverageKopecks = row.coverage_amount_kopecks ? Number(row.coverage_amount_kopecks) : 0;

  return {
    insurer,
    context: {
      policyNumber: row.policy_number,
      // policies has no dedicated "contract date" column; created_at is the
      // closest analogue to the legacy policyDate ("дата заключения договора").
      policyDate: formatRuDate(row.policy_created_at),
      policyStartDate: formatRuDate(row.valid_from),
      policyEndDate: formatRuDate(row.valid_to),
      sport,
      insuranceAmount: Math.round(coverageKopecks / 100),
    },
    participant: {
      lastName: row.last_name,
      firstName: row.first_name,
      middleName: row.patronymic || '',
      birthDate: formatRuDate(row.birthdate),
      passportSeries: passport?.passportSeries || '',
      passportNumber: passport?.passportNumber || '',
    },
  };
}
