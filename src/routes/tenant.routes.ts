import { Router } from 'express';
import { TenantController } from '../controllers/tenant.controller';
import { authenticate } from '../middleware/auth';
import { requireSuperAdmin, requireRole } from '../middleware/rbac';

const router = Router();
const tenantController = new TenantController();

/**
 * @swagger
 * /api/tenants/branding/{subdomain}:
 *   get:
 *     summary: Get tenant branding by subdomain
 *     description: Public endpoint to get tenant branding/theme information by subdomain
 *     tags: [Tenants]
 *     parameters:
 *       - in: path
 *         name: subdomain
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant subdomain
 *     responses:
 *       200:
 *         description: Tenant branding information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 name:
 *                   type: string
 *                 primaryColor:
 *                   type: string
 *                 logoUrl:
 *                   type: string
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get(
  '/branding/:subdomain',
  tenantController.getTenantBrandingBySubdomain.bind(tenantController),
);

// All other tenant management routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/tenants/me:
 *   get:
 *     summary: Get current user's tenant
 *     description: Get tenant information for the currently authenticated user
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user's tenant information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/me', tenantController.getMyTenant.bind(tenantController));

/**
 * @swagger
 * /api/tenants:
 *   get:
 *     summary: Get all tenants
 *     description: Get list of all tenants (superadmin only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all tenants
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
router.get('/', requireSuperAdmin(), tenantController.getAllTenants.bind(tenantController));

/**
 * @swagger
 * /api/tenants/{id}:
 *   get:
 *     summary: Get tenant by ID
 *     description: Get tenant details by ID (superadmin only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tenant details
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
router.get('/:id', requireSuperAdmin(), tenantController.getTenantById.bind(tenantController));

/**
 * @swagger
 * /api/tenants:
 *   post:
 *     summary: Create new tenant
 *     description: Create a new tenant (superadmin only)
 *     tags: [Tenants]
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
 *               - slug
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               subdomain:
 *                 type: string
 *               plan:
 *                 type: string
 *                 enum: [free, basic, premium, enterprise]
 *     responses:
 *       201:
 *         description: Tenant created successfully
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
router.post('/', requireSuperAdmin(), tenantController.createTenant.bind(tenantController));

/**
 * @swagger
 * /api/tenants/{id}:
 *   put:
 *     summary: Update tenant
 *     description: Update tenant information (superadmin only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               plan:
 *                 type: string
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Tenant updated successfully
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
router.put('/:id', requireSuperAdmin(), tenantController.updateTenant.bind(tenantController));

/**
 * @swagger
 * /api/tenants/{id}:
 *   delete:
 *     summary: Delete tenant
 *     description: Delete a tenant (superadmin only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID
 *     responses:
 *       204:
 *         description: Tenant deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete('/:id', requireSuperAdmin(), tenantController.deleteTenant.bind(tenantController));

/**
 * @swagger
 * /api/tenants/{id}/branding:
 *   put:
 *     summary: Update tenant branding
 *     description: Update tenant branding/theme settings (admin for own tenant, superadmin for any)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tenant ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               primaryColor:
 *                 type: string
 *                 example: "#667eea"
 *               secondaryColor:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *               backgroundPattern:
 *                 type: string
 *     responses:
 *       200:
 *         description: Branding updated successfully
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
router.put(
  '/:id/branding',
  requireRole(['admin', 'superadmin']),
  tenantController.updateTenantBranding.bind(tenantController),
);

export default router;
