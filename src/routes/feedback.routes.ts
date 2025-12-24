import { Router } from 'express';
import { FeedbackController } from '../controllers/feedback.controller';
import { authenticate } from '../middleware/auth';
import { extractTenant } from '../middleware/tenant';

const router = Router();
const feedbackController = new FeedbackController();

/**
 * @swagger
 * /api/feedback:
 *   post:
 *     summary: Submit feedback
 *     description: Submit customer feedback (public endpoint, no authentication required)
 *     tags: [Feedback]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *               - comment
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               comment:
 *                 type: string
 *                 example: "Great service!"
 *               serviceRequestId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional service request ID this feedback relates to
 *     responses:
 *       201:
 *         description: Feedback submitted successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post(
  '/',
  extractTenant,
  feedbackController.submitFeedback.bind(feedbackController)
);

/**
 * @swagger
 * /api/feedback:
 *   get:
 *     summary: Get feedback
 *     description: Get all feedback for the tenant (authenticated users only)
 *     tags: [Feedback]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of feedback
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  '/',
  authenticate,
  extractTenant,
  feedbackController.getFeedback.bind(feedbackController)
);

/**
 * @swagger
 * /api/feedback/stats:
 *   get:
 *     summary: Get feedback statistics
 *     description: Get feedback statistics for the tenant (authenticated users only)
 *     tags: [Feedback]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Feedback statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: number
 *                 averageRating:
 *                   type: number
 *                 ratingsDistribution:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  '/stats',
  authenticate,
  extractTenant,
  feedbackController.getFeedbackStats.bind(feedbackController)
);

/**
 * @swagger
 * /api/feedback/{id}:
 *   delete:
 *     summary: Delete feedback
 *     description: Delete a feedback entry (authenticated users only)
 *     tags: [Feedback]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Feedback ID
 *     responses:
 *       204:
 *         description: Feedback deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete(
  '/:id',
  authenticate,
  extractTenant,
  feedbackController.deleteFeedback.bind(feedbackController)
);

export default router;

