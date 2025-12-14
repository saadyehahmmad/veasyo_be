import { Request, Response, NextFunction } from 'express';
import licenseService from '../services/license.service';
import logger from '../utils/logger';

/**
 * Middleware to check license validity for all API requests
 * This ensures that no business logic can execute without a valid license
 */
export async function licenseCheckMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const isValid = await licenseService.validateLicense();

    if (!isValid) {
      logger.warn(`🚫 License check failed for ${req.method} ${req.path}`, {
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(403).json({
        error: 'Service Unavailable',
        message: 'License validation failed. Please contact support.',
        requestId: req.requestId,
      });
    }

    // License is valid, proceed
    next();
  } catch (error) {
    logger.error('❌ Error in license check middleware:', error);
    // In case of error, fail closed
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'License validation error. Please try again later.',
      requestId: req.requestId,
    });
  }
}