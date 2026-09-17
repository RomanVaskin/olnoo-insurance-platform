/** Shared by every auth guard module (kept separate from guards.ts to avoid a circular import with insurance-access.ts). */
export class AuthError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
  }
}
