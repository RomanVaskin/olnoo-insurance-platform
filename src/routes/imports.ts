import type { FastifyInstance } from 'fastify';
import type { MultipartFile, MultipartValue } from '@fastify/multipart';
import { pool } from '../db/pool';
import { authenticate, requireRole } from '../modules/auth/guards';
import { BadRequestError } from '../lib/api-helpers';
import { parseWorkbook } from '../modules/imports/xlsx';
import { IMPORT_TYPES, buildTemplate, type ImportType } from '../modules/imports/templates';
import {
  processFederationRows,
  commitFederationRow,
  processAthleteRows,
  commitAthleteRow,
  processProductRows,
  commitProductRow,
  processAssignmentRows,
  commitAssignmentRow,
  type ImportRowResult,
  type FederationImportRow,
  type AthleteImportRow,
  type ProductImportRow,
  type AssignmentImportRow,
} from '../modules/imports/processors';
import type { RawImportRow } from '../modules/imports/xlsx';

type MultipartBody = Record<string, MultipartFile | MultipartValue | undefined>;

function assertImportType(value: unknown): ImportType {
  if (typeof value !== 'string' || !(IMPORT_TYPES as readonly string[]).includes(value)) {
    throw new BadRequestError('invalid_import_type');
  }
  return value as ImportType;
}

async function readUpload(body: MultipartBody): Promise<{ buffer: Buffer; type: string }> {
  const filePart = body.file;
  if (!filePart || filePart.type !== 'file') {
    throw new BadRequestError('file_required');
  }
  const typePart = body.type;
  const type = typePart && typePart.type === 'field' ? String(typePart.value) : undefined;
  if (!type) {
    throw new BadRequestError('type_required');
  }

  return { buffer: await filePart.toBuffer(), type };
}

/** Dispatches a parsed workbook's rows to the right (read-only) validator for `type`. */
async function validateRows(
  db: Parameters<typeof processFederationRows>[0],
  type: ImportType,
  rows: RawImportRow[],
): Promise<ImportRowResult<unknown>[]> {
  switch (type) {
    case 'federations':
      return processFederationRows(db, rows);
    case 'athletes':
      return processAthleteRows(db, rows);
    case 'products':
      return processProductRows(db, rows);
    case 'assignments':
      return processAssignmentRows(db, rows);
  }
}

function summarize(rows: ImportRowResult<unknown>[]) {
  const valid = rows.filter((r) => r.errors.length === 0).length;
  return { total_rows: rows.length, valid_rows: valid, invalid_rows: rows.length - valid };
}

export async function importsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { type: string } }>('/api/imports/template/:type', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);
    const type = assertImportType(request.params.type);

    const buffer = await buildTemplate(type);
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${type}_template.xlsx"`)
      .status(200)
      .send(buffer);
  });

  // Parses and validates the workbook; never writes to the database. The client is
  // expected to show this to the admin and only send rows with no errors to commit.
  app.post('/api/imports/preview', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);

    const { buffer, type: rawType } = await readUpload((request.body ?? {}) as MultipartBody);
    const type = assertImportType(rawType);

    const { rows: rawRows } = await parseWorkbook(buffer);
    if (rawRows.length === 0) {
      throw new BadRequestError('empty_workbook');
    }

    const rows = await validateRows(pool, type, rawRows);

    return reply.status(200).send({
      import_type: type,
      ...summarize(rows),
      rows,
    });
  });

  // Re-validates every row from scratch inside the transaction before writing anything —
  // the client-supplied rows (an echo of what preview returned) are never trusted as-is.
  // Rows that fail re-validation (e.g. the DB changed since preview) are skipped and
  // reported as errors; the transaction only rolls back entirely on an unexpected DB error.
  app.post<{ Body: { type?: unknown; rows?: unknown } }>('/api/imports/commit', async (request, reply) => {
    const account = await authenticate(request);
    requireRole(account, ['super_admin']);

    const body = request.body ?? {};
    const type = assertImportType(body.type);

    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      throw new BadRequestError('rows_required');
    }

    // Re-validation must run against the same *raw* cell values preview validated —
    // not the normalized `data` echoed back, whose field names/units differ for several
    // import types (federation name/slug -> federation_id, rubles -> kopecks, etc).
    const rawRows: RawImportRow[] = body.rows.map((entry: unknown, index: number) => {
      const record = entry as { row_number?: unknown; raw?: unknown };
      const rowNumber = typeof record.row_number === 'number' ? record.row_number : index + 2;
      const raw = record.raw && typeof record.raw === 'object' ? (record.raw as Record<string, unknown>) : {};
      return { row_number: rowNumber, raw };
    });

    const client = await pool.connect();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: { row_number: number; errors: string[] }[] = [];

    try {
      await client.query('BEGIN');

      const revalidated = await validateRows(client, type, rawRows);

      for (const row of revalidated) {
        if (row.errors.length > 0 || !row.data) {
          skipped++;
          errors.push({ row_number: row.row_number, errors: row.errors });
          continue;
        }

        if (type === 'federations') {
          await commitFederationRow(client, row as ImportRowResult<FederationImportRow>);
        } else if (type === 'athletes') {
          await commitAthleteRow(client, row as ImportRowResult<AthleteImportRow>);
        } else if (type === 'products') {
          await commitProductRow(client, row as ImportRowResult<ProductImportRow>);
        } else {
          await commitAssignmentRow(client, row as ImportRowResult<AssignmentImportRow>);
        }

        if (row.action === 'update') updated++;
        else created++;
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return reply.status(200).send({ import_type: type, created, updated, skipped, errors });
  });
}
