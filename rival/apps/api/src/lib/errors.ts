/**
 * API errors.
 *
 * Every failure the client can act on is an `ApiError` with a stable machine
 * code; anything else becomes a 500 with no internals leaked.
 */

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'bad_request', message, details);
  }
  static unauthorized(message = 'Sign in to continue.'): ApiError {
    return new ApiError(401, 'unauthorized', message);
  }
  static forbidden(message = "You don't have access to that."): ApiError {
    return new ApiError(403, 'forbidden', message);
  }
  static notFound(message = 'Not found.'): ApiError {
    return new ApiError(404, 'not_found', message);
  }
  static conflict(code: string, message: string): ApiError {
    return new ApiError(409, code, message);
  }
  static tooManyRequests(message = 'Too many attempts. Try again shortly.'): ApiError {
    return new ApiError(429, 'rate_limited', message);
  }
  static notImplemented(message: string): ApiError {
    return new ApiError(501, 'not_implemented', message);
  }
  /** Used where a feature exists but the caller's plan doesn't include it. */
  static requiresPro(message = 'That’s a RIVAL PRO feature.'): ApiError {
    return new ApiError(402, 'requires_pro', message);
  }
}
