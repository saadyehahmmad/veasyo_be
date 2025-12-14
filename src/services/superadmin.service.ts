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

export class SuperAdminService {
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
        tenantPlan: tenants.plan,
        tenantMaxTables: tenants.maxTables,
        tenantMaxUsers: tenants.maxUsers,
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
        plan: row.tenantPlan,
        maxTables: row.tenantMaxTables,
        maxUsers: row.tenantMaxUsers,
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
   * Update tenant (plan, limits, status)
   */
  async updateTenant(
    tenantId: string,
    updates: {
      plan?: string;
      maxTables?: number;
      maxUsers?: number;
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
}
