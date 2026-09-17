import path from 'node:path';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { MultipartFile, MultipartValue } from '@fastify/multipart';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds } from '../modules/auth/guards';
import { getAccessibleCategories, requireCategoryManage } from '../modules/auth/insurance-access';
import type { SessionAccount } from '../modules/auth/session';
import { assertUuid, NotFoundError, HttpError, BadRequestError } from '../lib/api-helpers';
import { recognizeDocument, OcrError } from '../modules/ocr/client';
import {
  saveDocumentFile,
  removeDocumentFile,
  quarantineDocumentFile,
  documentFilePath,
  documentContentType,
} from '../modules/documents/storage';

const DOCUMENT_TYPES = new Set(['passport', 'birth_certificate', 'other']);
const MAX_EXTRACTED_DATA_BYTES = 64 * 1024;

type MultipartBody = Record<string, MultipartFile | MultipartValue | undefined>;

type DocumentAccessRow = Record<string, unknown> & {
  id: string;
  person_id: string | null;
  application_id: string | null;
  file_url: string;
  access_federation_id: string | null;
  access_category: string | null;
  policy_id: string | null;
  person_has_policy: boolean;
  application_has_payment_history: boolean;
};

const DOCUMENT_SELECT = `
  SELECT d.id, d.person_id, d.application_id, d.type, d.status, d.extracted_data, d.created_at, d.file_url,
    p.last_name AS person_last_name, p.first_name AS person_first_name, p.patronymic AS person_patronymic,
    a.status AS application_status, a.federation_id AS access_federation_id,
    ip.category AS access_category,
    pol.id AS policy_id, pol.policy_number, pol.status AS policy_status,
    EXISTS (SELECT 1 FROM policies person_pol WHERE person_pol.person_id = d.person_id) AS person_has_policy,
    EXISTS (SELECT 1 FROM payments pay WHERE pay.application_id = d.application_id
            AND (pay.status IN ('paid', 'refunded') OR pay.paid_at IS NOT NULL)) AS application_has_payment_history
  FROM documents d
  LEFT JOIN persons p ON p.id = d.person_id
  LEFT JOIN applications a ON a.id = d.application_id
  LEFT JOIN insurance_products ip ON ip.id = a.product_id
  LEFT JOIN policies pol ON pol.application_id = a.id
`;

async function readUpload(
  body: MultipartBody,
): Promise<{ buffer: Buffer; filename: string; mimetype: string; fields: Record<string, string> }> {
  const filePart = body.file;
  if (!filePart || filePart.type !== 'file') throw new BadRequestError('file_required');
  const fields: Record<string, string> = {};
  for (const [key, part] of Object.entries(body)) {
    if (part && part.type === 'field') fields[key] = String(part.value);
  }
  return { buffer: await filePart.toBuffer(), filename: filePart.filename, mimetype: filePart.mimetype, fields };
}

async function fetchDocument(id: string, client: PoolClient | typeof pool = pool): Promise<DocumentAccessRow | undefined> {
  const result = await client.query(`${DOCUMENT_SELECT} WHERE d.id = $1`, [id]);
  return result.rows[0] as DocumentAccessRow | undefined;
}

async function personFederationAccess(account: SessionAccount, personId: string): Promise<boolean> {
  const federationIds = (await getAccessibleFederationIds(account)) ?? [];
  if (federationIds.length === 0) return false;
  const result = await pool.query(
    `SELECT 1 FROM federation_memberships WHERE person_id = $1 AND federation_id = ANY($2::uuid[]) LIMIT 1`,
    [personId, federationIds],
  );
  return result.rows.length > 0;
}

async function assertDocumentReadAccess(account: SessionAccount, row: DocumentAccessRow): Promise<void> {
  if (account.role === 'super_admin') return;
  if (account.role === 'athlete' && row.person_id && account.person_id === row.person_id) return;
  if (account.role === 'admin') {
    const categories = await getAccessibleCategories(account);
    if (!row.access_category || !categories?.includes(row.access_category)) throw new HttpError(403, 'forbidden');
    return;
  }
  if (account.role === 'federation_secretary' || account.role === 'federation_director') {
    const federationIds = (await getAccessibleFederationIds(account)) ?? [];
    if (row.access_federation_id) {
      if (federationIds.includes(row.access_federation_id)) return;
      throw new HttpError(403, 'forbidden');
    }
    if (row.person_id && await personFederationAccess(account, row.person_id)) return;
  }
  throw new HttpError(403, 'forbidden');
}

async function assertDocumentManageAccess(account: SessionAccount, row: DocumentAccessRow): Promise<void> {
  if (account.role === 'super_admin') return;
  if (account.role === 'admin') {
    if (!row.access_category) throw new HttpError(403, 'forbidden');
    await requireCategoryManage(account, row.access_category);
    return;
  }
  if (account.role === 'federation_secretary' || account.role === 'federation_director') {
    await assertDocumentReadAccess(account, row);
    return;
  }
  throw new HttpError(403, 'forbidden');
}

async function assertPersonAccess(
  account: SessionAccount,
  personId: string,
  applicationId: string | null,
  write: boolean,
): Promise<DocumentAccessRow | null> {
  let application: DocumentAccessRow | null = null;
  if (applicationId) {
    const result = await pool.query(
      `SELECT a.id, a.person_id, a.id AS application_id, a.federation_id AS access_federation_id,
              ip.category AS access_category, NULL::uuid AS policy_id, '' AS file_url
       FROM applications a JOIN insurance_products ip ON ip.id = a.product_id WHERE a.id = $1`,
      [applicationId],
    );
    application = result.rows[0] as DocumentAccessRow | undefined ?? null;
    if (!application) throw new NotFoundError('application_not_found');
    if (application.person_id !== personId) throw new BadRequestError('application_person_mismatch');
  }
  if (account.role === 'super_admin') return application;
  if (account.role === 'athlete' && account.person_id === personId) return application;
  if (account.role === 'admin') {
    if (!application?.access_category) throw new HttpError(403, 'forbidden');
    if (write) await requireCategoryManage(account, application.access_category);
    else await assertDocumentReadAccess(account, application);
    return application;
  }
  if (account.role === 'federation_secretary' || account.role === 'federation_director') {
    if (application) {
      await assertDocumentReadAccess(account, application);
      return application;
    }
    if (await personFederationAccess(account, personId)) return null;
  }
  throw new HttpError(403, 'forbidden');
}

function validateExtractedData(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestError('invalid_extracted_data');
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_EXTRACTED_DATA_BYTES) {
    throw new BadRequestError('extracted_data_too_large');
  }
  return value as Record<string, unknown>;
}

function mapDocumentRow(row: DocumentAccessRow, canManage: boolean) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    extracted_data: row.extracted_data,
    created_at: row.created_at,
    can_manage: canManage,
    person: row.person_id ? {
      id: row.person_id,
      last_name: row.person_last_name,
      first_name: row.person_first_name,
      patronymic: row.person_patronymic ?? null,
    } : null,
    application: row.application_id ? { id: row.application_id, status: row.application_status } : null,
    policy: row.policy_id ? { id: row.policy_id, policy_number: row.policy_number, status: row.policy_status } : null,
  };
}

async function canManageDocument(account: SessionAccount, row: DocumentAccessRow): Promise<boolean> {
  if (!isDocumentMutable(row)) return false;
  try {
    await assertDocumentManageAccess(account, row);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && (error as { statusCode?: number }).statusCode === 403) return false;
    throw error;
  }
}

function isDocumentMutable(row: DocumentAccessRow): boolean {
  if (row.policy_id || row.person_has_policy || row.application_has_payment_history) return false;
  return !row.application_id || row.application_status === 'draft' || row.application_status === 'pending_payment';
}

async function assertDocumentMutable(row: DocumentAccessRow): Promise<void> {
  if (!isDocumentMutable(row)) throw new BadRequestError('document_historical');
}

function handleOcrError(request: { log: { error: (error: unknown, message: string) => void } }, error: unknown): never {
  if (error instanceof OcrError) {
    request.log.error(error, 'OCR recognition failed');
    throw new HttpError(502, 'ocr_recognition_failed');
  }
  throw error;
}

export async function documentsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { type?: string } }>('/api/documents', async (request, reply) => {
    const account = await authenticate(request);
    if (request.query.type && !DOCUMENT_TYPES.has(request.query.type)) throw new BadRequestError('invalid_type');
    const federationIds = await getAccessibleFederationIds(account);
    const categories = await getAccessibleCategories(account);
    const result = await pool.query(
      `${DOCUMENT_SELECT}
       WHERE ($1::text IS NULL OR d.type = $1)
         AND ($2::uuid[] IS NULL OR a.federation_id = ANY($2::uuid[])
              OR (a.id IS NULL AND EXISTS (
                SELECT 1 FROM federation_memberships fm
                WHERE fm.person_id = d.person_id AND fm.federation_id = ANY($2::uuid[])
              )))
         AND ($3::text[] IS NULL OR ip.category = ANY($3::text[]))
       ORDER BY d.created_at DESC`,
      [request.query.type ?? null, federationIds, categories],
    );
    const documents = await Promise.all(result.rows.map(async (row) => mapDocumentRow(row, await canManageDocument(account, row))));
    return reply.status(200).send(documents);
  });

  app.get<{ Params: { id: string } }>('/api/documents/:id', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);
    const row = await fetchDocument(request.params.id);
    if (!row) throw new NotFoundError('document_not_found');
    await assertDocumentReadAccess(account, row);
    return reply.status(200).send(mapDocumentRow(row, await canManageDocument(account, row)));
  });

  app.post('/api/documents/recognize', async (request, reply) => {
    const account = await authenticate(request);
    const { buffer, filename, mimetype, fields } = await readUpload(request.body as MultipartBody);
    const personId = fields.person_id;
    if (!personId) throw new BadRequestError('person_id_required');
    assertUuid(personId);
    const applicationId = fields.application_id || null;
    if (applicationId) assertUuid(applicationId);
    await assertPersonAccess(account, personId, applicationId, true);
    try {
      return reply.status(200).send({ data: await recognizeDocument(buffer, filename, mimetype) });
    } catch (error) {
      handleOcrError(request, error);
    }
  });

  app.post('/api/documents', async (request, reply) => {
    const account = await authenticate(request);
    const { buffer, filename, fields } = await readUpload(request.body as MultipartBody);
    const personId = fields.person_id;
    if (!personId) throw new BadRequestError('person_id_required');
    assertUuid(personId);
    const applicationId = fields.application_id || null;
    if (applicationId) assertUuid(applicationId);
    if (!fields.type || !DOCUMENT_TYPES.has(fields.type)) throw new BadRequestError('invalid_type');
    let extractedData: Record<string, unknown> | null = null;
    if (fields.extracted_data) {
      try { extractedData = validateExtractedData(JSON.parse(fields.extracted_data)); }
      catch (error) { if (error instanceof HttpError) throw error; throw new BadRequestError('invalid_extracted_data'); }
    }
    await assertPersonAccess(account, personId, applicationId, true);
    const storedFilename = await saveDocumentFile(buffer, filename);
    try {
      const result = await pool.query(
        `INSERT INTO documents (person_id, application_id, type, file_url, extracted_data)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [personId, applicationId, fields.type, storedFilename, extractedData],
      );
      const row = await fetchDocument(result.rows[0].id);
      const document = row as DocumentAccessRow;
      return reply.status(201).send(mapDocumentRow(document, await canManageDocument(account, document)));
    } catch (error) {
      await removeDocumentFile(storedFilename);
      throw error;
    }
  });

  app.patch<{ Params: { id: string }; Body: { type?: unknown; extracted_data?: unknown } }>(
    '/api/documents/:id',
    async (request, reply) => {
      const account = await authenticate(request);
      assertUuid(request.params.id);
      const row = await fetchDocument(request.params.id);
      if (!row) throw new NotFoundError('document_not_found');
      await assertDocumentManageAccess(account, row);
      await assertDocumentMutable(row);
      if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw new BadRequestError('invalid_fields');
      const keys = Object.keys(request.body);
      if (keys.length === 0 || keys.some((key) => key !== 'type' && key !== 'extracted_data')) throw new BadRequestError('invalid_fields');
      if ('type' in request.body && (typeof request.body.type !== 'string' || !DOCUMENT_TYPES.has(request.body.type))) {
        throw new BadRequestError('invalid_type');
      }
      const extractedData = 'extracted_data' in request.body ? validateExtractedData(request.body.extracted_data) : row.extracted_data;
      await pool.query(
        `UPDATE documents SET type = $1, extracted_data = $2 WHERE id = $3`,
        [request.body.type ?? row.type, extractedData, request.params.id],
      );
      const refreshed = await fetchDocument(request.params.id);
      return reply.status(200).send(mapDocumentRow(refreshed as DocumentAccessRow, true));
    },
  );

  app.post<{ Params: { id: string }; Body?: Record<string, unknown> }>('/api/documents/:id/recognize', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);
    if (request.body && Object.keys(request.body).length > 0) throw new BadRequestError('invalid_fields');
    const row = await fetchDocument(request.params.id);
    if (!row) throw new NotFoundError('document_not_found');
    await assertDocumentManageAccess(account, row);
    await assertDocumentMutable(row);
    let filePath: string;
    try { filePath = documentFilePath(row.file_url); await stat(filePath); }
    catch { throw new NotFoundError('document_file_not_found'); }
    try {
      const data = await recognizeDocument(await readFile(filePath), row.file_url, documentContentType(row.file_url));
      await pool.query(`UPDATE documents SET extracted_data = $1 WHERE id = $2`, [data, request.params.id]);
      const refreshed = await fetchDocument(request.params.id);
      return reply.status(200).send(mapDocumentRow(refreshed as DocumentAccessRow, true));
    } catch (error) {
      handleOcrError(request, error);
    }
  });

  app.delete<{ Params: { id: string } }>('/api/documents/:id', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);
    const client = await pool.connect();
    let quarantined: { remove: () => Promise<void>; restore: () => Promise<void> } | undefined;
    try {
      await client.query('BEGIN');
      const locked = await client.query(`${DOCUMENT_SELECT} WHERE d.id = $1 FOR UPDATE OF d`, [request.params.id]);
      const row = locked.rows[0] as DocumentAccessRow | undefined;
      if (!row) throw new NotFoundError('document_not_found');
      await assertDocumentManageAccess(account, row);
      await assertDocumentMutable(row);
      try { quarantined = await quarantineDocumentFile(row.file_url); }
      catch { throw new NotFoundError('document_file_not_found'); }
      await client.query(`DELETE FROM documents WHERE id = $1`, [request.params.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (quarantined) await quarantined.restore();
      throw error;
    } finally {
      client.release();
    }
    await quarantined?.remove();
    return reply.status(200).send({ ok: true });
  });

  app.get<{ Params: { id: string } }>('/api/documents/:id/file', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);
    const row = await fetchDocument(request.params.id);
    if (!row) throw new NotFoundError('document_not_found');
    await assertDocumentReadAccess(account, row);
    let filePath: string;
    try { filePath = documentFilePath(row.file_url); await stat(filePath); }
    catch { throw new NotFoundError('document_file_not_found'); }
    reply.header('Content-Type', documentContentType(row.file_url));
    reply.header('Content-Disposition', `attachment; filename="document-${row.id}${path.extname(row.file_url)}"`);
    return reply.send(createReadStream(filePath));
  });
}
