/**
 * Low-level PDF fill/normalize helpers, ported unchanged from the legacy
 * Sportpolis policy generator (olnoo-docs-bot/services/policies.ts) — same
 * fonts, same fit-to-width text drawing, same Ghostscript normalize step.
 * Do not change visual behavior here without re-checking both templates.
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PDFFont, PDFPage, rgb, type PDFDocument } from 'pdf-lib';

const REGULAR_FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const BOLD_FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

export function ensureFonts(): void {
  if (!fs.existsSync(REGULAR_FONT_PATH)) {
    throw new Error('Не найден DejaVuSans.ttf');
  }
  if (!fs.existsSync(BOLD_FONT_PATH)) {
    throw new Error('Не найден DejaVuSans-Bold.ttf');
  }
}

export async function embedFonts(pdf: PDFDocument): Promise<{ regularFont: PDFFont; boldFont: PDFFont }> {
  const regularFont = await pdf.embedFont(fs.readFileSync(REGULAR_FONT_PATH));
  const boldFont = await pdf.embedFont(fs.readFileSync(BOLD_FONT_PATH));
  return { regularFont, boldFont };
}

export interface DrawTextFitOptions {
  x: number;
  y: number;
  width: number;
  size: number;
  minSize?: number;
}

/** Draws text at the given position, shrinking the font size until it fits `width`. */
export function drawTextFit(page: PDFPage, text: string, font: PDFFont, options: DrawTextFitOptions): void {
  let size = options.size;
  const minSize = options.minSize ?? 4;

  while (size > minSize && font.widthOfTextAtSize(text, size) > options.width) {
    size -= 0.15;
  }

  page.drawText(text, { x: options.x, y: options.y, size, font, color: rgb(0, 0, 0) });
}

/** Runs Ghostscript to flatten/normalize the pdf-lib output, matching the legacy pipeline. */
export function normalizePdf(inputPath: string, outputPath: string): void {
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  execFileSync(
    'gs',
    [
      '-q',
      '-dNOPAUSE',
      '-dBATCH',
      '-dSAFER',
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      '-dPDFSETTINGS=/prepress',
      '-dDetectDuplicateImages=true',
      '-dCompressFonts=true',
      `-sOutputFile=${outputPath}`,
      inputPath,
    ],
    { stdio: 'pipe' },
  );

  if (!fs.existsSync(outputPath)) {
    throw new Error('Ghostscript не создал финальный PDF');
  }
  if (fs.statSync(outputPath).size < 1000) {
    throw new Error('Финальный PDF повреждён');
  }
}
