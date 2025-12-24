import { Router } from 'express';
import { requestTypeController } from '../controllers/request-type.controller';
import { authenticate } from '../middleware/auth';
import { extractTenant } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';

const router = Router();

/**
 * @swagger
 * /api/request-types/public:
 *   get:
 *     summary: Get public request types
 *     description: Get list of request types for public/customer access (no authentication required)
 *     tags: [Request Types]
 *     responses:
 *       200:
 *         description: List of public request types
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   icon:
 *                     type: string
 *                   order:
 *                     type: number
 */
router.get('/public', extractTenant, requestTypeController.getPublicRequestTypes.bind(requestTypeController));

// Protected routes - require authentication, tenant context, and admin/manager role
router.use(authenticate);
router.use(extractTenant);
router.use(requireRole(['admin', 'superadmin']));

/**
 * @swagger
 * /api/request-types:
 *   get:
 *     summary: Get all request types
 *     description: Get all request types for current tenant (admin, superadmin only)
 *     tags: [Request Types]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of request types
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/', requestTypeController.getAllRequestTypes.bind(requestTypeController));

/**
 * @swagger
 * /api/request-types/reorder:
 *   put:
 *     summary: Reorder request types
 *     description: Update the order of request types (admin, superadmin only)
 *     tags: [Request Types]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requestTypeIds
 *             properties:
 *               requestTypeIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of request type IDs in desired order
 *     responses:
 *       200:
 *         description: Request types reordered successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put('/reorder', requestTypeController.reorderRequestTypes.bind(requestTypeController));

/**
 * @swagger
 * /api/request-types/{id}:
 *   get:
 *     summary: Get request type by ID
 *     description: Get a specific request type by ID (admin, superadmin only)
 *     tags: [Request Types]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Request type ID
 *     responses:
 *       200:
 *         description: Request type details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id', requestTypeController.getRequestTypeById.bind(requestTypeController));

/**
 * @swagger
 * /api/request-types:
 *   post:
 *     summary: Create request type
 *     description: Create a new request type (admin, superadmin only)
 *     tags: [Request Types]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Call Waiter"
 *               icon:
 *                 type: string
 *                 example: "bell"
 *               order:
 *                 type: number
 *                 example: 1
 *               active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Request type created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post('/', requestTypeController.createRequestType.bind(requestTypeController));

/**
 * @swagger
 * /api/request-types/{id}:
 *   put:
 *     summary: Update request type
 *     description: Update a request type (admin, superadmin only)
 *     tags: [Request Types]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Request type ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               icon:
 *                 type: string
 *               order:
 *                 type: number
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Request type updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put('/:id', requestTypeController.updateRequestType.bind(requestTypeController));

/**
 * @swagger
 * /api/request-types/{id}:
 *   delete:
 *     summary: Delete request type
 *     description: Delete a request type (admin, superadmin only)
 *     tags: [Request Types]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Request type ID
 *     responses:
 *       204:
 *         description: Request type deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete('/:id', requestTypeController.deleteRequestType.bind(requestTypeController));

export default router;
