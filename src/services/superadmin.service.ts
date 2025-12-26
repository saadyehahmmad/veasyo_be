import { db } from '../database/db';
import {
  tenants,
  users,
  tables,
  serviceRequests,
  subscriptions,
  auditLogs,
  NewAuditLog,
} from '../database/schema';
import { eq, desc, sql, or, ilike } from 'drizzle-orm';
import { SubscriptionService, CreateSubscriptionParams, UpdateSubscriptionParams } from './subscription.service';
import logger from '../utils/logger';

export class SuperAdminService {
  private subscriptionService: SubscriptionService;

  constructor() {
    this.subscriptionService = new SubscriptionService();
  }
  /**
   * Get all tenants with subscription info (minimal fields only)
   */
  async getAllTenantsWithSubscriptions() {
    const tenantsWithSubs = await db
      .select({
        tenantId: tenants.id,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        tenantSubdomain: tenants.subdomain,
        tenantActive: tenants.active,
        tenantCreatedAt: tenants.createdAt,
        tenantUpdatedAt: tenants.updatedAt,
        subscriptionId: subscriptions.id,
        subscriptionPlan: subscriptions.plan,
        subscriptionStatus: subscriptions.status,
        subscriptionEndDate: subscriptions.endDate,
        subscriptionAmount: subscriptions.amount,
        subscriptionCurrency: subscriptions.currency,
      })
      .from(tenants)
      .leftJoin(subscriptions, eq(tenants.id, subscriptions.tenantId))
      .orderBy(desc(tenants.createdAt));

    // Map flat result to nested structure
    return tenantsWithSubs.map((row) => ({
      tenant: {
        id: row.tenantId,
        name: row.tenantName,
        slug: row.tenantSlug,
        subdomain: row.tenantSubdomain,
        active: row.tenantActive,
        createdAt: row.tenantCreatedAt,
        updatedAt: row.tenantUpdatedAt,
      },
      subscription: row.subscriptionId
        ? {
          id: row.subscriptionId,
          plan: row.subscriptionPlan,
          status: row.subscriptionStatus,
          endDate: row.subscriptionEndDate,
          amount: row.subscriptionAmount,
          currency: row.subscriptionCurrency,
        }
        : null,
    }));
  }

  /**
   * Search tenants by name or subdomain (for autocomplete)
   */
  async searchTenants(query: string, limit = 20) {
    if (!query || query.trim() === '') {
      // Return recent tenants if no query
      return await db
        .select()
        .from(tenants)
        .where(eq(tenants.active, true))
        .orderBy(desc(tenants.createdAt))
        .limit(limit);
    }

    const searchPattern = `%${query}%`;
    return await db
      .select()
      .from(tenants)
      .where(or(ilike(tenants.name, searchPattern), ilike(tenants.subdomain, searchPattern)))
      .orderBy(desc(tenants.active), tenants.name)
      .limit(limit);
  }

  /**
   * Get tenant details with full analytics
   */
  async getTenantDetails(tenantId: string) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);

    if (!tenant) {
      return null;
    }

    // Get subscription
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .limit(1);

    // Get counts
    const [userCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.tenantId, tenantId));

    const [tableCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tables)
      .where(eq(tables.tenantId, tenantId));

    const [requestCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(serviceRequests)
      .where(eq(serviceRequests.tenantId, tenantId));

    return {
      tenant,
      subscription,
      stats: {
        users: userCount?.count || 0,
        tables: tableCount?.count || 0,
        requests: requestCount?.count || 0,
      },
    };
  }

  /**
   * Update tenant (status, settings only - plan/limits come from subscription)
   */
  async updateTenant(
    tenantId: string,
    updates: {
      active?: boolean;
      settings?: Record<string, unknown>;
    },
  ) {
    const result = await db
      .update(tenants)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    return result[0] || null;
  }

  /**
   * Activate tenant
   */
  async activateTenant(tenantId: string) {
    return await this.updateTenant(tenantId, { active: true });
  }

  /**
   * Deactivate/block tenant
   */
  async deactivateTenant(tenantId: string) {
    return await this.updateTenant(tenantId, { active: false });
  }

  /**
   * Get platform-wide analytics
   */
  async getPlatformAnalytics() {
    // Total tenants
    const [tenantStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where active = true)::int`,
        inactive: sql<number>`count(*) filter (where active = false)::int`,
      })
      .from(tenants);

    // Total users
    const [userStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where active = true)::int`,
        admins: sql<number>`count(*) filter (where role = 'admin')::int`,
        waiters: sql<number>`count(*) filter (where role = 'waiter')::int`,
      })
      .from(users)
      .where(eq(users.isSuperAdmin, false));

    // Total tables
    const [tableStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where status = 'active')::int`,
      })
      .from(tables);

    // Total service requests
    const [requestStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        completed: sql<number>`count(*) filter (where status = 'completed')::int`,
      })
      .from(serviceRequests);

    // Subscription stats
    const [subscriptionStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where status = 'active')::int`,
        expired: sql<number>`count(*) filter (where status = 'expired')::int`,
      })
      .from(subscriptions);

    return {
      tenants: tenantStats,
      users: userStats,
      tables: tableStats,
      requests: requestStats,
      subscriptions: subscriptionStats,
    };
  }

  /**
   * Get recent activity across all tenants
   */
  async getRecentActivity(limit = 50) {
    return await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }

  /**
   * Log superadmin action
   */
  async logAction(actionData: Omit<NewAuditLog, 'id' | 'createdAt'>) {
    const result = await db.insert(auditLogs).values(actionData).returning();

    return result[0];
  }

  /**
   * Get tenant audit logs
   */
  async getTenantAuditLogs(tenantId: string, limit = 100) {
    return await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  // ============================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================

  /**
   * Get all available pricing plans (just labels now)
   */
  getPricingPlans() {
    return [
      { id: 'free', name: 'Free' },
      { id: 'basic', name: 'Basic' },
      { id: 'standard', name: 'Standard' },
      { id: 'premium', name: 'Premium' },
      { id: 'custom', name: 'Custom' },
    ];
  }

  /**
   * Get add-on pricing information (deprecated - no longer used)
   */
  getAddonPricing() {
    return {
      additionalPrinterPrice: 0,
      additionalTablePrice: 0,
      additionalWaiterPrice: 0,
    };
  }

  /**
   * Calculate custom plan pricing (deprecated - no longer used)
   */
  calculateCustomPlanPrice() {
    return {
      basePrice: 0,
      totalAddonsCost: 0,
      totalPrice: 0,
    };
  }

  /**
   * Create subscription for tenant
   */
  async createTenantSubscription(params: CreateSubscriptionParams, adminUserId: string) {
    const subscription = await this.subscriptionService.createSubscriptionWithPricing(params);

    // Activate tenant if subscription is created
    await db
      .update(tenants)
      .set({ active: true })
      .where(eq(tenants.id, params.tenantId));

    // Log action
    await this.logAction({
      userId: adminUserId,
      tenantId: params.tenantId,
      action: 'subscription_created',
      entityType: 'subscription',
      entityId: subscription.id,
      changes: {
        plan: params.plan,
        maxTables: params.maxTables,
        maxUsers: params.maxUsers,
        amount: params.amount,
        tax: params.tax,
      },
    });

    logger.info(`Subscription created by superadmin ${adminUserId} for tenant ${params.tenantId}`);

    return subscription;
  }

  /**
   * Update tenant subscription
   */
  async updateTenantSubscription(
    tenantId: string,
    params: UpdateSubscriptionParams,
    adminUserId: string
  ) {
    const oldSubscription = await this.subscriptionService.getSubscriptionByTenant(tenantId);
    const updatedSubscription = await this.subscriptionService.updateSubscriptionWithPricing(
      tenantId,
      params
    );

    // Log action
    await this.logAction({
      userId: adminUserId,
      tenantId,
      action: 'subscription_updated',
      entityType: 'subscription',
      entityId: updatedSubscription?.id,
      changes: {
        before: {
          plan: oldSubscription?.plan,
          amount: oldSubscription?.amount,
          maxTables: oldSubscription?.maxTables,
          maxUsers: oldSubscription?.maxUsers,
        },
        after: {
          plan: updatedSubscription?.plan,
          amount: updatedSubscription?.amount,
          maxTables: updatedSubscription?.maxTables,
          maxUsers: updatedSubscription?.maxUsers,
        },
      },
    });

    logger.info(`Subscription updated by superadmin ${adminUserId} for tenant ${tenantId}`);

    return updatedSubscription;
  }

  /**
   * Get subscription with usage details
   */
  async getSubscriptionDetails(tenantId: string) {
    return await this.subscriptionService.getSubscriptionWithUsage(tenantId);
  }

  /**
   * Renew subscription
   */
  async renewTenantSubscription(tenantId: string, months: number, adminUserId: string) {
    const subscription = await this.subscriptionService.renewSubscription(tenantId, months);

    // Log action
    await this.logAction({
      userId: adminUserId,
      tenantId,
      action: 'subscription_renewed',
      entityType: 'subscription',
      entityId: subscription?.id,
      changes: {
        months,
        newEndDate: subscription?.endDate,
      },
    });

    logger.info(`Subscription renewed by superadmin ${adminUserId} for tenant ${tenantId}`);

    return subscription;
  }

  /**
   * Cancel subscription
   */
  async cancelTenantSubscription(tenantId: string, adminUserId: string) {
    const subscription = await this.subscriptionService.cancelSubscription(tenantId);

    // Log action
    await this.logAction({
      userId: adminUserId,
      tenantId,
      action: 'subscription_cancelled',
      entityType: 'subscription',
      entityId: subscription?.id,
      changes: {
        status: 'cancelled',
      },
    });

    logger.info(`Subscription cancelled by superadmin ${adminUserId} for tenant ${tenantId}`);

    return subscription;
  }

  /**
   * Suspend subscription
   */
  async suspendTenantSubscription(tenantId: string, adminUserId: string) {
    const subscription = await this.subscriptionService.suspendSubscription(tenantId);

    // Log action
    await this.logAction({
      userId: adminUserId,
      tenantId,
      action: 'subscription_suspended',
      entityType: 'subscription',
      entityId: subscription?.id,
      changes: {
        status: 'suspended',
      },
    });

    logger.info(`Subscription suspended by superadmin ${adminUserId} for tenant ${tenantId}`);

    return subscription;
  }

  /**
   * Reactivate subscription
   */
  async reactivateTenantSubscription(tenantId: string, endDate: Date | undefined, adminUserId: string) {
    const subscription = await this.subscriptionService.reactivateSubscription(tenantId, endDate);

    // Log action
    await this.logAction({
      userId: adminUserId,
      tenantId,
      action: 'subscription_reactivated',
      entityType: 'subscription',
      entityId: subscription?.id,
      changes: {
        status: 'active',
        endDate,
      },
    });

    logger.info(`Subscription reactivated by superadmin ${adminUserId} for tenant ${tenantId}`);

    return subscription;
  }

  /**
   * Get subscription analytics
   */
  async getSubscriptionAnalytics() {
    const analytics = await this.subscriptionService.getSubscriptionAnalytics();

    // Add revenue breakdown by plan
    const allSubscriptions = await db.select().from(subscriptions).where(eq(subscriptions.status, 'active'));

    const revenueByPlan: Record<string, number> = {};
    let totalMonthlyRevenue = 0;

    allSubscriptions.forEach((sub) => {
      const amount = sub.amount || 0;
      revenueByPlan[sub.plan] = (revenueByPlan[sub.plan] || 0) + amount;
      totalMonthlyRevenue += amount;
    });

    // Convert cents to USD for display
    const revenueByPlanUSD: Record<string, number> = {};
    Object.keys(revenueByPlan).forEach((plan) => {
      revenueByPlanUSD[plan] = revenueByPlan[plan] / 100;
    });

    return {
      ...analytics,
      totalMonthlyRevenue: totalMonthlyRevenue / 100,
      revenueByPlan: revenueByPlanUSD,
    };
  }

  /**
   * Get expiring subscriptions
   */
  async getExpiringSubscriptions(days: number = 7) {
    return await this.subscriptionService.getExpiringSubscriptions(days);
  }

  /**
   * Suggest plan based on tenant usage
   */
  async suggestPlanForTenant(tenantId: string) {
    const details = await this.getTenantDetails(tenantId);
    if (!details) {
      return null;
    }

    const { stats } = details;
    // Simple plan suggestion based on usage (no pricing calculations)
    let suggestedPlanId = 'free';
    if (stats.tables > 20 || stats.users > 3) {
      suggestedPlanId = 'premium';
    } else if (stats.tables > 10 || stats.users > 2) {
      suggestedPlanId = 'standard';
    } else if (stats.tables > 5 || stats.users > 1) {
      suggestedPlanId = 'basic';
    }

    return {
      suggestedPlan: suggestedPlanId,
      suggestedPlanName: suggestedPlanId.charAt(0).toUpperCase() + suggestedPlanId.slice(1),
      reason: `Based on ${stats.tables} tables and ${stats.users - 1} waiters`,
    };
  }

  /**
   * Get all tenants with their usage statistics
   */
  async getAllTenantsUsage() {
    try {
      const allTenants = await db.select().from(tenants);
      const tenantsWithUsage = [];

      for (const tenant of allTenants) {
        const usage = await this.subscriptionService.getTenantUsage(tenant.id);
        const subscription = await this.subscriptionService.getSubscriptionByTenant(tenant.id);

        tenantsWithUsage.push({
          tenant: {
            id: tenant.id,
            subdomain: tenant.subdomain,
            name: tenant.name,
            active: tenant.active,
          },
          subscription: subscription || null,
          usage: usage || {
            currentTables: 0,
            currentWaiters: 0,
            currentPrinters: 0,
          },
          limits: subscription ? {
            maxTables: subscription.maxTables || 0,
            maxWaiters: subscription.maxUsers || 0,
            maxPrinters: 0, // No longer tracking printers
          } : null,
        });
      }

      return tenantsWithUsage;
    } catch (error) {
      logger.error('Error getting all tenants usage:', error);
      throw error;
    }
  }

  /**
   * Get all subscriptions with minimal tenant info
   */
  async getAllSubscriptions() {
    const allSubscriptions = await db
      .select({
        subscription: subscriptions,
        tenant: tenants,
      })
      .from(subscriptions)
      .leftJoin(tenants, eq(subscriptions.tenantId, tenants.id))
      .orderBy(desc(subscriptions.createdAt));

    return allSubscriptions.map((item) => ({
      ...item.subscription,
      tenant: item.tenant ? {
        id: item.tenant.id,
        name: item.tenant.name,
        subdomain: item.tenant.subdomain,
      } : null,
    }));
  }

  /**
   * Delete subscription
   */
  async deleteSubscription(subscriptionId: string, adminUserId: string) {
    const subscription = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (!subscription[0]) {
      throw new Error('Subscription not found');
    }

    // Deactivate tenant when subscription is deleted
    await db
      .update(tenants)
      .set({ active: false })
      .where(eq(tenants.id, subscription[0].tenantId));

    // Delete subscription
    await db.delete(subscriptions).where(eq(subscriptions.id, subscriptionId));

    // Log action
    await this.logAction({
      userId: adminUserId,
      tenantId: subscription[0].tenantId,
      action: 'subscription_deleted',
      entityType: 'subscription',
      entityId: subscriptionId,
      changes: {
        deletedSubscription: subscription[0],
      },
    });

    logger.info(`Subscription deleted by superadmin ${adminUserId}: ${subscriptionId}`);

    return true;
  }
}
