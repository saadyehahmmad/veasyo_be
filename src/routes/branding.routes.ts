import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { TenantService } from '../services/tenant.service';
import type { TenantRequest } from '../middleware/tenant';
import logger from '../utils/logger';

// Error messages
const ERROR_MESSAGES = {
  TENANT_NOT_FOUND: 'Tenant not found',
  FAILED_TO_GET_BRANDING: 'Failed to get branding',
  FAILED_TO_UPDATE_BRANDING: 'Failed to update branding',
} as const;

const router = Router();
const tenantService = new TenantService();

// All branding routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/branding:
 *   get:
 *     summary: Get tenant branding
 *     description: Get current tenant's branding/theme settings (extracted from subdomain/header)
 *     tags: [Branding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Branding information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                 logoUrl:
 *                   type: string
 *                 primaryColor:
 *                   type: string
 *                 theme:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/', async (req: TenantRequest, res: Response) => {
  try {
    // Tenant is already extracted by extractTenant middleware and attached to req
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: ERROR_MESSAGES.TENANT_NOT_FOUND,
        message: 'Please access via subdomain or provide tenant header',
      });
    }

    const tenant = await tenantService.getTenantById(tenantId);

    if (!tenant) {
      return res.status(404).json({ error: ERROR_MESSAGES.TENANT_NOT_FOUND });
    }

    // Return only branding-related fields
    const branding = {
      name: tenant.name,
      logoUrl: tenant.logoUrl,
      faviconUrl: tenant.faviconUrl,
      primaryColor: tenant.primaryColor,
      secondaryColor: tenant.secondaryColor,
      accentColor: tenant.accentColor,
      textColor: tenant.textColor,
      languageColor: tenant.languageColor,
      backgroundPattern: tenant.backgroundPattern,
      gradientStartColor: tenant.gradientStartColor,
      gradientEndColor: tenant.gradientEndColor,
      gradientDirection: tenant.gradientDirection,
      customCss: tenant.customCss,
      theme: tenant.theme,
      facebookUrl: tenant.facebookUrl,
      instagramUrl: tenant.instagramUrl,
      twitterUrl: tenant.twitterUrl,
      linkedinUrl: tenant.linkedinUrl,
      menuUrl: tenant.menuUrl,
      settings: tenant.settings, // Include settings for customRequestEnabled
    };

    res.json(branding);
  } catch (error) {
    logger.error('Error getting branding:', error);
    res.status(500).json({ error: ERROR_MESSAGES.FAILED_TO_GET_BRANDING });
  }
});

/**
 * @swagger
 * /api/branding:
 *   put:
 *     summary: Update tenant branding
 *     description: Update current tenant's branding/theme settings (admin, superadmin only)
 *     tags: [Branding]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               primaryColor:
 *                 type: string
 *               secondaryColor:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *               theme:
 *                 type: string
 *     responses:
 *       200:
 *         description: Branding updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put('/', async (req: TenantRequest, res: Response) => {
  try {
    // Tenant is already extracted by extractTenant middleware
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: ERROR_MESSAGES.TENANT_NOT_FOUND,
        message: 'Please access via subdomain or provide tenant header',
      });
    }

    const user = (req as AuthRequest).user;
    // Only admins and superadmins can update branding
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only administrators can update branding settings',
      });
    }

    // Verify user belongs to this tenant (unless superadmin)
    if (!user.isSuperAdmin && user.tenantId !== tenantId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only update branding for your own tenant',
      });
    }

    const brandingData = req.body;

    // Validate branding data
    const allowedFields = [
      'name',
      'logoUrl',
      'faviconUrl',
      'primaryColor',
      'secondaryColor',
      'accentColor',
      'textColor',
      'languageColor',
      'backgroundPattern',
      'gradientStartColor',
      'gradientEndColor',
      'gradientDirection',
      'customCss',
      'theme',
      'facebookUrl',
      'instagramUrl',
      'twitterUrl',
      'linkedinUrl',
      'menuUrl',
      'settings',
    ];

    const filteredData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (brandingData[field] !== undefined) {
        filteredData[field] = brandingData[field];
      }
    }

    // Validate color format (if provided)
    const colorFields = [
      'primaryColor',
      'secondaryColor',
      'accentColor',
      'textColor',
      'languageColor',
      'gradientStartColor',
      'gradientEndColor',
    ];
    for (const colorField of colorFields) {
      if (filteredData[colorField]) {
        const color = filteredData[colorField];
        if (!/^#[0-9A-Fa-f]{6}$/.test(color as string)) {
          return res.status(400).json({
            error: 'Invalid color format',
            message: `${colorField} must be a valid hex color (e.g., #667eea)`,
          });
        }
      }
    }

    // Validate menuUrl format (if provided)
    if (filteredData.menuUrl !== null && filteredData.menuUrl !== undefined) {
      const menuUrl = filteredData.menuUrl as string;
      if (menuUrl.trim() !== '') {
        try {
          new URL(menuUrl);
        } catch {
          return res.status(400).json({
            error: 'Invalid URL format',
            message: 'menuUrl must be a valid URL (e.g., https://www.example.com)',
          });
        }
      } else {
        // Empty string should be converted to null
        filteredData.menuUrl = null;
      }
    }

    const updatedTenant = await tenantService.updateTenantBranding(tenantId, filteredData);

    if (!updatedTenant) {
      return res.status(404).json({ error: ERROR_MESSAGES.TENANT_NOT_FOUND });
    }

    // Return only branding fields
    const branding = {
      name: updatedTenant.name,
      logoUrl: updatedTenant.logoUrl,
      faviconUrl: updatedTenant.faviconUrl,
      primaryColor: updatedTenant.primaryColor,
      secondaryColor: updatedTenant.secondaryColor,
      accentColor: updatedTenant.accentColor,
      textColor: updatedTenant.textColor,
      languageColor: updatedTenant.languageColor,
      backgroundPattern: updatedTenant.backgroundPattern,
      gradientStartColor: updatedTenant.gradientStartColor,
      gradientEndColor: updatedTenant.gradientEndColor,
      gradientDirection: updatedTenant.gradientDirection,
      customCss: updatedTenant.customCss,
      theme: updatedTenant.theme,
      facebookUrl: updatedTenant.facebookUrl,
      instagramUrl: updatedTenant.instagramUrl,
      twitterUrl: updatedTenant.twitterUrl,
      linkedinUrl: updatedTenant.linkedinUrl,
      menuUrl: updatedTenant.menuUrl,
      settings: updatedTenant.settings, // Include settings for customRequestEnabled
    };

    logger.info(`✅ Branding updated for tenant ${tenantId} by user ${user.email}`);
    res.json(branding);
  } catch (error) {
    logger.error('Error updating branding:', error);
    res.status(500).json({ error: ERROR_MESSAGES.FAILED_TO_UPDATE_BRANDING });
  }
});

export default router;
