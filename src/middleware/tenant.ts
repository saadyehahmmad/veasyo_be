import { Request, Response, NextFunction } from 'express';
import { db } from '../database/db';
import { tenants, Tenant } from '../database/schema';
import { eq, or } from 'drizzle-orm';
import logger from '../utils/logger';

export interface TenantRequest extends Request {
  tenantId?: string;
  tenant?: Tenant;
}

/**
 * Extract tenant from request
 * Supports:
 * - Subdomain (e.g., restaurant-abc.waiter-app.com)
 * - Header (X-Tenant-Slug)
 * - Query parameter (?tenant=restaurant-abc)
 */
export async function extractTenant(req: TenantRequest, res: Response, next: NextFunction) {
  try {
    // If tenantId already set by auth middleware (from JWT), use it directly
    if (req.tenantId) {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.tenantId)).limit(1);

      if (tenant) {
        if (!tenant.active) {
          return res.status(403).json({
            error: 'Tenant account is inactive',
            message: 'Please contact support',
          });
        }

        req.tenant = tenant;
        return next();
      }
    }

    // Extract tenant identifier from various sources
    const subdomain = extractSubdomain(req.hostname);
    const tenantSlug = req.headers['x-tenant-slug'] as string;
    const tenantSubdomain = req.headers['x-tenant-subdomain'] as string;
    const queryTenant = req.query.tenant as string;

    const identifier = subdomain || tenantSlug || tenantSubdomain || queryTenant;

    // Require tenant identifier - no fallbacks
    if (!identifier) {
      return res.status(400).json({
        error: 'Tenant not specified',
        message: 'Please provide tenant via subdomain, header, or query parameter',
      });
    }

    // Fetch tenant from database
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(or(eq(tenants.slug, identifier), eq(tenants.subdomain, identifier)))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        identifier,
      });
    }

    if (!tenant.active) {
      return res.status(403).json({
        error: 'Tenant account is inactive',
        message: 'Please contact support',
      });
    }

    // Attach tenant info to request
    req.tenantId = tenant.id;
    req.tenant = tenant;

    next();
  } catch (error) {
    logger.error('Tenant extraction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Extract subdomain from hostname
 * Examples:
 * - restaurant-abc.waiter-app.com → restaurant-abc
 * - a.localhost → a (for development)
 * - localhost → null
 * - waiter-app.com → null
 */
export function extractSubdomain(hostname: string): string | null {
  // Handle localhost with subdomain (e.g., a.localhost)
  if (hostname.includes('localhost')) {
    const parts = hostname.split('.');
    if (parts.length >= 2 && parts[0] !== 'localhost' && parts[0] !== 'www') {
      return parts[0]; // Return subdomain before .localhost
    }
    return null;
  }

  // Skip IP addresses
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }

  const parts = hostname.split('.');

  // Need at least 3 parts for subdomain (subdomain.domain.tld)
  if (parts.length < 3) {
    return null;
  }

  // Return first part as subdomain
  return parts[0];
}


/**
 * Middleware to check tenant plan limits
 */
export async function checkTenantLimits(req: TenantRequest, res: Response, next: NextFunction) {
  try {
    const tenant = req.tenant;

    if (!tenant) {
      return res.status(400).json({ error: 'Tenant not found in request' });
    }

    // Add limit checking logic here
    // For example: check max tables, max users, etc.

    next();
  } catch (error) {
    logger.error('Tenant limits check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
