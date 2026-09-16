import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { MultipartFile, MultipartValue } from '@fastify/multipart';
import { pool } from '../db/pool';
import { authenticate, getAccessibleFederationIds } from '../modules/auth/guards';
import type { SessionAccount } from '../modules/auth/session';
import { assertUuid, NotFoundError, HttpError, BadRequestError } from '../lib/api-helpers';
import { recognizeDocument, OcrError } from '../modules/ocr/client';
import { saveDocumentFile, documentFilePath, documentContentType } from '../modules/documents/storage';

const DOCUMENT_TYPES = new Set(['passport', 'birth_certificate', 'other']);

type MultipartBody = Record<string, MultipartFile | MultipartValue | undefined>;

/** Pulls the uploaded file and any plain text fields out of an attachFieldsToBody multipart request. */
async function readUpload(
  body: MultipartBody,
): Promise<{ buffer: Buffer; filename: string; mimetype: string; fields: Record<string, string> }> {
  const filePart = body.file;
  if (!filePart || filePart.type !== 'file') {
    throw new BadRequestError('file_required');
  }

  const fields: Record<string, string> = {};
  for (const [key, part] of Object.entries(body)) {
    if (part && part.type === 'field') {
      fields[key] = String(part.value);
    }
  }

  return {
    buffer: await filePart.toBuffer(),
    filename: filePart.filename,
    mimetype: filePart.mimetype,
    fields,
  };
}

/** Verifies the account may attach a new document to this person (and, if given, this application). */
async function assertPersonAccess(
  account: SessionAccount,
  personId: string,
  applicationId: string | null,
): Promise<void> {
  if (account.role === 'super_admin') {
    return;
  }
  if (account.role === 'athlete' && account.person_id === personId) {
    return;
  }

  if (account.role === 'federation_secretary' || account.role === 'federation_director') {
    const federationIds = (await getAccessibleFederationIds(account)) ?? [];

    if (applicationId) {
      const appResult = await pool.query<{ federation_id: string | null }>(
        `SELECT federation_id FROM applications WHERE id = $1`,
        [applicationId],
      );
      const appFederationId = appResult.rows[0]?.federation_id ?? null;
      if (appFederationId && federationIds.includes(appFederationId)) {
        return;
      }
    }

    const memberResult = await pool.query(
      `SELECT 1 FROM federation_memberships WHERE person_id = $1 AND federation_id = ANY($2::uuid[]) LIMIT 1`,
      [personId, federationIds],
    );
    if (memberResult.rows.length > 0) {
      return;
    }
  }

  throw new HttpError(403, 'forbidden');
}

/** Verifies the account may read an existing document, given its owning person and linked application's federation. */
async function assertDocumentAccess(
  account: SessionAccount,
  row: { person_id: string | null; access_federation_id: string | null },
): Promise<void> {
  if (account.role === 'super_admin') {
    return;
  }
  if (account.role === 'athlete' && row.person_id && account.person_id === row.person_id) {
    return;
  }

  if (account.role === 'federation_secretary' || account.role === 'federation_director') {
    const federationIds = (await getAccessibleFederationIds(account)) ?? [];

    if (row.access_federation_id && federationIds.includes(row.access_federation_id)) {
      return;
    }

    if (row.person_id) {
      const memberResult = await pool.query(
        `SELECT 1 FROM federation_memberships WHERE person_id = $1 AND federation_id = ANY($2::uuid[]) LIMIT 1`,
        [row.person_id, federationIds],
      );
      if (memberResult.rows.length > 0) {
        return;
      }
    }
  }

  throw new HttpError(403, 'forbidden');
}

function mapDocumentRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    person_id: row.person_id,
    application_id: row.application_id,
    type: row.type,
    status: row.status,
    extracted_data: row.extracted_data,
    created_at: row.created_at,
  };
}

export async function documentsRoutes(app: FastifyInstance): Promise<void> {
  // Sends the file to the existing OCR service for structured recognition and
  // returns the result for the caller to display for confirmation. Nothing is
  // persisted here — no DB row, no file written to disk.
  app.post('/api/documents/recognize', async (request, reply) => {
    await authenticate(request);
    const { buffer, filename, mimetype } = await readUpload(request.body as MultipartBody);

    try {
      const data = await recognizeDocument(buffer, filename, mimetype);
      return reply.status(200).send({ data });
    } catch (error) {
      if (error instanceof OcrError) {
        request.log.error(error, 'OCR recognition failed');
        return reply.status(502).send({ error: 'ocr_recognition_failed', message: error.message });
      }
      throw error;
    }
  });

  // Persists the confirmed document: saves the file to private local storage
  // under a UUID filename and inserts the documents row (including the
  // confirmed/edited extracted_data, if any).
  app.post('/api/documents', async (request, reply) => {
    const account = await authenticate(request);
    const { buffer, filename, fields } = await readUpload(request.body as MultipartBody);

    const personId = fields.person_id;
    if (!personId) {
      throw new BadRequestError('person_id_required');
    }
    assertUuid(personId);

    const applicationId = fields.application_id || null;
    if (applicationId) {
      assertUuid(applicationId);
    }

    const type = fields.type;
    if (!type || !DOCUMENT_TYPES.has(type)) {
      throw new BadRequestError('invalid_type');
    }

    let extractedData: unknown = null;
    if (fields.extracted_data) {
      try {
        extractedData = JSON.parse(fields.extracted_data);
      } catch {
        throw new BadRequestError('invalid_extracted_data');
      }
    }

    await assertPersonAccess(account, personId, applicationId);

    const storedFilename = await saveDocumentFile(buffer, filename);

    const result = await pool.query(
      `INSERT INTO documents (person_id, application_id, type, file_url, extracted_data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, person_id, application_id, type, status, extracted_data, created_at`,
      [personId, applicationId, type, storedFilename, extractedData !== null ? JSON.stringify(extractedData) : null],
    );

    return reply.status(201).send(mapDocumentRow(result.rows[0]));
  });

  // Streams the private file back to an authorized caller. The file never has a
  // public/static URL — this authenticated route is the only access path.
  app.get<{ Params: { id: string } }>('/api/documents/:id/file', async (request, reply) => {
    const account = await authenticate(request);
    assertUuid(request.params.id);

    const result = await pool.query(
      `SELECT d.id, d.person_id, d.file_url, a.federation_id AS access_federation_id
       FROM documents d
       LEFT JOIN applications a ON a.id = d.application_id
       WHERE d.id = $1`,
      [request.params.id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError('document_not_found');
    }

    await assertDocumentAccess(account, row);

    const storedFilename = row.file_url as string;
    const filePath = documentFilePath(storedFilename);
    try {
      await stat(filePath);
    } catch {
      throw new NotFoundError('document_file_not_found');
    }

    reply.header('Content-Type', documentContentType(storedFilename));
    reply.header('Content-Disposition', `attachment; filename="${row.id}${path.extname(storedFilename)}"`);
    return reply.send(createReadStream(filePath));
  });
}
