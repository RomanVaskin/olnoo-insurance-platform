/** Shared HTTP error types and small helpers for the read API routes. */

export class HttpError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends HttpError {
  constructor(code = 'not_found') {
    super(404, code);
  }
}

export class BadRequestError extends HttpError {
  constructor(code = 'bad_request') {
    super(400, code);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Throws 400 unless the value is a well-formed UUID route param. */
export function assertUuid(value: string): void {
  if (!UUID_RE.test(value)) {
    throw new BadRequestError('invalid_uuid');
  }
}

/** pg returns BIGINT/NUMERIC columns as strings; normalize to a JS number for JSON output. */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return Number(value);
}

export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
}
