/**
 * Thin client for the existing standalone OLNOO OCR service
 * (/opt/olnoo/projects/olnoo-ocr, listening on 127.0.0.1:3020).
 *
 * Recognition logic lives entirely in that service; this module only calls its
 * HTTP API and must not duplicate or reimplement it.
 *
 * The OCR service exposes a single structured-recognition endpoint, `/passport`,
 * that handles BOTH passport and birth-certificate documents — it classifies the
 * document itself and returns the result in `data.documentType`. There is no
 * separate birth-certificate endpoint.
 */

const OCR_URL = process.env.OCR_URL || 'http://127.0.0.1:3020';

export interface OcrExtractedData {
  documentType: 'russian_passport' | 'russian_birth_certificate' | '';
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  birthPlace: string;
  gender: string;
  passportSeries: string;
  passportNumber: string;
  issueDate: string;
  issuedBy: string;
  departmentCode: string;
}

export class OcrError extends Error {}

interface OcrResponseBody {
  ok: boolean;
  data?: OcrExtractedData;
  error?: string;
  message?: string;
}

export async function recognizeDocument(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<OcrExtractedData> {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimetype }), filename);

  let response: Response;
  try {
    response = await fetch(`${OCR_URL}/passport`, { method: 'POST', body: form });
  } catch (error) {
    throw new OcrError(`ocr_service_unreachable: ${(error as Error).message}`);
  }

  const raw = await response.text();
  let body: OcrResponseBody;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new OcrError(`ocr_invalid_response: ${raw.slice(0, 500)}`);
  }

  if (!response.ok || !body.ok || !body.data) {
    const detail = body.error ? `${body.error}${body.message ? `: ${body.message}` : ''}` : `http_${response.status}`;
    throw new OcrError(detail);
  }

  return body.data;
}
