import { Response, NextFunction } from 'express';
import licenseService from '../services/license.service';
import logger from '../utils/logger';
import { TenantRequest } from './tenant';

/**
 * Middleware to check license validity for all API requests
 * This ensures that no business logic can execute without a valid license
 * Now supports per-tenant license checking
 */
export async function licenseCheckMiddleware(req: TenantRequest, res: Response, next: NextFunction) {
  try {
    // Get tenant ID from request (may be undefined for non-tenant routes)
    const tenantId = req.tenantId;

    // Validate license for the specific tenant (or globally if no tenant)
    const isValid = await licenseService.validateLicense(tenantId);

    if (!isValid) {
      const logContext = {
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        tenantId: tenantId || 'none',
      };

      logger.warn(`🚫 License check failed for ${req.method} ${req.path}`, logContext);

      return res.status(403).json({
        error: 'Service Unavailable',
        message: tenantId 
          ? 'Your account license has been disabled. Please contact support.'
          : 'License validation failed. Please contact support.',
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