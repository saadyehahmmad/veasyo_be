import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscription.controller';
import { authenticate } from '../middleware/auth';
import { requireTenantAdmin } from '../middleware/rbac';
import { extractTenant } from '../middleware/tenant';

const router = Router();
const subscriptionController = new SubscriptionController();

/**
 * Subscription routes for tenant admins
 * Base path: /api/subscription
 * 
 * Middleware order is important:
 * 1. authenticate - validates JWT and sets req.tenantId from token
 * 2. extractTenant - uses req.tenantId to fetch tenant details
 * 3. requireTenantAdmin - checks if user is admin
 * 
 * These routes allow tenant admins to:
 * - View their own subscription
 * - View available plans
 * - Calculate custom pricing
 * - Request upgrades
 * 
 * Note: These are separate from /api/superadmin/subscriptions which allow
 * superadmins to manage all tenants' subscriptions
 */

// Get current tenant's subscription (admin only)
router.get(
  '/',
  authenticate,
  extractTenant,
  requireTenantAdmin(),
  subscriptionController.getMySubscription.bind(subscriptionController)
);

// Get available pricing plans (admin only)
router.get(
  '/plans',
  authenticate,
  extractTenant,
  requireTenantAdmin(),
  subscriptionController.getAvailablePlans.bind(subscriptionController)
);

// Calculate custom plan price (admin only)
router.post(
  '/calculate',
  authenticate,
  extractTenant,
  requireTenantAdmin(),
  subscriptionController.calculatePrice.bind(subscriptionController)
);

// Request subscription upgrade (admin only)
router.post(
  '/upgrade-request',
  authenticate,
  extractTenant,
  requireTenantAdmin(),
  subscriptionController.requestUpgrade.bind(subscriptionController)
);

export default router;

