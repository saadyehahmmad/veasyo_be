import { db } from '../database/db';
import { feedback } from '../database/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import logger from '../utils/logger';

export interface FeedbackData {
  tenantId: string;
  tableId: string;
  requestId?: string;
  rating: number;
  comments?: string;
  customerName?: string;
  customerPhone?: string;
  timestamp: string;
}

export interface FeedbackFilters {
  limit?: number;
  offset?: number;
  minRating?: number;
  maxRating?: number;
}

export interface FeedbackStats {
  totalFeedback: number;
  averageRating: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  totalWithComments: number;
  totalWithContactInfo: number;
}

export class FeedbackService {
  /**
   * Create new feedback entry
   */
  async createFeedback(data: FeedbackData) {
    try {
      const [newFeedback] = await db
        .insert(feedback)
        .values({
          tenantId: data.tenantId,
          tableId: data.tableId,
          requestId: data.requestId || null,
          rating: data.rating,
          comments: data.comments || null,
          customerName: data.customerName || null,
          customerPhone: data.customerPhone || null,
          createdAt: new Date(data.timestamp),
        })
        .returning();

      logger.info('Feedback created successfully', { feedbackId: newFeedback.id });
      return newFeedback;
    } catch (error) {
      logger.error('Error creating feedback:', error);
      throw error;
    }
  }

  /**
   * Get feedback by tenant with filters
   */
  async getFeedbackByTenant(tenantId: string, filters: FeedbackFilters = {}) {
    try {
      const { limit = 100, offset = 0, minRating, maxRating } = filters;

      const conditions = [eq(feedback.tenantId, tenantId)];

      if (minRating !== undefined) {
        conditions.push(gte(feedback.rating, minRating));
      }

      if (maxRating !== undefined) {
        conditions.push(lte(feedback.rating, maxRating));
      }

      const feedbackList = await db
        .select()
        .from(feedback)
        .where(and(...conditions))
        .orderBy(desc(feedback.createdAt))
        .limit(limit)
        .offset(offset);

      return feedbackList;
    } catch (error) {
      logger.error('Error fetching feedback:', error);
      throw error;
    }
  }

  /**
   * Get feedback statistics for tenant
   */
  async getFeedbackStats(tenantId: string): Promise<FeedbackStats> {
    try {
      // Get total count and average rating
      const [aggregates] = await db
        .select({
          totalFeedback: sql<number>`count(*)::int`,
          averageRating: sql<number>`avg(${feedback.rating})::numeric(3,2)`,
          totalWithComments: sql<number>`count(${feedback.comments})::int`,
          totalWithContactInfo: sql<number>`count(case when ${feedback.customerName} is not null or ${feedback.customerPhone} is not null then 1 end)::int`,
        })
        .from(feedback)
        .where(eq(feedback.tenantId, tenantId));

      // Get rating distribution
      const distribution = await db
        .select({
          rating: feedback.rating,
          count: sql<number>`count(*)::int`,
        })
        .from(feedback)
        .where(eq(feedback.tenantId, tenantId))
        .groupBy(feedback.rating);

      const ratingDistribution = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      };

      distribution.forEach((item) => {
        if (item.rating >= 1 && item.rating <= 5) {
          ratingDistribution[item.rating as 1 | 2 | 3 | 4 | 5] = item.count;
        }
      });

      return {
        totalFeedback: aggregates.totalFeedback || 0,
        averageRating: parseFloat(aggregates.averageRating?.toString() || '0'),
        ratingDistribution,
        totalWithComments: aggregates.totalWithComments || 0,
        totalWithContactInfo: aggregates.totalWithContactInfo || 0,
      };
    } catch (error) {
      logger.error('Error fetching feedback stats:', error);
      throw error;
    }
  }

  /**
   * Delete feedback by ID
   */
  async deleteFeedback(id: string, tenantId: string) {
    try {
      await db
        .delete(feedback)
        .where(and(eq(feedback.id, id), eq(feedback.tenantId, tenantId)));

      logger.info('Feedback deleted successfully', { feedbackId: id });
    } catch (error) {
      logger.error('Error deleting feedback:', error);
      throw error;
    }
  }

  /**
   * Get feedback by request ID
   */
  async getFeedbackByRequestId(requestId: string, tenantId: string) {
    try {
      const feedbackList = await db
        .select()
        .from(feedback)
        .where(
          and(
            eq(feedback.requestId, requestId),
            eq(feedback.tenantId, tenantId)
          )
        );

      return feedbackList[0] || null;
    } catch (error) {
      logger.error('Error fetching feedback by request ID:', error);
      throw error;
    }
  }
}

