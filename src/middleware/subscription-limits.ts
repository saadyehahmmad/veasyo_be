import { Response, NextFunction } from 'express';
import { TenantRequest } from './tenant';
import { SubscriptionService } from '../services/subscription.service';
import logger from '../utils/logger';

const subscriptionService = new SubscriptionService();

/**
 * Middleware to check if tenant can create a new table
 */
export async function checkTableLimit(req: TenantRequest, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Tenant ID is required',
      });
    }

    const canCreate = await subscriptionService.canAddTable(tenantId);
    if (!canCreate) {
      logger.warn(`Tenant ${tenantId} tried to exceed table limit`);
      return res.status(403).json({
        error: 'Subscription Limit Reached',
        message: 'You have reached your table limit for your current plan. Please upgrade to add more tables.',
        code: 'TABLE_LIMIT_EXCEEDED',
      });
    }

    next();
  } catch (error) {
    logger.error('Error checking table limit:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate table limit',
    });
  }
}

/**
 * Middleware to check if tenant can create a new user
 */
export async function checkUserLimit(req: TenantRequest, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Tenant ID is required',
      });
    }

    const canCreate = await subscriptionService.canAddUser(tenantId);
    if (!canCreate) {
      logger.warn(`Tenant ${tenantId} tried to exceed user limit`);
      return res.status(403).json({
        error: 'Subscription Limit Reached',
        message: 'You have reached your user limit for your current plan. Please upgrade to add more users.',
        code: 'USER_LIMIT_EXCEEDED',
      });
    }

    next();
  } catch (error) {
    logger.error('Error checking user limit:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate user limit',
    });
  }
}

/**
 * Middleware to check if tenant can add a printer
 */
export async function checkPrinterLimit(req: TenantRequest, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Tenant ID is required',
      });
    }

    const canCreate = await subscriptionService.canAddPrinter(tenantId);
    if (!canCreate) {
      logger.warn(`Tenant ${tenantId} tried to exceed printer limit`);
      return res.status(403).json({
        error: 'Subscription Limit Reached',
        message: 'You have reached your printer limit for your current plan. Please upgrade to add more printers.',
        code: 'PRINTER_LIMIT_EXCEEDED',
      });
    }

    next();
  } catch (error) {
    logger.error('Error checking printer limit:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate printer limit',
    });
  }
}

/**
 * Middleware to check if subscription is active and not expired
 */
export async function checkSubscriptionStatus(req: TenantRequest, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Tenant ID is required',
      });
    }

    const isActive = await subscriptionService.isSubscriptionActive(tenantId);
    if (!isActive) {
      logger.warn(`Tenant ${tenantId} has inactive subscription`);
      return res.status(403).json({
        error: 'Subscription Inactive',
        message: 'Your subscription is not active. Please contact support or renew your subscription.',
        code: 'SUBSCRIPTION_INACTIVE',
      });
    }

    next();
  } catch (error) {
    logger.error('Error checking subscription status:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate subscription status',
    });
  }
}

