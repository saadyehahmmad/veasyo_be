import { Response } from 'express';
import { SuperAdminService } from '../services/superadmin.service';
import { SubscriptionService } from '../services/subscription.service';
import { UserService } from '../services/user.service';
import { AnalyticsService } from '../services/analytics.service';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { hashPassword } from '../utils/password';
import { status } from "http-status";

// Error messages
const ERROR_MESSAGES = {
  INTERNAL_SERVER: 'Internal Server Error',
  TENANT_NOT_FOUND: 'Tenant not found',
  USER_NOT_FOUND: 'User not found',
  FAILED_TO_FETCH_TENANTS: 'Failed to fetch tenants',
  FAILED_TO_SEARCH_TENANTS: 'Failed to search tenants',
  FAILED_TO_UPDATE_TENANT: 'Failed to update tenant',
  FAILED_TO_DELETE_TENANT: 'Failed to delete tenant',
  FAILED_TO_GET_SUBSCRIPTION: 'Failed to get subscription',
  FAILED_TO_UPDATE_SUBSCRIPTION: 'Failed to update subscription',
  FAILED_TO_GET_USERS: 'Failed to get users',
  FAILED_TO_GET_STATS: 'Failed to get statistics',
  FAILED_TO_GET_LOGS: 'Failed to get logs',
  FAILED_TO_SEND_NOTIFICATION: 'Failed to send notification',
  INVALID_INPUT: 'Invalid input provided',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Not Found'
} as const;

export class SuperAdminController {
  private _superAdminService: SuperAdminService;
  private _subscriptionService: SubscriptionService;
  private _userService: UserService;
  private _analyticsService: AnalyticsService;

  constructor() {
    this._superAdminService = new SuperAdminService();
    this._subscriptionService = new SubscriptionService();
    this._userService = new UserService();
    this._analyticsService = new AnalyticsService();
  }

  /**
   * Get all tenants with subscriptions
   * GET /api/superadmin/tenants
   */
  async getAllTenants(req: AuthRequest, res: Response) {
    try {
      const tenantsWithSubs = await this._superAdminService.getAllTenantsWithSubscriptions();

      // Check for subscription warnings (data already minimal from service)
      const tenantsWithWarnings = await Promise.all(
        tenantsWithSubs.map(async ({ tenant, subscription }) => {
          let warning = null;

          if (subscription?.id) {
            const status = await this._subscriptionService.isSubscriptionActive(tenant.id);
            warning = status.warning || null;
          }

          return {
            tenant,
            subscription,
            warning,
          };
        }),
      );

      res.json({ tenants: tenantsWithWarnings });
    } catch (error) {
      logger.error('Get all tenants error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: ERROR_MESSAGES.FAILED_TO_FETCH_TENANTS,
      });
    }
  }

  /**
   * Search tenants (for dropdowns/autocomplete)
   * GET /api/superadmin/tenants/search?q=search&limit=10
   */
  async searchTenants(req: AuthRequest, res: Response) {
    try {
      const query = (req.query.q as string) || '';
      const limit = parseInt(req.query.limit as string) || 20;

      const results = await this._superAdminService.searchTenants(query, limit);

      res.json({
        tenants: results.map((t) => ({
          id: t.id,
          name: t.name,
          subdomain: t.subdomain,
          active: t.active,
          plan: t.plan,
        })),
      });
    } catch (error) {
      logger.error('Search tenants error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: ERROR_MESSAGES.FAILED_TO_SEARCH_TENANTS,
      });
    }
  }

  /**
   * Get tenant details
   * GET /api/superadmin/tenants/:id
   */
  async getTenantDetails(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const details = await this._superAdminService.getTenantDetails(id);

      if (!details) {
        return res.status(status.NOT_FOUND).json({
          error: ERROR_MESSAGES.NOT_FOUND,
          message: ERROR_MESSAGES.TENANT_NOT_FOUND,
        });
      }

      // Check subscription status
      let subscriptionStatus = null;
      if (details.subscription) {
        subscriptionStatus = await this._subscriptionService.isSubscriptionActive(id);
      }

      res.json({
        ...details,
        subscriptionStatus,
      });
    } catch (error) {
      logger.error('Get tenant details error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: ERROR_MESSAGES.TENANT_NOT_FOUND,
      });
    }
  }

  /**
   * Update tenant
   * PUT /api/superadmin/tenants/:id
   */
  async updateTenant(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const updatedTenant = await this._superAdminService.updateTenant(id, updates);

      if (!updatedTenant) {
        return res.status(status.NOT_FOUND).json({
          error: ERROR_MESSAGES.NOT_FOUND,
          message: ERROR_MESSAGES.TENANT_NOT_FOUND,
        });
      }

      // Log action
      if (req.user) {
        await this._superAdminService.logAction({
          userId: req.user.userId,
          tenantId: id,
          action: 'tenant_updated',
          entityType: 'tenant',
          entityId: id,
          changes: updates,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      res.json({
        message: 'Tenant updated successfully',
        tenant: updatedTenant,
      });
    } catch (error) {
      logger.error('Update tenant error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: ERROR_MESSAGES.FAILED_TO_UPDATE_TENANT,
      });
    }
  }

  /**
   * Activate tenant
   * POST /api/superadmin/tenants/:id/activate
   */
  async activateTenant(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const tenant = await this._superAdminService.activateTenant(id);

      if (!tenant) {
        return res.status(status.NOT_FOUND).json({
          error: ERROR_MESSAGES.NOT_FOUND,
          message: ERROR_MESSAGES.TENANT_NOT_FOUND,
        });
      }

      // Log action
      if (req.user) {
        await this._superAdminService.logAction({
          userId: req.user.userId,
          tenantId: id,
          action: 'tenant_activated',
          entityType: 'tenant',
          entityId: id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      res.json({
        message: 'Tenant activated successfully',
        tenant,
      });
    } catch (error) {
      logger.error('Activate tenant error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: 'Failed to activate tenant',
      });
    }
  }

  /**
   * Deactivate/block tenant
   * POST /api/superadmin/tenants/:id/deactivate
   */
  async deactivateTenant(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const tenant = await this._superAdminService.deactivateTenant(id);

      if (!tenant) {
        return res.status(status.NOT_FOUND).json({
          error: ERROR_MESSAGES.NOT_FOUND,
          message: ERROR_MESSAGES.TENANT_NOT_FOUND,
        });
      }

      // Log action
      if (req.user) {
        await this._superAdminService.logAction({
          userId: req.user.userId,
          tenantId: id,
          action: 'tenant_deactivated',
          entityType: 'tenant',
          entityId: id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      res.json({
        message: 'Tenant deactivated successfully',
        tenant,
      });
    } catch (error) {
      logger.error('Deactivate tenant error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: 'Failed to deactivate tenant',
      });
    }
  }

  /**
   * Get platform analytics
   * GET /api/superadmin/analytics
   */
  async getPlatformAnalytics(req: AuthRequest, res: Response) {
    try {
      const platformStats = await this._superAdminService.getPlatformAnalytics();
      const subscriptionAnalytics = await this._subscriptionService.getSubscriptionAnalytics();

      // Get detailed analytics for each active tenant
      const tenantsWithSubs = await this._superAdminService.getAllTenantsWithSubscriptions();
      const activeTenants = tenantsWithSubs.filter(t => t.tenant.active);

      const tenantAnalytics = await Promise.all(
        activeTenants.slice(0, 10).map(async (tenant) => { // Limit to first 10 tenants for performance
          try {
            const analytics = await this._analyticsService.getAnalyticsSummary(tenant.tenant.id);
            return {
              tenantId: tenant.tenant.id,
              tenantName: tenant.tenant.name,
              analytics: {
                totalRequests: analytics.totalRequests,
                pendingRequests: analytics.pendingRequests,
                completedRequests: analytics.completedRequests,
                averageResponseTime: analytics.averageResponseTime,
                averageCompletionTime: analytics.averageCompletionTime,
              },
            };
          } catch (error) {
            logger.warn(`Failed to get analytics for tenant ${tenant.tenant.id}:`, error);
            return {
              tenantId: tenant.tenant.id,
              tenantName: tenant.tenant.name,
              analytics: null,
              error: 'Failed to load analytics',
            };
          }
        })
      );

      res.json({
        platform: platformStats,
        subscriptions: subscriptionAnalytics,
        tenantAnalytics,
      });
    } catch (error) {
      logger.error('Get platform analytics error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: ERROR_MESSAGES.FAILED_TO_GET_STATS,
      });
    }
  }

  /**
   * Get all subscriptions
   * GET /api/superadmin/subscriptions
   */
  async getAllSubscriptions(req: AuthRequest, res: Response) {
    try {
      const expiring = await this._subscriptionService.getExpiringSubscriptions(7);
      const expired = await this._subscriptionService.getExpiredSubscriptions();
      const analytics = await this._subscriptionService.getSubscriptionAnalytics();

      res.json({
        expiring,
        expired,
        analytics,
      });
    } catch (error) {
      logger.error('Get subscriptions error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: 'Failed to fetch subscriptions',
      });
    }
  }

  /**
   * Get audit logs
   * GET /api/superadmin/audit-logs
   */
  async getAuditLogs(req: AuthRequest, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await this._superAdminService.getRecentActivity(limit);

      res.json({ logs });
    } catch (error) {
      logger.error('Get audit logs error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: ERROR_MESSAGES.FAILED_TO_GET_LOGS,
      });
    }
  }

  /**
   * Get tenant audit logs
   * GET /api/superadmin/tenants/:id/audit-logs
   */
  async getTenantAuditLogs(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;

      const logs = await this._superAdminService.getTenantAuditLogs(id, limit);

      res.json({ logs });
    } catch (error) {
      logger.error('Get tenant audit logs error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: 'Failed to fetch tenant audit logs',
      });
    }
  }

  // ============================================
  // SUPERADMIN USER MANAGEMENT (Cross-tenant)
  // ============================================

  /**
   * Get all users across all tenants with pagination and filters
   * GET /api/superadmin/users?page=1&limit=25&search=query&tenantId=id&role=admin&active=true
   */
  async getAllUsers(req: AuthRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const search = (req.query.search as string) || '';
      const tenantId = req.query.tenantId as string;
      const role = req.query.role as string;
      const active =
        req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;

      const result = await this._userService.getAllUsersPaginated({
        page,
        limit,
        search,
        tenantId,
        role,
        active,
      });

      res.json(result);
    } catch (error) {
      logger.error('Get all users error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: ERROR_MESSAGES.FAILED_TO_GET_USERS,
      });
    }
  }

  /**
   * Get user details by ID
   * GET /api/superadmin/users/:id
   */
  async getUserDetails(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const user = await this._userService.getUserById(id);

      if (!user) {
        return res.status(status.NOT_FOUND).json({
          error: ERROR_MESSAGES.NOT_FOUND,
          message: ERROR_MESSAGES.USER_NOT_FOUND,
        });
      }

      res.json({ user });
    } catch (error) {
      logger.error('Get user details error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch user details',
      });
    }
  }

  /**
   * Update user (can change tenant, role, etc.)
   * PUT /api/superadmin/users/:id
   */
  async updateUser(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const existingUser = await this._userService.getUserById(id);
      if (!existingUser) {
        return res.status(status.NOT_FOUND).json({
          error: ERROR_MESSAGES.NOT_FOUND,
          message: ERROR_MESSAGES.USER_NOT_FOUND,
        });
      }

      const updatedUser = await this._userService.updateUser(id, updates);

      if (!updatedUser) {
        return res.status(status.NOT_FOUND).json({
          error: 'Not Found',
          message: ERROR_MESSAGES.USER_NOT_FOUND,
        });
      }

      // Log action
      if (req.user) {
        await this._superAdminService.logAction({
          userId: req.user.userId,
          tenantId: existingUser.tenantId,
          action: 'user_updated',
          entityType: 'user',
          entityId: id,
          changes: updates,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      res.json({
        message: 'User updated successfully',
        user: updatedUser,
      });
    } catch (error) {
      logger.error('Update user error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: 'Failed to update user',
      });
    }
  }

  /**
   * Delete user
   * DELETE /api/superadmin/users/:id
   */
  async deleteUser(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const existingUser = await this._userService.getUserById(id);
      if (!existingUser) {
        return res.status(status.NOT_FOUND).json({
          error: ERROR_MESSAGES.NOT_FOUND,
          message: ERROR_MESSAGES.USER_NOT_FOUND,
        });
      }

      const deleted = await this._userService.deleteUser(id);

      if (!deleted) {
        return res.status(status.NOT_FOUND).json({
          error: 'Not Found',
          message: ERROR_MESSAGES.USER_NOT_FOUND,
        });
      }

      // Log action
      if (req.user) {
        await this._superAdminService.logAction({
          userId: req.user.userId,
          tenantId: existingUser.tenantId,
          action: 'user_deleted',
          entityType: 'user',
          entityId: id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      res.status(status.NO_CONTENT).send();
    } catch (error) {
      logger.error('Delete user error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: 'Failed to delete user',
      });
    }
  }

  /**
   * Create user for any tenant
   * POST /api/superadmin/users
   */
  async createUser(req: AuthRequest, res: Response) {
    try {
      const userData = req.body;

      if (!userData.tenantId) {
        return res.status(status.BAD_REQUEST).json({
          error: 'Bad Request',
          message: 'tenantId is required',
        });
      }

      const newUser = await this._userService.createUser(userData);

      // Log action
      if (req.user) {
        await this._superAdminService.logAction({
          userId: req.user.userId,
          tenantId: userData.tenantId,
          action: 'user_created',
          entityType: 'user',
          entityId: newUser.id,
          changes: userData,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      res.status(status.CREATED).json({
        message: 'User created successfully',
        user: newUser,
      });
    } catch (error) {
      logger.error('Create user error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: 'Failed to create user',
      });
    }
  }

  /**
   * Reset user password (superadmin only)
   * POST /api/superadmin/users/:userId/reset-password
   */
  async resetUserPassword(req: AuthRequest, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(status.BAD_REQUEST).json({
          error: 'Bad Request',
          message: 'User ID is required',
        });
      }

      // Generate a temporary password
      const tempPassword = this._generateTempPassword();
      const hashedPassword = await hashPassword(tempPassword);

      // Update user password
      await this._userService.updateUser(userId, { password: hashedPassword });

      // Get user details for logging
      const user = await this._userService.getUserById(userId);
      if (!user) {
        return res.status(status.NOT_FOUND).json({
          error: ERROR_MESSAGES.USER_NOT_FOUND,
          message: 'User not found',
        });
      }

      // Log action
      if (req.user) {
        await this._superAdminService.logAction({
          userId: req.user.userId,
          tenantId: user.tenantId,
          action: 'password_reset',
          entityType: 'user',
          entityId: userId,
          changes: { password_reset: true },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      res.json({
        message: 'Password reset successfully',
        tempPassword: tempPassword, // In production, this should be sent via email
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
        },
      });
    } catch (error) {
      logger.error('Reset password error:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: ERROR_MESSAGES.INTERNAL_SERVER,
        message: 'Failed to reset password',
      });
    }
  }

  /**
   * Generate a temporary password
   */
  private _generateTempPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
