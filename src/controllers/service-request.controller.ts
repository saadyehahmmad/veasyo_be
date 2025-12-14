import { Response } from 'express';
import { ServiceRequestService } from '../services/service-request.service';
import { handleAcknowledge, handleComplete } from '../handlers/requestHandler';
import { TenantRequest } from '../middleware/tenant';
import logger from '../utils/logger';
import { status } from "http-status";
// Error messages
const ERROR_MESSAGES = {
  TENANT_ID_REQUIRED: 'Tenant ID is required',
  SERVICE_REQUEST_NOT_FOUND: 'Service request not found',
  FAILED_TO_GET_REQUESTS: 'Failed to get service requests',
  FAILED_TO_GET_REQUEST: 'Failed to get service request',
  FAILED_TO_CREATE_REQUEST: 'Failed to create service request',
  FAILED_TO_UPDATE_REQUEST: 'Failed to update service request',
  FAILED_TO_DELETE_REQUEST: 'Failed to delete service request',
  FAILED_TO_ACKNOWLEDGE: 'Failed to acknowledge service request',
  FAILED_TO_COMPLETE: 'Failed to complete service request'
} as const;

const serviceRequestService = new ServiceRequestService();
export class ServiceRequestController {
  /**
   * Get all service requests for the tenant with pagination, filtering, and sorting
   */
  async getAllServiceRequests(req: TenantRequest, res: Response) {
    try {
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      const {
        page = 1,
        limit = 10,
        status: statusFilter,
        type,
        tableId,
        sortBy = 'timestampCreated',
        sortOrder = 'desc',
      } = req.query;

      const options = {
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        filters: {
          status: statusFilter as string,
          type: type as string,
          tableId: tableId as string,
        },
        sort: {
          by: sortBy as string,
          order: sortOrder as 'asc' | 'desc',
        },
      };

      const result = await serviceRequestService.getServiceRequestsWithPagination(
        tenantId,
        options,
      );
      res.json(result);
    } catch (error) {
      logger.error('Error getting service requests:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GET_REQUESTS });
    }
  }

  /**
   * Get service request by ID
   */
  async getServiceRequestById(req: TenantRequest, res: Response) {
    try {
      const { id } = req.params;
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;

      const request = await serviceRequestService.getServiceRequestById(id);

      if (request?.tenantId !== tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND });
      }

      res.json(request);
    } catch (error) {
      logger.error('Error getting service request:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GET_REQUEST });
    }
  }

  /**
   * Create new service request
   */
  async createServiceRequest(req: TenantRequest, res: Response) {
    try {
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      const requestData = req.body;

      const request = await serviceRequestService.createServiceRequest({
        ...requestData,
        tenantId,
      });
      res.status(status.CREATED).json(request);
    } catch (error) {
      logger.error('Error creating service request:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_CREATE_REQUEST });
    }
  }

  /**
   * Update service request
   */
  async updateServiceRequest(req: TenantRequest, res: Response) {
    try {
      const { id } = req.params;
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      const updates = req.body;

      // First check if the request belongs to the tenant
      const existingRequest = await serviceRequestService.getServiceRequestById(id);
      if (existingRequest?.tenantId !== tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND });
      }

      const request = await serviceRequestService.updateServiceRequest(id, updates);

      if (!request) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND });
      }

      res.json(request);
    } catch (error) {
      logger.error('Error updating service request:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to update service request' });
    }
  }

  /**
   * Acknowledge service request
   */
  async acknowledgeServiceRequest(req: TenantRequest, res: Response) {
    try {
      const { id } = req.params;
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      const { acknowledgedBy } = req.body;

      // First check if the request belongs to the tenant
      const existingRequest = await serviceRequestService.getServiceRequestById(id);
      if (existingRequest?.tenantId !== tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND });
      }

      if (!acknowledgedBy) {
        return res.status(status.BAD_REQUEST).json({ error: 'acknowledgedBy is required' });
      }

      const request = await serviceRequestService.acknowledgeServiceRequest(id, acknowledgedBy);

      try {
        const tenantSlug = req.tenant?.slug || req.tenantId;
        if (tenantSlug) {
          handleAcknowledge(id, acknowledgedBy, tenantSlug).catch(() => {
            /* ignore */
          });
        }
      } catch {
        // don't block response on broadcast errors
      }

      if (!request) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND });
      }

      res.json(request);
    } catch (error) {
      logger.error('Error acknowledging service request:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_ACKNOWLEDGE });
    }
  }

  /**
   * Complete service request
   */
  async completeServiceRequest(req: TenantRequest, res: Response) {
    try {
      const { id } = req.params;
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;

      // First check if the request belongs to the tenant
      const existingRequest = await serviceRequestService.getServiceRequestById(id);
      if (existingRequest?.tenantId !== tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND });
      }

      const request = await serviceRequestService.completeServiceRequest(id);

      try {
        const tenantSlug = req.tenant?.slug || req.tenantId;
        if (tenantSlug) {
          // Notify socket-side handler so waiter/table rooms receive status update
          handleComplete(id, tenantSlug).catch(() => {
            /* ignore */
          });
        }
      } catch {
        // ignore broadcast errors
      }

      if (!request) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND });
      }

      res.json(request);
    } catch (error) {
      logger.error('Error completing service request:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_COMPLETE });
    }
  }

  /**
   * Delete service request
   */
  async deleteServiceRequest(req: TenantRequest, res: Response) {
    try {
      const { id } = req.params;
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;

      // First check if the request belongs to the tenant
      const existingRequest = await serviceRequestService.getServiceRequestById(id);
      if (existingRequest?.tenantId !== tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND });
      }

      const deleted = await serviceRequestService.deleteServiceRequest(id);

      if (!deleted) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND });
      }

      res.status(status.NO_CONTENT).send();
    } catch (error) {
      logger.error('Error deleting service request:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to delete service request' });
    }
  }

  /**
   * Get analytics
   */
  async getAnalytics(req: TenantRequest, res: Response) {
    try {
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      const analytics = await serviceRequestService.getAnalytics(tenantId);
      res.json(analytics);
    } catch (error) {
      logger.error('Error getting analytics:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get analytics' });
    }
  }
}
