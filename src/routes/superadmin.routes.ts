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
 * @route GET /api/superadmin/tenants/search
 * @desc Search tenants (for autocomplete/dropdowns)
 * @access SuperAdmin
 */
router.get('/tenants/search', superAdminController.searchTenants.bind(superAdminController));

/**
 * @route GET /api/superadmin/tenants
 * @desc Get all tenants with subscription info
 * @access SuperAdmin
 */
router.get('/tenants', superAdminController.getAllTenants.bind(superAdminController));

/**
 * @route GET /api/superadmin/tenants/:id
 * @desc Get tenant details
 * @access SuperAdmin
 */
router.get('/tenants/:id', superAdminController.getTenantDetails.bind(superAdminController));

/**
 * @route PUT /api/superadmin/tenants/:id
 * @desc Update tenant
 * @access SuperAdmin
 */
router.put('/tenants/:id', superAdminController.updateTenant.bind(superAdminController));

/**
 * @route POST /api/superadmin/tenants/:id/activate
 * @desc Activate tenant
 * @access SuperAdmin
 */
router.post(
  '/tenants/:id/activate',
  superAdminController.activateTenant.bind(superAdminController),
);

/**
 * @route POST /api/superadmin/tenants/:id/deactivate
 * @desc Deactivate/block tenant
 * @access SuperAdmin
 */
router.post(
  '/tenants/:id/deactivate',
  superAdminController.deactivateTenant.bind(superAdminController),
);

/**
 * @route GET /api/superadmin/analytics
 * @desc Get platform-wide analytics
 * @access SuperAdmin
 */
router.get('/analytics', superAdminController.getPlatformAnalytics.bind(superAdminController));

/**
 * @route GET /api/superadmin/subscriptions
 * @desc Get all subscriptions with expiring/expired info
 * @access SuperAdmin
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
 * @route GET /api/superadmin/users
 * @desc Get all users across all tenants
 * @access SuperAdmin
 */
router.get('/users', superAdminController.getAllUsers.bind(superAdminController));

/**
 * @route GET /api/superadmin/users/:id
 * @desc Get user details by ID
 * @access SuperAdmin
 */
router.get(ROUTE_PATHS.USERS_BY_ID, superAdminController.getUserDetails.bind(superAdminController));

/**
 * @route PUT /api/superadmin/users/:id
 * @desc Update user (can change tenant, role, etc.)
 * @access SuperAdmin
 */
router.put(ROUTE_PATHS.USERS_BY_ID, superAdminController.updateUser.bind(superAdminController));

/**
 * @route DELETE /api/superadmin/users/:id
 * @desc Delete user
 * @access SuperAdmin
 */
router.delete(ROUTE_PATHS.USERS_BY_ID, superAdminController.deleteUser.bind(superAdminController));

/**
 * @route POST /api/superadmin/users
 * @desc Create user for any tenant
 * @access SuperAdmin
 */
router.post('/users', superAdminController.createUser.bind(superAdminController));

/**
 * @route POST /api/superadmin/users/:userId/reset-password
 * @desc Reset user password (superadmin only)
 * @access SuperAdmin
 */
router.post('/users/:userId/reset-password', superAdminController.resetUserPassword.bind(superAdminController));

export default router;
