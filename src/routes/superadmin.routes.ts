import { Router } from 'express';
import { SuperAdminController } from '../controllers/superadmin.controller';
import { authenticate } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/rbac';

// Route paths
const ROUTE_PATHS = {
  USERS_BY_ID: '/users/:id',
} as const;

const router = Router();
const superAdminController = new SuperAdminController();

// All routes require authentication and superadmin role
router.use(authenticate);
router.use(requireSuperAdmin());

/**
 * @swagger
 * /api/superadmin/tenants/search:
 *   get:
 *     summary: Search tenants
 *     description: Search tenants for autocomplete/dropdowns (superadmin only)
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: List of matching tenants
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/tenants/search', superAdminController.searchTenants.bind(superAdminController));

/**
 * @swagger
 * /api/superadmin/tenants:
 *   get:
 *     summary: Get all tenants
 *     description: Get all tenants with subscription information (superadmin only)
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all tenants
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/tenants', superAdminController.getAllTenants.bind(superAdminController));

/**
 * @swagger
 * /api/superadmin/tenants/{id}:
 *   get:
 *     summary: Get tenant details
 *     description: Get detailed information about a tenant (superadmin only)
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Tenant details
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/tenants/:id', superAdminController.getTenantDetails.bind(superAdminController));

/**
 * @swagger
 * /api/superadmin/tenants/{id}:
 *   put:
 *     summary: Update tenant
 *     description: Update tenant information (superadmin only)
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Tenant updated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put('/tenants/:id', superAdminController.updateTenant.bind(superAdminController));

/**
 * @swagger
 * /api/superadmin/tenants/{id}/activate:
 *   post:
 *     summary: Activate tenant
 *     description: Activate a tenant account (superadmin only)
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Tenant activated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  '/tenants/:id/activate',
  superAdminController.activateTenant.bind(superAdminController),
);

/**
 * @swagger
 * /api/superadmin/tenants/{id}/deactivate:
 *   post:
 *     summary: Deactivate tenant
 *     description: Deactivate/block a tenant account (superadmin only)
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Tenant deactivated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  '/tenants/:id/deactivate',
  superAdminController.deactivateTenant.bind(superAdminController),
);

/**
 * @swagger
 * /api/superadmin/analytics:
 *   get:
 *     summary: Get platform analytics
 *     description: Get platform-wide analytics data (superadmin only)
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform analytics
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/analytics', superAdminController.getPlatformAnalytics.bind(superAdminController));

/**
 * @swagger
 * /api/superadmin/subscriptions:
 *   get:
 *     summary: Get all subscriptions
 *     description: Get all subscriptions with expiring/expired information (superadmin only)
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of subscriptions
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/subscriptions', superAdminController.getAllSubscriptions.bind(superAdminController));

/**
 * @route GET /api/superadmin/audit-logs
 * @desc Get recent audit logs
 * @access SuperAdmin
 */
router.get('/audit-logs', superAdminController.getAuditLogs.bind(superAdminController));

/**
 * @route GET /api/superadmin/tenants/:id/audit-logs
 * @desc Get tenant-specific audit logs
 * @access SuperAdmin
 */
router.get(
  '/tenants/:id/audit-logs',
  superAdminController.getTenantAuditLogs.bind(superAdminController),
);

// ============================================
// SUPERADMIN USER MANAGEMENT (Cross-tenant)
// ============================================

/**
 * @swagger
 * /api/superadmin/users:
 *   get:
 *     summary: Get all users
 *     description: Get all users across all tenants (superadmin only)
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all users
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/users', superAdminController.getAllUsers.bind(superAdminController));

/**
 * @swagger
 * /api/superadmin/users/{id}:
 *   get:
 *     summary: Get user details
 *     description: Get user details by ID (superadmin only)
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User details
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get(ROUTE_PATHS.USERS_BY_ID, superAdminController.getUserDetails.bind(superAdminController));

/**
 * @swagger
 * /api/superadmin/users/{id}:
 *   put:
 *     summary: Update user
 *     description: Update user (can change tenant, role, etc.) (superadmin only)
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: User updated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put(ROUTE_PATHS.USERS_BY_ID, superAdminController.updateUser.bind(superAdminController));

/**
 * @swagger
 * /api/superadmin/users/{id}:
 *   delete:
 *     summary: Delete user
 *     description: Delete a user (superadmin only)
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: User deleted
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete(ROUTE_PATHS.USERS_BY_ID, superAdminController.deleteUser.bind(superAdminController));

/**
 * @swagger
 * /api/superadmin/users:
 *   post:
 *     summary: Create user
 *     description: Create user for any tenant (superadmin only)
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - tenantId
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *               role:
 *                 type: string
 *                 enum: [admin, waiter, superadmin]
 *     responses:
 *       201:
 *         description: User created
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post('/users', superAdminController.createUser.bind(superAdminController));

/**
 * @route POST /api/superadmin/users/:userId/reset-password
 * @desc Reset user password (superadmin only)
 * @access SuperAdmin
 */
router.post('/users/:userId/reset-password', superAdminController.resetUserPassword.bind(superAdminController));

export default router;
