import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { db } from '../database/db';
import { rolePermissions, permissions } from '../database/schema';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger';

const AUTH_REQUIRED_MESSAGE = 'Authentication required';

/**
 * Require specific role(s)
 */
export function requireRole(allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: AUTH_REQUIRED_MESSAGE,
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      });
    }

    next();
  };
}

/**
 * Require superadmin role
 */
export function requireSuperAdmin() {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: AUTH_REQUIRED_MESSAGE,
      });
    }

    if (!req.user.isSuperAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Superadmin access required',
      });
    }

    next();
  };
}

/**
 * Require tenant admin role
 */
export function requireTenantAdmin() {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: AUTH_REQUIRED_MESSAGE,
      });
    }

    if (req.user.role !== 'admin' && !req.user.isSuperAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }

    next();
  };
}

/**
 * Require specific permission
 */
export function requirePermission(permissionName: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: AUTH_REQUIRED_MESSAGE,
      });
    }

    // Superadmin has all permissions
    if (req.user.isSuperAdmin) {
      return next();
    }

    try {
      // Check if user's role has the required permission
      const rolePerms = await db
        .select({
          permissionName: permissions.name,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.role, req.user.role));

      const hasPermission = rolePerms.some((p) => p.permissionName === permissionName);

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Missing required permission: ${permissionName}`,
        });
      }

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Ensure user can only access their own tenant data
 */
export function enforceTenantIsolation() {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: AUTH_REQUIRED_MESSAGE,
      });
    }

    // Superadmin can access all tenants
    if (req.user.isSuperAdmin) {
      return next();
    }

    // Ensure user's tenantId matches the request's tenantId
    if (req.tenantId && req.user.tenantId !== req.tenantId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied to this tenant',
      });
    }

    next();
  };
}

/**
 * Allow user to access only their own data or if they're an admin
 */
export function requireSelfOrAdmin(userIdParam = 'id') {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: AUTH_REQUIRED_MESSAGE,
      });
    }

    const targetUserId = req.params[userIdParam];

    // Allow if superadmin, tenant admin, or accessing own data
    if (req.user.isSuperAdmin || req.user.role === 'admin' || req.user.userId === targetUserId) {
      return next();
    }

    res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied',
    });
  };
}
