import { eq, and, gte, lte, sql, desc, asc, count, avg } from 'drizzle-orm';
import { db } from '../database/db';
import { serviceRequests, tables, users, tenants, requestTypes } from '../database/schema';
import logger from '../utils/logger';

export interface AnalyticsSummary {
  totalRequests: number;
  pendingRequests: number;
  completedRequests: number;
  averageResponseTime: number;
  averageCompletionTime: number;
  requestsByType: Record<string, number>;
  requestsByTable: Record<string, number>;
  requestsByHour: Record<string, number>;
  topWaiters: Array<{
    userId: string;
    fullName: string;
    totalRequests: number;
    averageResponseTime: number;
  }>;
  peakHours: Array<{
    hour: number;
    requestCount: number;
  }>;
}

export interface AnalyticsFilters {
  tenantId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
}

export class AnalyticsService {
  /**
   * Get comprehensive analytics summary for a tenant
   */
  async getAnalyticsSummary(tenantId: string, filters: AnalyticsFilters = {}): Promise<AnalyticsSummary> {
    try {
      const { startDate, endDate } = filters;

      // Base query conditions
      let conditions = [eq(serviceRequests.tenantId, tenantId)];

      if (startDate) {
        conditions.push(gte(serviceRequests.timestampCreated, startDate));
      }

      if (endDate) {
        conditions.push(lte(serviceRequests.timestampCreated, endDate));
      }

      // Total requests
      const totalRequestsResult = await db
        .select({ count: count() })
        .from(serviceRequests)
        .where(and(...conditions));

      const totalRequests = totalRequestsResult[0]?.count || 0;

      // Status breakdown
      const statusBreakdown = await db
        .select({
          status: serviceRequests.status,
          count: count(),
        })
        .from(serviceRequests)
        .where(and(...conditions))
        .groupBy(serviceRequests.status);

      const pendingRequests = statusBreakdown.find(s => s.status === 'pending')?.count || 0;
      const completedRequests = statusBreakdown.find(s => s.status === 'completed')?.count || 0;

      // Average response time (time from created to acknowledged)
      const responseTimeResult = await db
        .select({
          avgResponseTime: avg(
            sql`EXTRACT(EPOCH FROM (${serviceRequests.timestampAcknowledged} - ${serviceRequests.timestampCreated}))`
          ),
        })
        .from(serviceRequests)
        .where(and(
          ...conditions,
          sql`${serviceRequests.timestampAcknowledged} IS NOT NULL`
        ));

      const averageResponseTime = Math.round(Number(responseTimeResult[0]?.avgResponseTime) || 0);

      // Average completion time (time from acknowledged to completed)
      const completionTimeResult = await db
        .select({
          avgCompletionTime: avg(
            sql`EXTRACT(EPOCH FROM (${serviceRequests.timestampCompleted} - ${serviceRequests.timestampAcknowledged}))`
          ),
        })
        .from(serviceRequests)
        .where(and(
          ...conditions,
          sql`${serviceRequests.timestampAcknowledged} IS NOT NULL`,
          sql`${serviceRequests.timestampCompleted} IS NOT NULL`
        ));

      const averageCompletionTime = Math.round(Number(completionTimeResult[0]?.avgCompletionTime) || 0);

      // Requests by type
      const requestsByTypeResult = await db
        .select({
          requestType: serviceRequests.requestType,
          count: count(),
        })
        .from(serviceRequests)
        .where(and(...conditions))
        .groupBy(serviceRequests.requestType)
        .orderBy(desc(count()));

      const requestsByType: Record<string, number> = {};
      requestsByTypeResult.forEach(row => {
        requestsByType[row.requestType] = row.count;
      });

      // Requests by table
      const requestsByTableResult = await db
        .select({
          tableNumber: tables.tableNumber,
          count: count(),
        })
        .from(serviceRequests)
        .innerJoin(tables, eq(serviceRequests.tableId, tables.id))
        .where(and(...conditions))
        .groupBy(tables.tableNumber)
        .orderBy(desc(count()));

      const requestsByTable: Record<string, number> = {};
      requestsByTableResult.forEach(row => {
        requestsByTable[row.tableNumber] = row.count;
      });

      // Requests by hour
      const requestsByHourResult = await db
        .select({
          hour: sql<string>`EXTRACT(HOUR FROM ${serviceRequests.timestampCreated})`,
          count: count(),
        })
        .from(serviceRequests)
        .where(and(...conditions))
        .groupBy(sql`EXTRACT(HOUR FROM ${serviceRequests.timestampCreated})`)
        .orderBy(asc(sql`EXTRACT(HOUR FROM ${serviceRequests.timestampCreated})`));

      const requestsByHour: Record<string, number> = {};
      requestsByHourResult.forEach(row => {
        requestsByHour[row.hour] = row.count;
      });

      // Top waiters by request count and average response time
      const topWaitersResult = await db
        .select({
          userId: users.id,
          fullName: users.fullName,
          totalRequests: count(),
          avgResponseTime: avg(
            sql`EXTRACT(EPOCH FROM (${serviceRequests.timestampAcknowledged} - ${serviceRequests.timestampCreated}))`
          ),
        })
        .from(serviceRequests)
        .innerJoin(users, eq(serviceRequests.acknowledgedBy, users.id))
        .where(and(
          ...conditions,
          sql`${serviceRequests.acknowledgedBy} IS NOT NULL`
        ))
        .groupBy(users.id, users.fullName)
        .orderBy(desc(count()))
        .limit(10);

      const topWaiters = topWaitersResult.map(row => ({
        userId: row.userId,
        fullName: row.fullName,
        totalRequests: row.totalRequests,
        averageResponseTime: Math.round(Number(row.avgResponseTime) || 0),
      }));

      // Peak hours (top 5 hours by request count)
      const peakHoursResult = await db
        .select({
          hour: sql<number>`EXTRACT(HOUR FROM ${serviceRequests.timestampCreated})`,
          requestCount: count(),
        })
        .from(serviceRequests)
        .where(and(...conditions))
        .groupBy(sql`EXTRACT(HOUR FROM ${serviceRequests.timestampCreated})`)
        .orderBy(desc(count()))
        .limit(5);

      const peakHours = peakHoursResult.map(row => ({
        hour: row.hour,
        requestCount: row.requestCount,
      }));

      return {
        totalRequests,
        pendingRequests,
        completedRequests,
        averageResponseTime,
        averageCompletionTime,
        requestsByType,
        requestsByTable,
        requestsByHour,
        topWaiters,
        peakHours,
      };
    } catch (error) {
      logger.error('Error generating analytics summary:', error);
      throw new Error('Failed to generate analytics summary');
    }
  }

  /**
   * Get analytics data for charts/visualizations
   */
  async getChartData(tenantId: string, filters: AnalyticsFilters = {}) {
    try {
      const { startDate, endDate } = filters;

      let conditions = [eq(serviceRequests.tenantId, tenantId)];

      if (startDate) {
        conditions.push(gte(serviceRequests.timestampCreated, startDate));
      }

      if (endDate) {
        conditions.push(lte(serviceRequests.timestampCreated, endDate));
      }

      // Daily request trends (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const dailyTrends = await db
        .select({
          date: sql<string>`DATE(${serviceRequests.timestampCreated})`,
          count: count(),
        })
        .from(serviceRequests)
        .where(and(
          ...conditions,
          gte(serviceRequests.timestampCreated, thirtyDaysAgo)
        ))
        .groupBy(sql`DATE(${serviceRequests.timestampCreated})`)
        .orderBy(asc(sql`DATE(${serviceRequests.timestampCreated})`));

      // Hourly distribution
      const hourlyDistribution = await db
        .select({
          hour: sql<number>`EXTRACT(HOUR FROM ${serviceRequests.timestampCreated})`,
          count: count(),
        })
        .from(serviceRequests)
        .where(and(...conditions))
        .groupBy(sql`EXTRACT(HOUR FROM ${serviceRequests.timestampCreated})`)
        .orderBy(asc(sql`EXTRACT(HOUR FROM ${serviceRequests.timestampCreated})`));

      // Status distribution
      const statusDistribution = await db
        .select({
          status: serviceRequests.status,
          count: count(),
        })
        .from(serviceRequests)
        .where(and(...conditions))
        .groupBy(serviceRequests.status);

      return {
        dailyTrends: dailyTrends.map(row => ({
          date: row.date,
          requests: row.count,
        })),
        hourlyDistribution: hourlyDistribution.map(row => ({
          hour: row.hour,
          requests: row.count,
        })),
        statusDistribution: statusDistribution.map(row => ({
          status: row.status,
          count: row.count,
        })),
      };
    } catch (error) {
      logger.error('Error generating chart data:', error);
      throw new Error('Failed to generate chart data');
    }
  }

  /**
   * Get real-time analytics for dashboard
   */
  async getRealtimeAnalytics(tenantId: string) {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Current pending requests
      const pendingCount = await db
        .select({ count: count() })
        .from(serviceRequests)
        .where(and(
          eq(serviceRequests.tenantId, tenantId),
          eq(serviceRequests.status, 'pending')
        ));

      // Requests in last hour
      const recentRequests = await db
        .select({ count: count() })
        .from(serviceRequests)
        .where(and(
          eq(serviceRequests.tenantId, tenantId),
          gte(serviceRequests.timestampCreated, oneHourAgo)
        ));

      // Average response time (last 24 hours)
      const avgResponseTime = await db
        .select({
          avgTime: avg(
            sql`EXTRACT(EPOCH FROM (${serviceRequests.timestampAcknowledged} - ${serviceRequests.timestampCreated}))`
          ),
        })
        .from(serviceRequests)
        .where(and(
          eq(serviceRequests.tenantId, tenantId),
          gte(serviceRequests.timestampCreated, oneDayAgo),
          sql`${serviceRequests.timestampAcknowledged} IS NOT NULL`
        ));

      return {
        pendingRequests: pendingCount[0]?.count || 0,
        requestsLastHour: recentRequests[0]?.count || 0,
        averageResponseTime: Math.round(Number(avgResponseTime[0]?.avgTime) || 0),
        timestamp: now.toISOString(),
      };
    } catch (error) {
      logger.error('Error getting realtime analytics:', error);
      throw new Error('Failed to get realtime analytics');
    }
  }
}