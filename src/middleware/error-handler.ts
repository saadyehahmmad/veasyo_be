import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../errors/AppError';
import logger from '../utils/logger';
import { ZodError } from 'zod';
import { AuthRequest } from './auth';
import { DatabaseError } from 'pg';

/**
 * Centralized Error Handler Middleware
 * Handles all errors thrown in the application
 * Must be registered LAST in middleware chain
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // Log error with context
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    requestId: (req as Request).requestId,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params,
    userId: (req as AuthRequest).user?.userId,
    tenantId: (req as AuthRequest).tenantId,
  });

  // Handle operational errors (known errors)
  if (err instanceof AppError && err.isOperational) {
    const response: Record<string, unknown> = {
      status: 'error',
      statusCode: err.statusCode,
      message: err.message,
      code: err.code,
      requestId: (req as Request).requestId,
    };

    // Add validation errors if present
    if (err instanceof ValidationError && err.errors) {
      response.errors = err.errors;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const errors = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));

    res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors,
      requestId: (req as Request).requestId,
    });
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      status: 'error',
      statusCode: 401,
      message: 'Invalid token',
      code: 'INVALID_TOKEN',
      requestId: (req as Request).requestId,
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      status: 'error',
      statusCode: 401,
      message: 'Token expired',
      code: 'TOKEN_EXPIRED',
      requestId: (req as Request).requestId,
    });
    return;
  }

  // Handle database errors
  if (err.name === 'QueryFailedError') {
    logger.error('Database query failed:', err);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Database error occurred',
      code: 'DATABASE_ERROR',
      requestId: (req as Request).requestId,
    });
    return;
  }

  // Handle PostgreSQL errors
  if ((err as DatabaseError).code) {
    const pgError = err as DatabaseError;
    
    // Unique constraint violation
    if (pgError.code === '23505') {
      res.status(409).json({
        status: 'error',
        statusCode: 409,
        message: 'Resource already exists',
        code: 'DUPLICATE_ENTRY',
        requestId: (req as Request).requestId,
      });
      return;
    }

    // Foreign key violation
    if (pgError.code === '23503') {
      res.status(400).json({
        status: 'error',
        statusCode: 400,
        message: 'Referenced resource does not exist',
        code: 'FOREIGN_KEY_VIOLATION',
        requestId: (req as Request).requestId,
      });
      return;
    }

    // Not null violation
    if (pgError.code === '23502') {
      res.status(400).json({
        status: 'error',
        statusCode: 400,
        message: 'Required field is missing',
        code: 'NOT_NULL_VIOLATION',
        requestId: (req as Request).requestId,
      });
      return;
    }
  }

  // Handle unknown errors (non-operational)
  // Don't leak error details in production
  const message =
    process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message || 'An unexpected error occurred';

  res.status(500).json({
    status: 'error',
    statusCode: 500,
    message,
    code: 'INTERNAL_SERVER_ERROR',
    requestId: (req as Request).requestId,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors and pass to error handler
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Not Found handler
 * Should be registered before error handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    status: 'error',
    statusCode: 404,
    message: `Route ${req.method} ${req.path} not found`,
    code: 'ROUTE_NOT_FOUND',
    requestId: (req as Request).requestId,
  });
}

