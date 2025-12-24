import { Response } from 'express';
import { FeedbackService } from '../services/feedback.service';
import logger from '../utils/logger';
import { TenantRequest } from '../middleware/tenant';

export class FeedbackController {
  private feedbackService: FeedbackService;

  constructor() {
    this.feedbackService = new FeedbackService();
  }

  /**
   * Submit customer feedback
   * POST /api/feedback
   */
  async submitFeedback(req: TenantRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant ID is required' });
        return;
      }

      const feedbackData = {
        ...req.body,
        tenantId,
      };

      const feedback = await this.feedbackService.createFeedback(feedbackData);

      logger.info('Customer feedback submitted', {
        feedbackId: feedback.id,
        tenantId,
        rating: feedback.rating,
      });

      res.status(201).json({
        message: 'Feedback submitted successfully',
        feedback,
      });
    } catch (error) {
      logger.error('Error submitting feedback:', error);
      res.status(500).json({ error: 'Failed to submit feedback' });
    }
  }

  /**
   * Get all feedback for tenant
   * GET /api/feedback
   */
  async getFeedback(req: TenantRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant ID is required' });
        return;
      }

      const { limit = 100, offset = 0, minRating, maxRating } = req.query;

      const feedback = await this.feedbackService.getFeedbackByTenant(
        tenantId,
        {
          limit: Number(limit),
          offset: Number(offset),
          minRating: minRating ? Number(minRating) : undefined,
          maxRating: maxRating ? Number(maxRating) : undefined,
        }
      );

      res.json(feedback);
    } catch (error) {
      logger.error('Error fetching feedback:', error);
      res.status(500).json({ error: 'Failed to fetch feedback' });
    }
  }

  /**
   * Get feedback statistics
   * GET /api/feedback/stats
   */
  async getFeedbackStats(req: TenantRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant ID is required' });
        return;
      }

      const stats = await this.feedbackService.getFeedbackStats(tenantId);

      res.json(stats);
    } catch (error) {
      logger.error('Error fetching feedback stats:', error);
      res.status(500).json({ error: 'Failed to fetch feedback statistics' });
    }
  }

  /**
   * Delete feedback
   * DELETE /api/feedback/:id
   */
  async deleteFeedback(req: TenantRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        res.status(400).json({ error: 'Tenant ID is required' });
        return;
      }

      await this.feedbackService.deleteFeedback(id, tenantId);

      res.json({ message: 'Feedback deleted successfully' });
    } catch (error) {
      logger.error('Error deleting feedback:', error);
      res.status(500).json({ error: 'Failed to delete feedback' });
    }
  }
}

