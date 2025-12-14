import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../utils/jwt';
import { Tenant } from '../database/schema';
import logger from '../utils/logger';

export interface AuthRequest extends Request {
  user?: JWTPayload;
  tenantId?: string;
  tenant?: Tenant;
}

/**
 * Authentication middleware
 * Extracts and validates JWT token from Authorization header
 */
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    try {
      const payload = verifyToken(token);

      // Attach user info to request
      req.user = payload;

      // If user has tenantId, attach it to request
      if (payload.tenantId) {
        req.tenantId = payload.tenantId;
      }

      next();
    } catch {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Optional authentication middleware
 * Attaches user info if token is present, but doesn't require it
 */
export async function optionalAuthenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        const payload = verifyToken(token);
        req.user = payload;

        if (payload.tenantId) {
          req.tenantId = payload.tenantId;
        }
      } catch {
        // Token invalid, but continue without user
      }
    }

    next();
  } catch (error) {
    logger.error('Optional authentication error:', error);
    next();
  }
}
