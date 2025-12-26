import { Response } from 'express';
import { SubscriptionService } from '../services/subscription.service';
import { PricingService } from '../services/pricing.service';
import { TenantRequest } from '../middleware/tenant';
import logger from '../utils/logger';

export class SubscriptionController {
  private _subscriptionService: SubscriptionService;

  constructor() {
    this._subscriptionService = new SubscriptionService();
  }

  /**
   * Get current tenant's subscription
   * GET /api/subscription
   */
  async getMySubscription(req: TenantRequest, res: Response) {
    try {
      const tenantId = req.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Tenant ID is required',
        });
      }

      const details = await this._subscriptionService.getSubscriptionWithUsage(tenantId);

      if (!details) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Subscription not found for this tenant',
        });
      }

      return res.status(200).json(details);
    } catch (error) {
      logger.error('Error getting tenant subscription:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get subscription',
      });
    }
  }

  /**
   * Get available pricing plans
   * GET /api/subscription/plans
   */
  async getAvailablePlans(req: TenantRequest, res: Response) {
    try {
      const plans = PricingService.getAllPlans();
      const addons = PricingService.getAddonPricing();

      return res.status(200).json({
        plans,
        addons,
      });
    } catch (error) {
      logger.error('Error getting pricing plans:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get pricing plans',
      });
    }
  }

  /**
   * Calculate custom plan price
   * POST /api/subscription/calculate
   */
  async calculatePrice(req: TenantRequest, res: Response) {
    try {
      const { tables, waiters, printers } = req.body;

      if (!tables || !waiters) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Tables and waiters are required',
        });
      }

      const calculation = PricingService.calculateCustomPlan(tables, waiters, printers || 0);

      return res.status(200).json(calculation);
    } catch (error) {
      logger.error('Error calculating price:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to calculate price',
      });
    }
  }

  /**
   * Request subscription upgrade
   * POST /api/subscription/upgrade-request
   */
  async requestUpgrade(req: TenantRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      const { plan, tables, waiters, printers, notes } = req.body;

      if (!tenantId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Tenant ID is required',
        });
      }

      if (!plan) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Plan is required',
        });
      }

      // Log the upgrade request for superadmin to review
      logger.info('Subscription upgrade requested:', {
        tenantId,
        plan,
        tables,
        waiters,
        printers,
        notes,
      });

      // TODO: Create a notification/ticket for superadmin
      // For now, just return success
      return res.status(200).json({
        message: 'Upgrade request submitted successfully. A superadmin will review your request shortly.',
        requestDetails: {
          plan,
          tables,
          waiters,
          printers,
          notes,
        },
      });
    } catch (error) {
      logger.error('Error requesting upgrade:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to submit upgrade request',
      });
    }
  }
}

