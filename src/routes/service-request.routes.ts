import { Router } from 'express';
import { ServiceRequestController } from '../controllers/service-request.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const router = Router();
const serviceRequestController = new ServiceRequestController();

// All routes require authentication
router.use(authenticate);

/**
 * @route GET /api/service-requests
 * @desc Get all service requests (tenant-scoped)
 * @access Authenticated (Admin, Waiter, SuperAdmin)
 */
router.get('/', serviceRequestController.getAllServiceRequests.bind(serviceRequestController));

/**
 * @route GET /api/service-requests/:id
 * @desc Get service request by ID
 * @access Authenticated
 */
router.get('/:id', serviceRequestController.getServiceRequestById.bind(serviceRequestController));

/**
 * @route POST /api/service-requests
 * @desc Create new service request
 * @access Authenticated (Waiters, Customers via special token?)
 */
router.post('/', serviceRequestController.createServiceRequest.bind(serviceRequestController));

/**
 * @route PUT /api/service-requests/:id
 * @desc Update service request
 * @access Waiter, Admin, SuperAdmin
 */
router.put(
  '/:id',
  requireRole(['waiter', 'admin', 'superadmin']),
  serviceRequestController.updateServiceRequest.bind(serviceRequestController),
);

/**
 * @route PUT /api/service-requests/:id/acknowledge
 * @desc Acknowledge service request
 * @access Waiter, Admin, SuperAdmin
 */
router.put(
  '/:id/acknowledge',
  requireRole(['waiter', 'admin', 'superadmin']),
  serviceRequestController.acknowledgeServiceRequest.bind(serviceRequestController),
);

/**
 * @route PUT /api/service-requests/:id/complete
 * @desc Complete service request
 * @access Waiter, Admin, SuperAdmin
 */
router.put(
  '/:id/complete',
  requireRole(['waiter', 'admin', 'superadmin']),
  serviceRequestController.completeServiceRequest.bind(serviceRequestController),
);

/**
 * @route DELETE /api/service-requests/:id
 * @desc Delete service request
 * @access Admin, SuperAdmin
 */
router.delete(
  '/:id',
  requireRole(['admin', 'superadmin']),
  serviceRequestController.deleteServiceRequest.bind(serviceRequestController),
);

export default router;
