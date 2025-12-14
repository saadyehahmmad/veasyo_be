import { Request, Response } from 'express';
import { requestTypeService } from '../services/request-type.service';
import logger from '../utils/logger';
import { status } from "http-status";

// Extend Express Request type
interface AuthRequest extends Request {
  tenantId?: string;
}

export class RequestTypeController {
  /**
   * Get all request types for the current tenant
   */
  async getAllRequestTypes(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const activeOnly = req.query.activeOnly === 'true';

      if (!tenantId) {
        res.status(status.BAD_REQUEST).json({ error: 'Tenant ID is required' });
        return;
      }

      const requestTypes = await requestTypeService.getAllByTenant(tenantId, activeOnly);
      res.json(requestTypes);
    } catch (error) {
      logger.error('Error in getAllRequestTypes:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch request types' });
    }
  }

  /**
   * Get public request types for customer component (no auth required)
   */
  async getPublicRequestTypes(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId || req.params.tenantId;

      if (!tenantId) {
        res.status(status.BAD_REQUEST).json({ error: 'Tenant ID is required' });
        return;
      }

      // Only return active request types for public endpoint
      const requestTypes = await requestTypeService.getAllByTenant(tenantId, true);
      res.json(requestTypes);
    } catch (error) {
      logger.error('Error in getPublicRequestTypes:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch request types' });
    }
  }

  /**
   * Get a single request type by ID
   */
  async getRequestTypeById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      if (!tenantId) {
        res.status(status.BAD_REQUEST).json({ error: 'Tenant ID is required' });
        return;
      }

      const requestType = await requestTypeService.getById(id);

      if (!requestType) {
        res.status(status.NOT_FOUND).json({ error: 'Request type not found' });
        return;
      }

      // Verify the request type belongs to the current tenant
      if (requestType.tenantId !== tenantId) {
        res.status(status.FORBIDDEN).json({ error: 'Access denied' });
        return;
      }

      res.json(requestType);
    } catch (error) {
      logger.error('Error in getRequestTypeById:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch request type' });
    }
  }

  /**
   * Create a new request type
   */
  async createRequestType(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;

      if (!tenantId) {
        res.status(status.BAD_REQUEST).json({ error: 'Tenant ID is required' });
        return;
      }

      const { nameEn, nameAr, icon, displayOrder, active } = req.body;

      // Validation
      if (!nameEn || !nameAr || !icon) {
        res.status(status.BAD_REQUEST).json({ error: 'nameEn, nameAr, and icon are required fields' });
        return;
      }

      const requestType = await requestTypeService.create({
        tenantId,
        nameEn,
        nameAr,
        icon,
        displayOrder,
        active: active ?? true,
      });

      res.status(status.CREATED).json(requestType);
    } catch (error) {
      logger.error('Error in createRequestType:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to create request type' });
    }
  }

  /**
   * Update a request type
   */
  async updateRequestType(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      if (!tenantId) {
        res.status(status.BAD_REQUEST).json({ error: 'Tenant ID is required' });
        return;
      }

      // Verify the request type belongs to the current tenant
      const existingRequestType = await requestTypeService.getById(id);

      if (!existingRequestType) {
        res.status(status.NOT_FOUND).json({ error: 'Request type not found' });
        return;
      }

      if (existingRequestType.tenantId !== tenantId) {
        res.status(status.FORBIDDEN).json({ error: 'Access denied' });
        return;
      }

      const { nameEn, nameAr, icon, displayOrder, active } = req.body;

      const updatedRequestType = await requestTypeService.update(id, {
        nameEn,
        nameAr,
        icon,
        displayOrder,
        active,
      });

      res.json(updatedRequestType);
    } catch (error) {
      logger.error('Error in updateRequestType:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to update request type' });
    }
  }

  /**
   * Delete a request type
   */
  async deleteRequestType(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      if (!tenantId) {
        res.status(status.BAD_REQUEST).json({ error: 'Tenant ID is required' });
        return;
      }

      // Verify the request type belongs to the current tenant
      const existingRequestType = await requestTypeService.getById(id);

      if (!existingRequestType) {
        res.status(status.NOT_FOUND).json({ error: 'Request type not found' });
        return;
      }

      if (existingRequestType.tenantId !== tenantId) {
        res.status(status.FORBIDDEN).json({ error: 'Access denied' });
        return;
      }

      await requestTypeService.delete(id);
      res.status(status.NO_CONTENT).send();
    } catch (error) {
      logger.error('Error in deleteRequestType:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to delete request type' });
    }
  }

  /**
   * Reorder request types
   */
  async reorderRequestTypes(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;

      if (!tenantId) {
        res.status(status.BAD_REQUEST).json({ error: 'Tenant ID is required' });
        return;
      }

      const { orderedIds } = req.body;

      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        res.status(status.BAD_REQUEST).json({ error: 'orderedIds must be a non-empty array' });
        return;
      }

      await requestTypeService.reorder(tenantId, orderedIds);
      res.json({ message: 'Request types reordered successfully' });
    } catch (error) {
      logger.error('Error in reorderRequestTypes:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to reorder request types' });
    }
  }
}

export const requestTypeController = new RequestTypeController();
