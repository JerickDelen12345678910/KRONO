// Minimal app-wide error type. PACE 3 extends this with user-friendly messages and logging.
export const ERROR_CODE = Object.freeze({ VALIDATION: 'validation', NOT_FOUND: 'not_found', CONFLICT: 'conflict', INVALID: 'invalid' });

export class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details; // e.g. { errors: { title: 'Title is required.' } }
  }
}
export const isAppError = (e) => e instanceof AppError;
