// App-wide error handling: one error type, one way to show a message, one logging hook.
export const ERROR_CODE = Object.freeze({
  VALIDATION: 'validation', NOT_FOUND: 'not_found', CONFLICT: 'conflict', INVALID: 'invalid',
  OFFLINE: 'offline', NETWORK: 'network', AUTH: 'auth', UNKNOWN: 'unknown',
});

export class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details; // e.g. { errors: { title: 'Title is required.' } }
  }
}
export const isAppError = (e) => e instanceof AppError;

/** Turn anything that was thrown (Firebase, browser, our own) into an AppError. */
export function toAppError(e) {
  if (isAppError(e)) return e;
  const code = typeof e?.code === 'string' ? e.code : '';
  if (globalThis.navigator?.onLine === false) return new AppError(ERROR_CODE.OFFLINE, 'Offline.', { cause: e });
  if (code === 'unavailable' || code.includes('network')) return new AppError(ERROR_CODE.NETWORK, 'Network problem.', { cause: e });
  if (code.startsWith('auth/')) return new AppError(ERROR_CODE.AUTH, 'Authentication problem.', { cause: e });
  return new AppError(ERROR_CODE.UNKNOWN, e?.message || 'Unknown error.', { cause: e });
}

const MESSAGES = {
  [ERROR_CODE.OFFLINE]: 'This needs an internet connection.',
  [ERROR_CODE.NETWORK]: 'Could not reach the server. Check your connection and try again.',
  [ERROR_CODE.NOT_FOUND]: 'We could not find that item. It may have been deleted.',
  [ERROR_CODE.AUTH]: 'There was a sign-in problem. Please sign in again.',
};

/** The text to show the user. Never exposes technical details. */
export function toUserMessage(error) {
  const e = toAppError(error);
  if (e.code === ERROR_CODE.VALIDATION) return Object.values(e.details?.errors ?? {})[0] ?? e.message;
  if (e.code === ERROR_CODE.CONFLICT) return e.message;
  return MESSAGES[e.code] ?? 'Something went wrong. Please try again.';
}

// ---- single logging hook (Phase 14 can send these to a monitoring service) ----
const defaultLogger = (error, context) => { if (import.meta.env?.DEV) console.error('[app]', context ?? '', error); };
let logger = defaultLogger;
export const setErrorLogger = (fn) => { logger = fn ?? defaultLogger; };
export const logError = (error, context) => logger(toAppError(error), context);

/** Log it and return the message for the UI: `setMsg(handleError(e, 'account'))`. */
export function handleError(error, context) {
  logError(error, context);
  return toUserMessage(error);
}
