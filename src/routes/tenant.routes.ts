import { Router } from 'express';
import { TenantController } from '../controllers/tenant.controller';
import { authenticate } from '../middleware/auth';
import { requireSuperAdmin, requireRole } from '../middleware/rbac';

const router = Router();
const tenantController = new TenantController();

/**
 * @route GET /api/tenants/branding/:subdomain
 * @desc Get tenant branding by subdomain (public)
 * @access Public
 */
router.get(
  '/branding/:subdomain',
  tenantController.getTenantBrandingBySubdomain.bind(tenantController),
);

// All other tenant management routes require authentication
router.use(authenticate);

/**
 * @route GET /api/tenants/me
 * @desc Get current user's tenant info
 * @access Authenticated users
 */
router.get('/me', tenantController.getMyTenant.bind(tenantController));

/**
 * @route GET /api/tenants
 * @desc Get all tenants
 * @access SuperAdmin
 */
router.get('/', requireSuperAdmin(), tenantController.getAllTenants.bind(tenantController));

/**
 * @route GET /api/tenants/:id
 * @desc Get tenant by ID
 * @access SuperAdmin
 */
router.get('/:id', requireSuperAdmin(), tenantController.getTenantById.bind(tenantController));

/**
 * @route POST /api/tenants
 * @desc Create new tenant
 * @access SuperAdmin
 */
router.post('/', requireSuperAdmin(), tenantController.createTenant.bind(tenantController));

/**
 * @route PUT /api/tenants/:id
 * @desc Update tenant
 * @access SuperAdmin
 */
router.put('/:id', requireSuperAdmin(), tenantController.updateTenant.bind(tenantController));

/**
 * @route DELETE /api/tenants/:id
 * @desc Delete tenant
 * @access SuperAdmin
 */
router.delete('/:id', requireSuperAdmin(), tenantController.deleteTenant.bind(tenantController));

/**
 * @route PUT /api/tenants/:id/branding
 * @desc Update tenant branding/theme
 * @access Admin (own tenant) or SuperAdmin
 */
router.put(
  '/:id/branding',
  requireRole(['admin', 'superadmin']),
  tenantController.updateTenantBranding.bind(tenantController),
);

export default router;
