import { db } from '../database/db';
import { subscriptions, NewSubscription } from '../database/schema';
import { eq, and, lt, gte } from 'drizzle-orm';

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
}
