import ExcelJS from 'exceljs';

export type RawImportRow = {
  row_number: number;
  raw: Record<string, unknown>;
};

/**
 * Reads the first worksheet of an .xlsx buffer as a header row + data rows.
 * Header names are matched exactly as written (trimmed); a row with every
 * cell empty is skipped (common trailing-blank-row artifact from Excel).
 */
export async function parseWorkbook(buffer: Buffer): Promise<{ headers: string[]; rows: RawImportRow[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { headers: [], rows: [] };
  }

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cellText(cell.value) ?? '').trim();
  });

  const rows: RawImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const raw: Record<string, unknown> = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      // Normalized to a JSON-safe primitive here (never a Date instance) so `raw` survives
      // the preview-response -> commit-request round trip unchanged: JSON has no Date type,
      // so an un-normalized Date would silently turn into a full ISO timestamp string on the
      // way back, which the row validators' plain YYYY-MM-DD date parsing would then reject.
      const value = cell.value instanceof Date ? formatDateOnly(cell.value) : cellText(cell.value) ?? cell.value;
      raw[header] = value;
      if (value !== null && value !== undefined && value !== '') hasValue = true;
    });

    if (hasValue) {
      rows.push({ row_number: rowNumber, raw });
    }
  });

  return { headers, rows };
}

function formatDateOnly(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Unwraps ExcelJS rich-text / formula-result cell values down to a plain scalar. */
function cellText(value: ExcelJS.CellValue): string | number | boolean | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray((value as { richText: { text: string }[] }).richText)) {
      return (value as { richText: { text: string }[] }).richText.map((part) => part.text).join('');
    }
    if ('result' in value) {
      return cellText((value as { result: ExcelJS.CellValue }).result);
    }
    if ('text' in value) {
      return String((value as { text: unknown }).text);
    }
    return null;
  }
  return value as string | number | boolean;
}

export type TemplateColumn = { header: string; example?: string | number };

export async function buildTemplateWorkbook(columns: TemplateColumn[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Данные');
  sheet.addRow(columns.map((c) => c.header));
  sheet.addRow(columns.map((c) => c.example ?? ''));
  sheet.columns = columns.map(() => ({ width: 22 }));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
