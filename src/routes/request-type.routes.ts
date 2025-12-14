import { Router } from 'express';
import { requestTypeController } from '../controllers/request-type.controller';
import { authenticate } from '../middleware/auth';
import { extractTenant } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';

const router = Router();

// Public endpoint for customer component (no auth required)
router.get('/public', extractTenant, requestTypeController.getPublicRequestTypes.bind(requestTypeController));

// Protected routes - require authentication, tenant context, and admin/manager role
router.use(authenticate);
router.use(extractTenant);
router.use(requireRole(['admin', 'superadmin']));

// Get all request types for current tenant
router.get('/', requestTypeController.getAllRequestTypes.bind(requestTypeController));

// Reorder request types (must be before /:id routes to avoid conflict)
router.put('/reorder', requestTypeController.reorderRequestTypes.bind(requestTypeController));

// Get single request type by ID
router.get('/:id', requestTypeController.getRequestTypeById.bind(requestTypeController));

// Create new request type
router.post('/', requestTypeController.createRequestType.bind(requestTypeController));

// Update request type
router.put('/:id', requestTypeController.updateRequestType.bind(requestTypeController));

// Delete request type
router.delete('/:id', requestTypeController.deleteRequestType.bind(requestTypeController));

export default router;
