import { Router } from 'express';
import { ServiceRequestController } from '../controllers/service-request.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import {
  createServiceRequestSchema,
  updateServiceRequestSchema,
  acknowledgeRequestSchema,
  serviceRequestIdParamSchema,
  getServiceRequestsQuerySchema,
} from '../validators/service-request.validator';

const router = Router();
const serviceRequestController = new ServiceRequestController();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/service-requests:
 *   get:
 *     summary: Get all service requests
 *     description: Get all service requests for the tenant with pagination, filtering, and sorting
 *     tags: [Service Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, acknowledged, completed, cancelled]
 *         description: Filter by status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by request type
 *       - in: query
 *         name: tableId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by table ID
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [timestampCreated, status, requestType, tableNumber, durationSeconds]
 *           default: timestampCreated
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of service requests
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ServiceRequest'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  '/',
  validateQuery(getServiceRequestsQuerySchema),
  serviceRequestController.getAllServiceRequests.bind(serviceRequestController)
);

/**
 * @swagger
 * /api/service-requests/analytics:
 *   get:
 *     summary: Get service request analytics
 *     description: Get analytics data for service requests (admin and superadmin only)
 *     tags: [Service Requests]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalRequests:
 *                   type: number
 *                 pendingRequests:
 *                   type: number
 *                 completedRequests:
 *                   type: number
 *                 averageResponseTime:
 *                   type: number
 *                 requestsByType:
 *                   type: object
 *                 requestsByTable:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get(
  '/analytics',
  requireRole(['admin', 'superadmin']),
  serviceRequestController.getAnalytics.bind(serviceRequestController),
);

/**
 * @swagger
 * /api/service-requests/{id}:
 *   get:
 *     summary: Get service request by ID
 *     description: Get a specific service request by ID
 *     tags: [Service Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service request ID
 *     responses:
 *       200:
 *         description: Service request details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServiceRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get(
  '/:id',
  validateParams(serviceRequestIdParamSchema),
  serviceRequestController.getServiceRequestById.bind(serviceRequestController)
);

/**
 * @swagger
 * /api/service-requests:
 *   post:
 *     summary: Create new service request
 *     description: Create a new service request
 *     tags: [Service Requests]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tableId
 *               - requestType
 *             properties:
 *               tableId:
 *                 type: string
 *                 format: uuid
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               requestType:
 *                 type: string
 *                 example: "call_waiter"
 *               customNote:
 *                 type: string
 *                 maxLength: 500
 *                 example: "Need assistance with menu"
 *     responses:
 *       201:
 *         description: Service request created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServiceRequest'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post(
  '/',
  validateBody(createServiceRequestSchema),
  serviceRequestController.createServiceRequest.bind(serviceRequestController)
);

/**
 * @swagger
 * /api/service-requests/{id}:
 *   put:
 *     summary: Update service request
 *     description: Update a service request (waiter, admin, superadmin only)
 *     tags: [Service Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service request ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, acknowledged, completed, cancelled]
 *               customNote:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Service request updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServiceRequest'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put(
  '/:id',
  requireRole(['waiter', 'admin', 'superadmin']),
  validateParams(serviceRequestIdParamSchema),
  validateBody(updateServiceRequestSchema),
  serviceRequestController.updateServiceRequest.bind(serviceRequestController),
);

/**
 * @swagger
 * /api/service-requests/{id}/acknowledge:
 *   put:
 *     summary: Acknowledge service request
 *     description: Acknowledge a service request (waiter, admin, superadmin only)
 *     tags: [Service Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service request ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - acknowledgedBy
 *             properties:
 *               acknowledgedBy:
 *                 type: string
 *                 format: uuid
 *                 description: User ID of the person acknowledging
 *     responses:
 *       200:
 *         description: Service request acknowledged successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServiceRequest'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put(
  '/:id/acknowledge',
  requireRole(['waiter', 'admin', 'superadmin']),
  validateParams(serviceRequestIdParamSchema),
  validateBody(acknowledgeRequestSchema),
  serviceRequestController.acknowledgeServiceRequest.bind(serviceRequestController),
);

/**
 * @swagger
 * /api/service-requests/{id}/complete:
 *   put:
 *     summary: Complete service request
 *     description: Mark a service request as completed (waiter, admin, superadmin only)
 *     tags: [Service Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service request ID
 *     responses:
 *       200:
 *         description: Service request completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServiceRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put(
  '/:id/complete',
  requireRole(['waiter', 'admin', 'superadmin']),
  validateParams(serviceRequestIdParamSchema),
  serviceRequestController.completeServiceRequest.bind(serviceRequestController),
);

/**
 * @swagger
 * /api/service-requests/{id}:
 *   delete:
 *     summary: Delete service request
 *     description: Delete a service request (admin, superadmin only)
 *     tags: [Service Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service request ID
 *     responses:
 *       204:
 *         description: Service request deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete(
  '/:id',
  requireRole(['admin', 'superadmin']),
  validateParams(serviceRequestIdParamSchema),
  serviceRequestController.deleteServiceRequest.bind(serviceRequestController),
);

export default router;
