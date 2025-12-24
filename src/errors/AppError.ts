/**
 * Base Application Error Class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;

  constructor(
    statusCode: number,
    message: string,
    code?: string,
    isOperational = true
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;

    // Maintains proper stack trace for where error was thrown
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request
 * Client sent invalid data
 */
export class BadRequestError extends AppError {
  constructor(message: string, code?: string) {
    super(400, message, code || 'BAD_REQUEST');
  }
}

/**
 * 401 Unauthorized
 * Authentication is required or failed
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required', code?: string) {
    super(401, message, code || 'UNAUTHORIZED');
  }
}

/**
 * 403 Forbidden
 * User is authenticated but doesn't have permission
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied', code?: string) {
    super(403, message, code || 'FORBIDDEN');
  }
}

/**
 * 404 Not Found
 * Resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(message: string, code?: string) {
    super(404, message, code || 'NOT_FOUND');
  }
}

/**
 * 409 Conflict
 * Request conflicts with current state (e.g., duplicate entry)
 */
export class ConflictError extends AppError {
  constructor(message: string, code?: string) {
    super(409, message, code || 'CONFLICT');
  }
}

/**
 * 422 Unprocessable Entity
 * Request is well-formed but contains semantic errors
 */
export class ValidationError extends AppError {
  public readonly errors?: Array<{
    field: string;
    message: string;
    code?: string;
  }>;

  constructor(
    message: string, 
    errors?: Array<{ field: string; message: string; code?: string }>, 
    code?: string
  ) {
    super(422, message, code || 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

/**
 * 429 Too Many Requests
 * Rate limit exceeded
 */
export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too many requests', code?: string) {
    super(429, message, code || 'TOO_MANY_REQUESTS');
  }
}

/**
 * 500 Internal Server Error
 * Unexpected server error
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', code?: string) {
    super(500, message, code || 'INTERNAL_SERVER_ERROR', false);
  }
}

/**
 * 503 Service Unavailable
 * Service is temporarily unavailable (maintenance, overload)
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable', code?: string) {
    super(503, message, code || 'SERVICE_UNAVAILABLE');
  }
}

