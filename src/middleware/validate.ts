import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors/AppError';

/**
 * Validate request body against Zod schema
 */
export function validateBody(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate body
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format validation errors
        const errors = error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        next(new ValidationError('Request body validation failed', errors));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate request query parameters against Zod schema
 */
export function validateQuery(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate query
      const validated = await schema.parseAsync(req.query);
      req.query = validated as typeof req.query;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        next(new ValidationError('Query parameters validation failed', errors));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate request params against Zod schema
 */
export function validateParams(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate params
      const validated = await schema.parseAsync(req.params);
      req.params = validated as typeof req.params;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        next(new ValidationError('URL parameters validation failed', errors));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Sanitize input to prevent XSS attacks
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  const sanitize = (obj: unknown): unknown => {
    if (typeof obj === 'string') {
      // Remove potential XSS patterns
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => sanitize(item));
    }

    if (obj && typeof obj === 'object' && obj !== null) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }

    return obj;
  };

  try {
    if (req.body) {
      req.body = sanitize(req.body) as typeof req.body;
    }
    if (req.query) {
      req.query = sanitize(req.query) as typeof req.query;
    }
    if (req.params) {
      req.params = sanitize(req.params) as typeof req.params;
    }
    next();
  } catch (error) {
    next(error);
  }
}

