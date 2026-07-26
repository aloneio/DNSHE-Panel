export class AppError extends Error {
  readonly status: number;
  readonly errorCode?: string;
  readonly details?: unknown;
  readonly upstream?: { endpoint: string; action?: string; status: number };

  constructor(message: string, status = 500, options: {
    errorCode?: string;
    details?: unknown;
    upstream?: { endpoint: string; action?: string; status: number };
  } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.errorCode = options.errorCode;
    this.details = options.details;
    this.upstream = options.upstream;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, { errorCode: 'VALIDATION_ERROR', details });
    this.name = 'ValidationError';
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, { errorCode: 'AUTH_REQUIRED' });
    this.name = 'AuthError';
  }
}

export class CsrfError extends AppError {
  constructor(message = 'Invalid CSRF token') {
    super(message, 403, { errorCode: 'CSRF_INVALID' });
    this.name = 'CsrfError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many login attempts', details?: unknown) {
    super(message, 429, { errorCode: 'RATE_LIMITED', details });
    this.name = 'RateLimitError';
  }
}

export interface ApiErrorShape {
  success: false;
  message: string;
  requestId: string;
  error_code?: string;
  details?: unknown;
  upstream?: { endpoint: string; action?: string; status: number };
}

export function toApiError(error: unknown, requestId: string): { status: number; body: ApiErrorShape } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        success: false,
        message: error.message,
        requestId,
        ...(error.errorCode ? { error_code: error.errorCode } : {}),
        ...(error.details === undefined ? {} : { details: error.details }),
        ...(error.upstream ? { upstream: error.upstream } : {})
      }
    };
  }
  return {
    status: 500,
    body: {
      success: false,
      message: 'Internal server error',
      requestId,
      error_code: 'INTERNAL_ERROR'
    }
  };
}
