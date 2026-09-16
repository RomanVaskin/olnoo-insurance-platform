/**
 * Template layout coordinates, ported unchanged from the legacy Sportpolis
 * generator (olnoo-docs-bot/services/policies.ts). These are calibrated to
 * the pixel layout of templates/reso.pdf and templates/individual.pdf — do
 * not adjust without re-checking against the actual template files.
 */

export const RESO_COORDINATES = {
  policyNumber: { x: 190, y: 759, width: 105, size: 8.5 },
  policyDate: { x: 310, y: 759, width: 72, size: 8.5 },
  fullName: { x: 183, y: 718, width: 348, size: 8.5 },
  birthDate: { x: 183, y: 706, width: 120, size: 8.2 },
  document: { x: 183, y: 691, width: 250, size: 8.2 },
  policyStartDate: { x: 200, y: 660, width: 80, size: 8.2 },
  policyEndDate: { x: 300, y: 660, width: 80, size: 8.2 },
  sport: { x: 183, y: 548, width: 348, size: 8.5 },
  insuranceAmountDeath: { x: 472, y: 495, width: 62, size: 8.2 },
  insuranceAmountDisability: { x: 472, y: 448, width: 62, size: 8.2 },
  insuranceAmountInjury: { x: 472, y: 396, width: 62, size: 8.2 },
} as const;

export const INDIVIDUAL_COORDINATES = {
  policyNumber: { x: 327, y: 802, width: 92, size: 8.8, minSize: 7 },
  fio: { x: 25, y: 667, width: 195, size: 6.6, minSize: 5 },
  birthDate: { x: 226, y: 667, width: 68, size: 6.2, minSize: 5 },
  fioTable: { x: 25, firstRowY: 565, rowStep: 7.2, width: 72, size: 5.7, minSize: 4.3 },
  policyStartDate: { x: 306, y: 460, width: 43, size: 5.4, minSize: 4.8 },
  policyEndDate: { x: 354, y: 460, width: 43, size: 5.4, minSize: 4.8 },
  paymentDate: { x: 272, y: 424, width: 48, size: 5.4, minSize: 4.8 },
  contractDate: { x: 466, y: 132, width: 54, size: 6.4, minSize: 5.5 },
} as const;
