import { db } from '../database/db';
import { subscriptions, NewSubscription, tenants, users, tables } from '../database/schema';
import { eq, and, lt, gte, sql } from 'drizzle-orm';
import logger from '../utils/logger';

export interface CreateSubscriptionParams {
  tenantId: string;
  plan: 'free' | 'basic' | 'standard' | 'premium' | 'custom';
  startDate: Date;
  endDate: Date;
  amount: number; // in cents
  tax?: number; // in cents, optional
  maxTables: number;
  maxUsers: number;
}

export interface UpdateSubscriptionParams {
  plan?: 'free' | 'basic' | 'standard' | 'premium' | 'custom';
  startDate?: Date;
  endDate?: Date;
  amount?: number; // in cents
  tax?: number; // in cents
  maxTables?: number;
  maxUsers?: number;
  status?: string;
}

export interface SubscriptionWithUsage {
  subscription: {
    id: string;
    tenantId: string;
    plan: string;
    status: string;
    startDate: Date;
    endDate: Date | null;
    amount: number | null;
    tax: number | null;
    currency: string | null;
    maxTables: number;
    maxUsers: number;
    [key: string]: unknown;
  };
  usage: {
    currentTables: number;
    currentWaiters: number;
    currentPrinters: number;
  };
  limits: {
    maxTables: number;
    maxWaiters: number;
  };
  validation: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
  pricing: {
    basePrice: number;
    addonsCost: number;
    totalPrice: number;
    breakdown: string[];
  };
}

export class SubscriptionService {
  /**
   * Create subscription for a tenant
   */
  async createSubscription(
    subscriptionData: Omit<NewSubscription, 'id' | 'createdAt' | 'updatedAt'>,
  ) {
    const newSubscription: NewSubscription = {
      ...subscriptionData,
      status: subscriptionData.status || 'active',
    };

    const result = await db.insert(subscriptions).values(newSubscription).returning();

    return result[0];
  }

  /**
   * Get subscription by tenant ID
   */
  async getSubscriptionByTenant(tenantId: string) {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .limit(1);

    return subscription || null;
  }

  /**
   * Update subscription
   */
  async updateSubscription(tenantId: string, updates: Partial<NewSubscription>) {
    const result = await db
      .update(subscriptions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.tenantId, tenantId))
      .returning();

    return result[0] || null;
  }

  /**
   * Check if subscription is active and not expired
   */
  async isSubscriptionActive(
    tenantId: string,
  ): Promise<{ active: boolean; expired: boolean; warning?: string }> {
    const subscription = await this.getSubscriptionByTenant(tenantId);

    if (!subscription) {
      return { active: false, expired: false, warning: 'No subscription found' };
    }

    if (subscription.status !== 'active') {
      return { active: false, expired: true, warning: `Subscription is ${subscription.status}` };
    }

    // Check expiration date
    if (subscription.endDate) {
      const now = new Date();
      const endDate = new Date(subscription.endDate);

      if (now > endDate) {
        return { active: true, expired: true, warning: 'Subscription has expired' };
      }

      // Warning if expiring within 7 days
      const daysUntilExpiry = Math.ceil(
        (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilExpiry <= 7) {
        return {
          active: true,
          expired: false,
          warning: `Subscription expires in ${daysUntilExpiry} days`,
        };
      }
    }

    return { active: true, expired: false };
  }

  /**
   * Get all expiring subscriptions (within days)
   */
  async getExpiringSubscriptions(days = 7) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, 'active'),
          lt(subscriptions.endDate, futureDate),
          gte(subscriptions.endDate, new Date()),
        ),
      );
  }

  /**
   * Get all expired subscriptions
   */
  async getExpiredSubscriptions() {
    return await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.status, 'active'), lt(subscriptions.endDate, new Date())));
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(tenantId: string) {
    return await this.updateSubscription(tenantId, {
      status: 'cancelled',
    });
  }

  /**
   * Suspend subscription
   */
  async suspendSubscription(tenantId: string) {
    return await this.updateSubscription(tenantId, {
      status: 'suspended',
    });
  }

  /**
   * Reactivate subscription
   */
  async reactivateSubscription(tenantId: string, endDate?: Date) {
    return await this.updateSubscription(tenantId, {
      status: 'active',
      endDate: endDate || undefined,
    });
  }

  /**
   * Get subscription analytics
   */
  async getSubscriptionAnalytics() {
    const allSubscriptions = await db.select().from(subscriptions);

    const analytics = {
      total: allSubscriptions.length,
      active: allSubscriptions.filter((s) => s.status === 'active').length,
      expired: allSubscriptions.filter((s) => s.status === 'expired').length,
      cancelled: allSubscriptions.filter((s) => s.status === 'cancelled').length,
      suspended: allSubscriptions.filter((s) => s.status === 'suspended').length,
      byPlan: {} as Record<string, number>,
      totalRevenue: 0,
    };

    allSubscriptions.forEach((sub) => {
      analytics.byPlan[sub.plan] = (analytics.byPlan[sub.plan] || 0) + 1;
      if (sub.amount) {
        analytics.totalRevenue += sub.amount;
      }
    });

    return analytics;
  }

  /**
   * Create subscription (simplified - no calculations)
   */
  async createSubscriptionWithPricing(params: CreateSubscriptionParams) {
    const { 
      tenantId, 
      plan, 
      startDate,
      endDate,
      amount,
      tax = 0,
      maxTables,
      maxUsers,
    } = params;

    // Validate dates
    if (endDate <= startDate) {
      throw new Error('End date must be after start date');
    }

    // Validate limits
    if (maxTables < 1) {
      throw new Error('Max tables must be at least 1');
    }
    if (maxUsers < 1) {
      throw new Error('Max users must be at least 1');
    }

    const nextPaymentDate = new Date(endDate);

    const subscriptionData: NewSubscription = {
      tenantId,
      plan,
      status: 'active',
      startDate,
      endDate,
      nextPaymentDate,
      amount,
      tax: tax || null,
      currency: 'USD',
      maxTables,
      maxUsers,
    };

    const subscription = await this.createSubscription(subscriptionData);

    logger.info(`Subscription created for tenant ${tenantId}`, {
      plan,
      amount: amount / 100, // Convert cents to USD for logging
      maxTables,
      maxUsers,
      endDate,
    });

    return subscription;
  }

  /**
   * Update subscription (simplified - no calculations)
   */
  async updateSubscriptionWithPricing(tenantId: string, params: UpdateSubscriptionParams) {
    const currentSubscription = await this.getSubscriptionByTenant(tenantId);
    if (!currentSubscription) {
      throw new Error('Subscription not found');
    }

    const updates: Partial<NewSubscription> = {};

    // Update plan if provided
    if (params.plan) {
      updates.plan = params.plan;
    }

    // Update dates
    if (params.startDate) {
      updates.startDate = params.startDate;
        }
    if (params.endDate) {
      updates.endDate = params.endDate;
      updates.nextPaymentDate = params.endDate;
      
      // Automatically update status based on end date
      const now = new Date();
      const endDate = new Date(params.endDate);
      
      if (endDate < now) {
        // End date is in the past - set to expired
        // Only update status if it wasn't explicitly provided in params
        if (!params.status) {
          updates.status = 'expired';
        }
        // Check if endDate has passed and deactivate tenant if needed
        await this._checkAndDeactivateTenant(tenantId, params.endDate);
      } else {
        // End date is in the future - set to active if it was expired or cancelled
        // Only update status if it wasn't explicitly provided in params
        if (!params.status) {
          if (currentSubscription.status === 'expired' || currentSubscription.status === 'cancelled') {
            updates.status = 'active';
          } else if (currentSubscription.status === 'suspended') {
            // Keep suspended status if it was suspended
            // Don't change it
          } else {
            // If it's already active, keep it active
            updates.status = 'active';
          }
        }
      }
    }

    // Update pricing
    if (params.amount !== undefined) {
      updates.amount = params.amount;
    }
    if (params.tax !== undefined) {
      updates.tax = params.tax;
    }

    // Update limits
    if (params.maxTables !== undefined) {
      if (params.maxTables < 1) {
        throw new Error('Max tables must be at least 1');
      }
      updates.maxTables = params.maxTables;
    }
    if (params.maxUsers !== undefined) {
      if (params.maxUsers < 1) {
        throw new Error('Max users must be at least 1');
        }
      updates.maxUsers = params.maxUsers;
    }

    // Update status
    if (params.status) {
      updates.status = params.status;
    }

    // Validate dates if both are being updated
    if (params.startDate && params.endDate && params.endDate <= params.startDate) {
      throw new Error('End date must be after start date');
    } else if (params.endDate && currentSubscription.startDate) {
      const startDate = params.startDate ? params.startDate : new Date(currentSubscription.startDate);
      if (params.endDate <= startDate) {
        throw new Error('End date must be after start date');
      }
    }

    const updatedSubscription = await this.updateSubscription(tenantId, updates);

    logger.info(`Subscription updated for tenant ${tenantId}`, {
      updates,
      newAmount: updates.amount ? updates.amount / 100 : undefined, // Convert cents to USD for logging
    });

    return updatedSubscription;
  }

  /**
   * Get active subscription for tenant (if exists and not expired)
   */
  async getActiveSubscription(tenantId: string) {
    const subscription = await this.getSubscriptionByTenant(tenantId);
    if (!subscription) {
      return null;
    }

    // Check if subscription is active and not expired
    if (subscription.status !== 'active') {
      return null;
    }

    if (subscription.endDate) {
      const now = new Date();
      const endDate = new Date(subscription.endDate);
      if (now > endDate) {
        return null; // Expired
      }
    }

    return subscription;
  }

  /**
   * Check if tenant has valid subscription
   */
  async isTenantValid(tenantId: string): Promise<boolean> {
    const subscription = await this.getActiveSubscription(tenantId);
    return subscription !== null;
  }

  /**
   * Check if subscription endDate has passed and deactivate tenant if needed
   * Note: Status update is handled in the calling method (updateSubscriptionWithPricing) to avoid double updates
   */
  private async _checkAndDeactivateTenant(tenantId: string, endDate: Date): Promise<void> {
    const now = new Date();
    if (endDate < now) {
      // End date has passed, deactivate tenant
      await db
        .update(tenants)
        .set({ active: false })
        .where(eq(tenants.id, tenantId));
      
      logger.info(`Tenant ${tenantId} deactivated due to subscription end date: ${endDate.toISOString()}`);
    }
  }

  /**
   * Background job to check and deactivate tenants with expired subscriptions
   */
  async _checkAndDeactivateTenants(): Promise<void> {
    const now = new Date();
    const expiredSubscriptions = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, 'active'),
          sql`${subscriptions.endDate} < ${now}`
        )
      );

    for (const subscription of expiredSubscriptions) {
      // Update subscription status to expired
      await this.updateSubscription(subscription.tenantId, { status: 'expired' });
      // Deactivate tenant
      await this._checkAndDeactivateTenant(subscription.tenantId, new Date(subscription.endDate!));
    }
  }

  /**
   * Get subscription with usage and validation
   */
  async getSubscriptionWithUsage(tenantId: string): Promise<SubscriptionWithUsage | null> {
    const subscription = await this.getSubscriptionByTenant(tenantId);
    if (!subscription) {
      return null;
    }

    // Get current usage
    const [tableCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tables)
      .where(eq(tables.tenantId, tenantId));

    const [waiterCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.role, 'waiter')));

    const currentTables = tableCount?.count || 0;
    const currentWaiters = waiterCount?.count || 0;
    const currentPrinters = 0; // No longer tracking printers

    // Get limits from subscription
    const maxTables = subscription.maxTables || 0;
    const maxWaiters = subscription.maxUsers || 0;

    // Validate usage
    const errors: string[] = [];
    const warnings: string[] = [];

    if (currentTables > maxTables) {
      errors.push(`Exceeded table limit: ${currentTables}/${maxTables}`);
    } else if (currentTables >= maxTables * 0.9) {
      warnings.push(`Approaching table limit: ${currentTables}/${maxTables}`);
    }

    if (currentWaiters > maxWaiters) {
      errors.push(`Exceeded user limit: ${currentWaiters}/${maxWaiters}`);
    } else if (currentWaiters >= maxWaiters * 0.9) {
      warnings.push(`Approaching user limit: ${currentWaiters}/${maxWaiters}`);
    }

    const validation = {
      isValid: errors.length === 0,
      errors,
      warnings,
    };

    // Get pricing breakdown
    const totalPrice = subscription.amount ? subscription.amount / 100 : 0; // Convert cents to USD
    const taxAmount = subscription.tax ? subscription.tax / 100 : 0;

    const breakdown: string[] = [];
    breakdown.push(`${subscription.plan} plan: $${totalPrice.toFixed(2)}`);
    if (taxAmount > 0) {
      breakdown.push(`Tax: $${taxAmount.toFixed(2)}`);
      }
    breakdown.push(`Total: $${(totalPrice + taxAmount).toFixed(2)}`);

    return {
      subscription,
      usage: {
        currentTables,
        currentWaiters,
        currentPrinters,
      },
      limits: {
        maxTables,
        maxWaiters,
      },
      validation,
      pricing: {
        basePrice: totalPrice,
        addonsCost: 0,
        totalPrice: totalPrice + taxAmount,
        breakdown,
      },
    };
  }

  /**
   * Renew subscription (extend end date)
   */
  async renewSubscription(tenantId: string, months: number = 1) {
    const subscription = await this.getSubscriptionByTenant(tenantId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const currentEndDate = subscription.endDate ? new Date(subscription.endDate) : new Date();
    const newEndDate = new Date(currentEndDate);
    newEndDate.setMonth(newEndDate.getMonth() + months);

    const nextPaymentDate = new Date(newEndDate);

    await this.updateSubscription(tenantId, {
      endDate: newEndDate,
      nextPaymentDate,
      lastPaymentDate: new Date(),
      status: 'active',
    });

    logger.info(`Subscription renewed for tenant ${tenantId}`, {
      months,
      newEndDate,
    });

    return this.getSubscriptionByTenant(tenantId);
  }

  /**
   * Check if tenant can add a new table (within subscription limit)
   */
  async canAddTable(tenantId: string): Promise<boolean> {
    try {
      const details = await this.getSubscriptionWithUsage(tenantId);
      if (!details) {
        return false; // No subscription means no access
      }

      // Check if subscription is active
      if (details.subscription.status !== 'active') {
        return false;
      }

      // Check if limit is reached
      return details.usage.currentTables < details.limits.maxTables;
    } catch (error) {
      logger.error('Error checking table limit:', error);
      return false;
    }
  }

  /**
   * Check if tenant can add a new user (within subscription limit)
   */
  async canAddUser(tenantId: string): Promise<boolean> {
    try {
      const details = await this.getSubscriptionWithUsage(tenantId);
      if (!details) {
        return false;
      }

      if (details.subscription.status !== 'active') {
        return false;
      }

      return details.usage.currentWaiters < details.limits.maxWaiters;
    } catch (error) {
      logger.error('Error checking user limit:', error);
      return false;
    }
  }

  /**
   * Check if tenant can add a printer (within subscription limit)
   */
  async canAddPrinter(tenantId: string): Promise<boolean> {
    try {
      const subscription = await this.getSubscriptionByTenant(tenantId);
      if (!subscription || subscription.status !== 'active') {
        return false;
      }

      // Get current printer count from integrations
      const result = await db
        .select({ printers: sql<number>`COALESCE(COUNT(*), 0)` })
        .from(tenants)
        .where(eq(tenants.id, tenantId));

      const currentPrinters = result[0]?.printers || 0;
      const maxPrinters = 0; // Printers no longer tracked in subscriptions

      return currentPrinters < maxPrinters;
    } catch (error) {
      logger.error('Error checking printer limit:', error);
      return false;
    }
  }

  /**
   * Get subscription usage percentage
   */
  async getUsagePercentage(tenantId: string) {
    const details = await this.getSubscriptionWithUsage(tenantId);
    if (!details) {
      return null;
    }

    const maxPrinters = 0; // Printers no longer tracked in subscriptions
    
    return {
      tables: details.limits.maxTables > 0 
        ? (details.usage.currentTables / details.limits.maxTables) * 100 
        : 0,
      users: details.limits.maxWaiters > 0 
        ? (details.usage.currentWaiters / details.limits.maxWaiters) * 100 
        : 0,
      printers: maxPrinters > 0 
        ? (details.usage.currentPrinters / maxPrinters) * 100 
        : 0,
    };
  }

  /**
   * Check and update expired subscriptions
   * Should be run periodically (e.g., daily cron job)
   */
  async checkAndUpdateExpiredSubscriptions() {
    try {
      const now = new Date();
      
      // Find all subscriptions that have expired but status is still active
      const expiredSubs = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.status, 'active'),
            lt(subscriptions.endDate, now)
          )
        );

      for (const sub of expiredSubs) {
        // Update subscription status
        await db
          .update(subscriptions)
          .set({ 
            status: 'expired',
            updatedAt: now,
          })
          .where(eq(subscriptions.id, sub.id));

        // Disable tenant license
        await db
          .update(tenants)
          .set({ 
            licenseEnabled: false,
            active: false,
          })
          .where(eq(tenants.id, sub.tenantId));

        logger.warn(`Subscription expired for tenant ${sub.tenantId}`);
      }

      return expiredSubs.length;
    } catch (error) {
      logger.error('Error checking expired subscriptions:', error);
      throw error;
    }
  }

  /**
   * Get tenant invoices (generated from subscription history)
   */
  async getTenantInvoices(tenantId: string) {
    try {
      const subscription = await this.getSubscriptionByTenant(tenantId);
      if (!subscription) {
        return [];
      }

      // Generate invoices based on subscription history
      const invoices = [];
      const startDate = new Date(subscription.startDate);
      const now = new Date();
      
      // Generate monthly invoices from start date to now
      let currentDate = new Date(startDate);
      let invoiceNumber = 1;

      while (currentDate <= now) {
        const invoiceDate = new Date(currentDate);
        const nextMonth = new Date(currentDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        invoices.push({
          id: `INV-${subscription.id.substring(0, 8)}-${invoiceNumber.toString().padStart(4, '0')}`,
          tenantId,
          subscriptionId: subscription.id,
          date: invoiceDate.toISOString(),
          amount: subscription.amount || 0, // Amount in cents (manually set by superadmin)
          currency: subscription.currency || 'USD',
          status: invoiceDate.getMonth() === now.getMonth() && invoiceDate.getFullYear() === now.getFullYear() 
            ? 'pending' 
            : 'paid',
          plan: subscription.plan,
          period: `${invoiceDate.toLocaleString('default', { month: 'long' })} ${invoiceDate.getFullYear()}`,
          paymentMethod: 'Credit Card',
          description: `${subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} Plan - Monthly Subscription`,
          createdAt: invoiceDate.toISOString(),
        });

        currentDate = nextMonth;
        invoiceNumber++;
      }

      // Return invoices in reverse chronological order (newest first)
      return invoices.reverse();
    } catch (error) {
      logger.error('Error getting tenant invoices:', error);
      throw error;
    }
  }

  /**
   * Get tenant payment history
   */
  async getTenantPayments(tenantId: string) {
    try {
      const subscription = await this.getSubscriptionByTenant(tenantId);
      if (!subscription) {
        return [];
      }

      // Generate payment history based on subscription
      const payments = [];
      const startDate = new Date(subscription.startDate);
      const now = new Date();
      
      const currentDate = new Date(startDate);
      let paymentNumber = 1;

      while (currentDate < now) {
        const paymentDate = new Date(currentDate);
        paymentDate.setDate(paymentDate.getDate() + 5); // Payment 5 days after invoice
        
        if (paymentDate <= now) {
          payments.push({
            id: `PAY-${subscription.id.substring(0, 8)}-${paymentNumber.toString().padStart(4, '0')}`,
            tenantId,
            subscriptionId: subscription.id,
            date: paymentDate.toISOString(),
            amount: subscription.amount || 0, // Amount in cents (manually set by superadmin)
            currency: subscription.currency || 'USD',
            status: 'success',
            method: 'Credit Card',
            transactionId: `TXN-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            description: 'Monthly subscription payment',
            createdAt: paymentDate.toISOString(),
          });
        }

        currentDate.setMonth(currentDate.getMonth() + 1);
        paymentNumber++;
      }

      return payments.reverse();
    } catch (error) {
      logger.error('Error getting tenant payments:', error);
      throw error;
    }
  }

  /**
   * Get invoice by ID
   */
  async getInvoiceById(invoiceId: string, tenantId: string) {
    try {
      const invoices = await this.getTenantInvoices(tenantId);
      return invoices.find(inv => inv.id === invoiceId);
    } catch (error) {
      logger.error('Error getting invoice by ID:', error);
      throw error;
    }
  }

  /**
   * Get tenant usage statistics
   */
  async getTenantUsage(tenantId: string) {
    try {
      const [tablesResult] = await db
        .select({ count: sql<number>`COALESCE(COUNT(*), 0)` })
        .from(tables)
        .where(eq(tables.tenantId, tenantId));

      const [waitersResult] = await db
        .select({ count: sql<number>`COALESCE(COUNT(*), 0)` })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.role, 'waiter')));

      // For printers, we'll assume 0 for now as there's no printers table
      const printersCount = 0;

      return {
        currentTables: tablesResult?.count || 0,
        currentWaiters: waitersResult?.count || 0,
        currentPrinters: printersCount,
      };
    } catch (error) {
      logger.error('Error getting tenant usage:', error);
      throw error;
    }
  }

  /**
   * Get max tables for a subscription
   */
  getMaxTables(subscription: { maxTables?: number | null }): number {
    return subscription.maxTables || 0;
  }

  /**
   * Get max waiters for a subscription
   */
  getMaxWaiters(subscription: { maxUsers?: number | null }): number {
    return subscription.maxUsers || 0;
  }
}


