import express, { Request, Response } from 'express';
import { status } from 'http-status';
import { RateLimitRequestHandler } from 'express-rate-limit';
import logger from '../utils/logger';
import { config } from '../config/environment';
import { extractSubdomain, extractTenant, type TenantRequest } from '../middleware/tenant';
import { licenseCheckMiddleware } from '../middleware/license';
import { getActiveRequests } from '../handlers/requestHandler';
import { AnalyticsService } from '../services/analytics.service';
import licenseService from '../services/license.service';

// Import routes
import authRoutes from '../routes/auth.routes';
import superadminRoutes from '../routes/superadmin.routes';
import tenantRoutes from '../routes/tenant.routes';
import userRoutes from '../routes/user.routes';
import tableRoutes from '../routes/table.routes';
import serviceRequestRoutes from '../routes/service-request.routes';
import brandingRoutes from '../routes/branding.routes';
import requestTypeRoutes from '../routes/request-type.routes';
import integrationsRoutes from '../routes/integrations.routes';

/**
 * Configure and register all API routes
 */
export function configureRoutes(
  app: express.Application,
  apiLimiter: RateLimitRequestHandler,
  authLimiter: RateLimitRequestHandler
): void {
  // Apply general rate limiting to all API routes
  // Socket.IO connections are excluded from rate limiting (handled in skip function)
  app.use('/api', apiLimiter);

  // Health check endpoint
  app.get('/api/health', async (req: Request, res: Response) => {
    try {
      const licenseStatus = licenseService.getLicenseStatus();
      const isLicenseValid = await licenseService.validateLicense();

      res.json({
        status: isLicenseValid ? 'ok' : 'license_disabled',
        license: licenseStatus,
        timestamp: new Date().toISOString(),
        environment: config.nodeEnv,
        requestId: req.requestId,
      });
    } catch (error) {
      logger.error('Health check error:', error);
      res.status(status.BAD_GATEWAY).json({
        status: 'error',
        message: 'Health check failed',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  });

  // Active requests endpoint
  // Extract tenant from subdomain to ensure proper isolation - STRICT: no fallbacks
  app.get('/api/requests/active-db', licenseCheckMiddleware, async (req: Request, res: Response) => {
    try {
      // Extract tenant subdomain from multiple sources - STRICT: no fallbacks
      // Priority: 1. X-Tenant-Subdomain header (from frontend), 2. hostname
      const tenantHeader = req.headers['x-tenant-subdomain'] as string;
      const hostname = req.hostname;

      const tenantSubdomain: string | null = tenantHeader || extractSubdomain(hostname) || null;

      // STRICT: Return error if no tenant found
      if (!tenantSubdomain) {
        logger.error(
          `❌ Request rejected: No tenant subdomain found (header: ${tenantHeader}, hostname: ${hostname})`,
        );
        return res.status(status.BAD_REQUEST).json({
          error: 'Tenant subdomain is required',
          message:
            'Please access via subdomain (e.g., a.localhost:4200) or provide X-Tenant-Subdomain header',
        });
      }

      logger.info(
        `📥 Getting active requests for tenant: ${tenantSubdomain} (from ${tenantHeader ? 'header' : `hostname: ${hostname}`})`,
      );

      const activeRequests = getActiveRequests(tenantSubdomain);
      logger.info(`📦 Found ${activeRequests.length} active requests for tenant ${tenantSubdomain}`);

      // Convert to frontend-compatible format
      // Frontend expects: requestType, timestampCreated (not type, timestamp)
      const frontendRequests = activeRequests.map((req) => ({
        id: req.id,
        tenantId: req.tenantId,
        tableId: req.tableId, // This is already normalized to number/string
        requestType: req.type, // Map 'type' to 'requestType' for frontend
        status: req.status,
        timestampCreated: req.timestamp, // Map 'timestamp' to 'timestampCreated' for frontend
        timestampAcknowledged: null,
        timestampCompleted: null,
        acknowledgedBy: req.acknowledgedBy || null,
        customNote: req.customNote || null,
        durationSeconds: null,
        createdAt: req.timestamp,
        updatedAt: req.timestamp,
      }));

      logger.info(`📤 Sending ${frontendRequests.length} requests to frontend`);
      res.json(frontendRequests);
    } catch (error) {
      logger.error('Error getting active requests from DB:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get active requests' });
    }
  });

  // Analytics endpoints (require tenant context)
  app.get(
    '/api/analytics/summary',
    licenseCheckMiddleware,
    extractTenant,
    async (req: TenantRequest, res: Response) => {
      try {
        if (!req.tenantId) {
          return res.status(status.BAD_REQUEST).json({ error: 'Tenant context required' });
        }

        const analyticsService = new AnalyticsService();
        const analytics = await analyticsService.getAnalyticsSummary(req.tenantId);

        res.json(analytics);
      } catch (error) {
        logger.error('Error getting analytics:', error);
        res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get analytics' });
      }
    }
  );

  app.get(
    '/api/analytics/charts',
    licenseCheckMiddleware,
    extractTenant,
    async (req: TenantRequest, res: Response) => {
      try {
        if (!req.tenantId) {
          return res.status(status.BAD_REQUEST).json({ error: 'Tenant context required' });
        }

        const analyticsService = new AnalyticsService();
        const chartData = await analyticsService.getChartData(req.tenantId);

        res.json(chartData);
      } catch (error) {
        logger.error('Error getting chart data:', error);
        res.status(500).json({ error: 'Failed to get chart data' });
      }
    }
  );

  app.get(
    '/api/analytics/realtime',
    licenseCheckMiddleware,
    extractTenant,
    async (req: TenantRequest, res: Response) => {
      try {
        if (!req.tenantId) {
          return res.status(status.BAD_REQUEST).json({ error: 'Tenant context required' });
        }

        const analyticsService = new AnalyticsService();
        const realtimeData = await analyticsService.getRealtimeAnalytics(req.tenantId);

        res.json(realtimeData);
      } catch (error) {
        logger.error('Error getting realtime analytics:', error);
        res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get realtime analytics' });
      }
    }
  );

  // Auth routes (no tenant extraction needed) - with stricter rate limiting
  app.use('/api/auth', authLimiter, licenseCheckMiddleware, authRoutes);

  // Superadmin routes (no tenant extraction, authentication handled in routes)
  app.use('/api/superadmin', licenseCheckMiddleware, superadminRoutes);

  // Tenant-scoped routes
  // Note: tenant branding is public (no auth required), but other routes need auth
  app.use('/api/tenants', licenseCheckMiddleware, tenantRoutes); // Moved extractTenant inside routes for flexibility
  app.use('/api/users', licenseCheckMiddleware, extractTenant, userRoutes);
  app.use('/api/tables', licenseCheckMiddleware, extractTenant, tableRoutes);
  app.use('/api/service-requests', licenseCheckMiddleware, extractTenant, serviceRequestRoutes);
  app.use('/api/branding', licenseCheckMiddleware, extractTenant, brandingRoutes);
  app.use('/api/request-types', licenseCheckMiddleware, requestTypeRoutes);
  app.use('/api/integrations', licenseCheckMiddleware, extractTenant, integrationsRoutes);
}

