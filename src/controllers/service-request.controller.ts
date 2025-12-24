import { Response, NextFunction } from 'express';
import { ServiceRequestService } from '../services/service-request.service';
import { handleAcknowledge, handleComplete } from '../handlers/requestHandler';
import { TenantRequest } from '../middleware/tenant';
import { 
  NotFoundError, 
  BadRequestError 
} from '../errors/AppError';
import { GetServiceRequestsQuery } from '../validators/service-request.validator';

const serviceRequestService = new ServiceRequestService();
export class ServiceRequestController {
  /**
   * Get all service requests for the tenant with pagination, filtering, and sorting
   */
  async getAllServiceRequests(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      if (!req.tenantId) {
        throw new BadRequestError('Tenant ID is required', 'TENANT_ID_REQUIRED');
      }

      // Query is validated by middleware, so we can safely cast it to the validated type
      const query = req.query as unknown as GetServiceRequestsQuery;

      const options = {
        page: query.page || 1,
        limit: query.limit || 10,
        filters: {
          status: query.status,
          type: query.type,
          tableId: query.tableId,
        },
        sort: {
          by: query.sortBy || 'timestampCreated',
          order: query.sortOrder || ('desc' as 'asc' | 'desc'),
        },
      };

      const result = await serviceRequestService.getServiceRequestsWithPagination(
        req.tenantId,
        options,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get service request by ID
   */
  async getServiceRequestById(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!req.tenantId) {
        throw new BadRequestError('Tenant ID is required', 'TENANT_ID_REQUIRED');
      }

      const request = await serviceRequestService.getServiceRequestById(id);

      if (!request || request.tenantId !== req.tenantId) {
        throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');
      }

      res.json(request);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create new service request
   */
  async createServiceRequest(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      if (!req.tenantId) {
        throw new BadRequestError('Tenant ID is required', 'TENANT_ID_REQUIRED');
      }

      const requestData = req.body;

      const request = await serviceRequestService.createServiceRequest({
        ...requestData,
        tenantId: req.tenantId,
      });
      
      res.status(201).json(request);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update service request
   */
  async updateServiceRequest(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!req.tenantId) {
        throw new BadRequestError('Tenant ID is required', 'TENANT_ID_REQUIRED');
      }

      const updates = req.body;

      // First check if the request belongs to the tenant
      const existingRequest = await serviceRequestService.getServiceRequestById(id);
      if (!existingRequest || existingRequest.tenantId !== req.tenantId) {
        throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');
      }

      const request = await serviceRequestService.updateServiceRequest(id, updates);

      if (!request) {
        throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');
      }

      res.json(request);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Acknowledge service request
   */
  async acknowledgeServiceRequest(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!req.tenantId) {
        throw new BadRequestError('Tenant ID is required', 'TENANT_ID_REQUIRED');
      }

      const { acknowledgedBy } = req.body;

      // First check if the request belongs to the tenant
      const existingRequest = await serviceRequestService.getServiceRequestById(id);
      if (!existingRequest || existingRequest.tenantId !== req.tenantId) {
        throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');
      }

      if (!acknowledgedBy) {
        throw new BadRequestError('acknowledgedBy is required', 'ACKNOWLEDGED_BY_REQUIRED');
      }

      const request = await serviceRequestService.acknowledgeServiceRequest(id, acknowledgedBy);

      // Broadcast acknowledgment via Socket.IO (non-blocking)
      try {
        const tenantSlug = req.tenant?.slug || req.tenantId;
        if (tenantSlug) {
          handleAcknowledge(id, acknowledgedBy, tenantSlug).catch(() => {
            /* ignore - don't block response on broadcast errors */
          });
        }
      } catch {
        // don't block response on broadcast errors
      }

      if (!request) {
        throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');
      }

      res.json(request);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Complete service request
   */
  async completeServiceRequest(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!req.tenantId) {
        throw new BadRequestError('Tenant ID is required', 'TENANT_ID_REQUIRED');
      }

      // First check if the request belongs to the tenant
      const existingRequest = await serviceRequestService.getServiceRequestById(id);
      if (!existingRequest || existingRequest.tenantId !== req.tenantId) {
        throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');
      }

      const request = await serviceRequestService.completeServiceRequest(id);

      // Broadcast completion via Socket.IO (non-blocking)
      try {
        const tenantSlug = req.tenant?.slug || req.tenantId;
        if (tenantSlug) {
          // Notify socket-side handler so waiter/table rooms receive status update
          handleComplete(id, tenantSlug).catch(() => {
            /* ignore - don't block response on broadcast errors */
          });
        }
      } catch {
        // ignore broadcast errors
      }

      if (!request) {
        throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');
      }

      res.json(request);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete service request
   */
  async deleteServiceRequest(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!req.tenantId) {
        throw new BadRequestError('Tenant ID is required', 'TENANT_ID_REQUIRED');
      }

      // First check if the request belongs to the tenant
      const existingRequest = await serviceRequestService.getServiceRequestById(id);
      if (!existingRequest || existingRequest.tenantId !== req.tenantId) {
        throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');
      }

      const deleted = await serviceRequestService.deleteServiceRequest(id);

      if (!deleted) {
        throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get analytics
   */
  async getAnalytics(req: TenantRequest, res: Response, next: NextFunction) {
    try {
      if (!req.tenantId) {
        throw new BadRequestError('Tenant ID is required', 'TENANT_ID_REQUIRED');
      }

      const analytics = await serviceRequestService.getAnalytics(req.tenantId);
      res.json(analytics);
    } catch (error) {
      next(error);
    }
  }
}
