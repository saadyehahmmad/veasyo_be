import { Response } from 'express';
import { AuthService } from '../services/auth.service';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { status } from "http-status";
// Error messages
const ERROR_MESSAGES = {
  INTERNAL_SERVER: 'Internal Server Error',
  LOGIN_FAILED: 'Login failed',
  FORBIDDEN: 'Forbidden',
  UNKNOWN_ERROR: 'Unknown error',
  USER_INACTIVE: 'User account is inactive'
} as const;

export class AuthController {
  private _authService: AuthService;

  constructor() {
    this._authService = new AuthService();
  }

  /**
   * Login
   * POST /api/auth/login
   */
  async login(req: AuthRequest, res: Response) {
    try {
      const { identifier, password, tenantId } = req.body;

      if (!identifier || !password) {
        return res.status(status.BAD_REQUEST).json({
          error: 'Bad Request',
          message: 'Email/username and password are required',
        });
      }

      const result = await this._authService.login(identifier, password, tenantId);

      if (!result) {
        return res.status(status.UNAUTHORIZED).json({
          error: 'Unauthorized',
          message: 'Invalid credentials',
        });
      }

      res.json({
        message: 'Login successful',
        user: result.user,
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      });
    } catch (error: unknown) {
      logger.error('Login error:', error);

      const message = error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR;
      if (message === ERROR_MESSAGES.USER_INACTIVE) {
        return res.status(status.FORBIDDEN).json({
          error: ERROR_MESSAGES.FORBIDDEN,
          message,
        });
      }

      res.status(500).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: ERROR_MESSAGES.LOGIN_FAILED,
      });
    }
  }

  /**
   * Refresh token
   * POST /api/auth/refresh
   */
  async refresh(req: AuthRequest, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(status.BAD_REQUEST).json({
          error: 'Bad Request',
          message: 'Refresh token is required',
        });
      }

      const tokens = await this._authService.refreshToken(refreshToken);

      if (!tokens) {
        return res.status(status.UNAUTHORIZED).json({
          error: 'Unauthorized',
          message: 'Invalid or expired refresh token',
        });
      }

      res.json({
        message: 'Token refreshed',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } catch (error) {
      logger.error('Refresh token error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: 'Token refresh failed',
      });
    }
  }

  /**
   * Get current user
   * GET /api/auth/me
   */
  async getCurrentUser(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Not authenticated',
        });
      }

      const user = await this._authService.getCurrentUser(req.user.userId);

      if (!user) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
      }

      res.json({ user });
    } catch (error) {
      logger.error('Get current user error:', error);
      res.status(500).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: 'Failed to get user info',
      });
    }
  }

  /**
   * Logout
   * POST /api/auth/logout
   */
  async logout(req: AuthRequest, res: Response) {
    try {
      const { accessToken, refreshToken } = req.body;

      // Extract tokens from Authorization header if not in body
      const authHeader = req.headers.authorization;
      const headerAccessToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

      const finalAccessToken = accessToken || headerAccessToken;
      const finalRefreshToken = refreshToken;

      if (!finalAccessToken || !finalRefreshToken) {
        return res.status(status.BAD_REQUEST).json({
          error: 'Bad Request',
          message: 'Both access token and refresh token are required',
        });
      }

      // Get client info for logging
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'];

      // Perform logout (blacklist tokens)
      const success = await this._authService.logout(
        finalAccessToken,
        finalRefreshToken,
        ipAddress,
        userAgent,
      );

      if (!success) {
        return res.status(status.BAD_REQUEST).json({
          error: 'Bad Request',
          message: 'Invalid tokens provided',
        });
      }

      res.json({
        message: 'Logout successful',
        details: 'Tokens have been invalidated',
      });
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: 'Logout failed',
      });
    }
  }
}
