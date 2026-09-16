/**
 * Fills the RESO and Ingosstrakh-individual PDF templates with policy data.
 * Drawing logic ported unchanged from the legacy generator; only the input
 * shape changed (platform entities instead of old Application/Participant).
 */

import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { drawTextFit, embedFonts, ensureFonts } from './pdf';
import { RESO_COORDINATES, INDIVIDUAL_COORDINATES } from './coordinates';

const TEMPLATES_DIR = path.join(__dirname, 'templates');
const RESO_TEMPLATE_PATH = path.join(TEMPLATES_DIR, 'reso.pdf');
const INDIVIDUAL_TEMPLATE_PATH = path.join(TEMPLATES_DIR, 'individual.pdf');

export interface PolicyParticipant {
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  passportSeries: string;
  passportNumber: string;
}

export interface PolicyPdfContext {
  policyNumber: string;
  policyDate: string;
  policyStartDate: string;
  policyEndDate: string;
  sport: string;
  insuranceAmount: number;
}

function fullNameLine(participant: PolicyParticipant): string {
  return [participant.lastName, participant.firstName, participant.middleName].filter(Boolean).join(' ').toUpperCase();
}

/** RESO individual (SYS) policy — templates/reso.pdf, single page. */
export async function fillResoTemplate(context: PolicyPdfContext, participant: PolicyParticipant): Promise<Uint8Array> {
  ensureFonts();
  if (!fs.existsSync(RESO_TEMPLATE_PATH)) {
    throw new Error(`Не найден шаблон РЕСО: ${RESO_TEMPLATE_PATH}`);
  }

  const pdf = await PDFDocument.load(fs.readFileSync(RESO_TEMPLATE_PATH));
  pdf.registerFontkit(fontkit);
  const { regularFont, boldFont } = await embedFonts(pdf);
  const page = pdf.getPages()[0];
  if (!page) {
    throw new Error('Шаблон reso.pdf пуст');
  }

  const document = [participant.passportSeries, participant.passportNumber].filter(Boolean).join(' ');
  const insuranceAmount = context.insuranceAmount ? context.insuranceAmount.toLocaleString('ru-RU') : '';

  const values: Array<[keyof typeof RESO_COORDINATES, string, typeof regularFont]> = [
    ['policyNumber', context.policyNumber, boldFont],
    ['policyDate', context.policyDate, regularFont],
    ['fullName', fullNameLine(participant), boldFont],
    ['birthDate', participant.birthDate, regularFont],
    ['document', document, regularFont],
    ['policyStartDate', context.policyStartDate, regularFont],
    ['policyEndDate', context.policyEndDate, regularFont],
    ['sport', context.sport, boldFont],
    ['insuranceAmountDeath', insuranceAmount, boldFont],
    ['insuranceAmountDisability', insuranceAmount, boldFont],
    ['insuranceAmountInjury', insuranceAmount, boldFont],
  ];

  for (const [key, value, font] of values) {
    drawTextFit(page, value || '', font, RESO_COORDINATES[key]);
  }

  return pdf.save({ useObjectStreams: false });
}

/** Ingosstrakh individual (VI) policy — templates/individual.pdf, page 1 of 2. */
export async function fillIndividualTemplate(context: PolicyPdfContext, participant: PolicyParticipant): Promise<Uint8Array> {
  ensureFonts();
  if (!fs.existsSync(INDIVIDUAL_TEMPLATE_PATH)) {
    throw new Error(`Не найден шаблон Ингосстраха: ${INDIVIDUAL_TEMPLATE_PATH}`);
  }

  const pdf = await PDFDocument.load(fs.readFileSync(INDIVIDUAL_TEMPLATE_PATH));
  pdf.registerFontkit(fontkit);
  const { regularFont, boldFont } = await embedFonts(pdf);
  const page = pdf.getPages()[0];
  if (!page) {
    throw new Error('Шаблон individual.pdf пуст');
  }

  const c = INDIVIDUAL_COORDINATES;

  drawTextFit(page, context.policyNumber, boldFont, c.policyNumber);
  drawTextFit(page, fullNameLine(participant), regularFont, c.fio);
  drawTextFit(page, participant.birthDate || '', regularFont, c.birthDate);

  const fioParts = [participant.lastName, participant.firstName, participant.middleName]
    .filter(Boolean)
    .map((value) => value.toUpperCase());
  let tableY = c.fioTable.firstRowY;
  for (const line of fioParts) {
    drawTextFit(page, line, regularFont, { x: c.fioTable.x, y: tableY, width: c.fioTable.width, size: c.fioTable.size, minSize: c.fioTable.minSize });
    tableY -= c.fioTable.rowStep;
  }

  drawTextFit(page, context.policyStartDate, regularFont, c.policyStartDate);
  drawTextFit(page, context.policyEndDate, regularFont, c.policyEndDate);
  drawTextFit(page, context.policyDate, regularFont, c.paymentDate);
  drawTextFit(page, context.policyDate, boldFont, c.contractDate);

  return pdf.save({ useObjectStreams: false });
}
