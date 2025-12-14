import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const authController = new AuthController();

/**
 * @route POST /api/auth/login
 * @desc Login with email/username and password
 * @access Public
 */
router.post('/login', authController.login.bind(authController));

/**
 * @route POST /api/auth/refresh
 * @desc Refresh access token
 * @access Public
 */
router.post('/refresh', authController.refresh.bind(authController));

/**
 * @route POST /api/auth/logout
 * @desc Logout (client-side token deletion)
 * @access Public
 */
router.post('/logout', authController.logout.bind(authController));

/**
 * @route GET /api/auth/me
 * @desc Get current user info
 * @access Private
 */
router.get('/me', authenticate, authController.getCurrentUser.bind(authController));

export default router;
