import { Request, Response } from 'express';
import { TenantService } from '../services/tenant.service';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { status } from "http-status";

// Error messages
const ERROR_MESSAGES = {
  TENANT_NOT_FOUND: 'Tenant not found',
  FAILED_TO_GET_TENANTS: 'Failed to get tenants',
  FAILED_TO_GET_TENANT: 'Failed to get tenant',
  FAILED_TO_CREATE_TENANT: 'Failed to create tenant',
  FAILED_TO_UPDATE_TENANT: 'Failed to update tenant',
  FAILED_TO_DELETE_TENANT: 'Failed to delete tenant',
  FAILED_TO_UPDATE_BRANDING: 'Failed to update tenant branding',
  FAILED_TO_GET_BRANDING: 'Failed to get tenant branding',
} as const;

const tenantService = new TenantService();

export class TenantController {
  /**
   * Get all tenants
   */
  async getAllTenants(req: Request, res: Response) {
    try {
      const tenants = await tenantService.getAllTenants();
      res.json(tenants);
    } catch (error) {
      logger.error('Error getting tenants:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GET_TENANTS });
    }
  }

  /**
   * Get tenant by ID
   */
  async getTenantById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const tenant = await tenantService.getTenantById(id);

      if (!tenant) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TENANT_NOT_FOUND });
      }

      res.json(tenant);
    } catch (error) {
      logger.error('Error getting tenant:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GET_TENANT });
    }
  }

  /**
   * Create new tenant
   */
  async createTenant(req: Request, res: Response) {
    try {
      const tenantData = req.body;
      const tenant = await tenantService.createTenant(tenantData);
      res.status(status.CREATED).json(tenant);
    } catch (error) {
      logger.error('Error creating tenant:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to create tenant' });
    }
  }

  /**
   * Update tenant
   */
  async updateTenant(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const tenant = await tenantService.updateTenant(id, updates);

      if (!tenant) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TENANT_NOT_FOUND });
      }

      res.json(tenant);
    } catch (error) {
      logger.error('Error updating tenant:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to update tenant' });
    }
  }

  /**
   * Delete tenant
   */
  async deleteTenant(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const deleted = await tenantService.deleteTenant(id);

      if (!deleted) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TENANT_NOT_FOUND });
      }

      res.status(status.NO_CONTENT).send();
    } catch (error) {
      logger.error('Error deleting tenant:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to delete tenant' });
    }
  }

  /**
   * Update tenant branding/theme
   * Only tenant admins can update their own tenant's branding
   */
  async updateTenantBranding(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const brandingData = req.body;

      // Validate that the requesting user is admin of this tenant
      // (authentication middleware should populate req.user)
      const user = (req as AuthRequest).user;
      if (!user || (user.tenantId !== id && !user.isSuperAdmin)) {
        return res.status(status.FORBIDDEN).json({ error: 'Not authorized to update this tenant branding' });
      }

      const tenant = await tenantService.updateTenantBranding(id, brandingData);

      if (!tenant) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TENANT_NOT_FOUND });
      }

      res.json(tenant);
    } catch (error) {
      logger.error('Error updating tenant branding:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to update tenant branding' });
    }
  }

  /**
   * Get tenant branding by subdomain (public endpoint)
   * Used by frontend to load theme on initial page load
   */
  async getTenantBrandingBySubdomain(req: Request, res: Response) {
    try {
      const { subdomain } = req.params;
      const branding = await tenantService.getTenantBrandingBySubdomain(subdomain);

      if (!branding) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TENANT_NOT_FOUND });
      }

      res.json(branding);
    } catch (error) {
      logger.error('Error getting tenant branding:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GET_BRANDING });
    }
  }

  /**
   * Get current user's tenant
   * Allows authenticated users to view their own tenant info
   */
  async getMyTenant(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      if (!user?.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: 'User tenant not found' });
      }

      const tenant = await tenantService.getTenantById(user.tenantId);

      if (!tenant) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TENANT_NOT_FOUND });
      }

      res.json(tenant);
    } catch (error) {
      logger.error('Error getting user tenant:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GET_TENANT });
    }
  }
}
