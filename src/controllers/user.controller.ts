import { Response } from 'express';
import { UserService } from '../services/user.service';
import { TenantRequest } from '../middleware/tenant';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { status } from "http-status";
// Error messages
const ERROR_MESSAGES = {
  USER_NOT_FOUND: 'User not found',
  TENANT_ID_REQUIRED: 'Tenant ID is required',
  FAILED_TO_GET_USERS: 'Failed to get users',
  FAILED_TO_GET_USER: 'Failed to get user',
  FAILED_TO_CREATE_USER: 'Failed to create user',
  FAILED_TO_UPDATE_USER: 'Failed to update user',
  FAILED_TO_DELETE_USER: 'Failed to delete user',
} as const;

const userService = new UserService();

export class UserController {
  /**
   * Get all users - tenant-scoped for admin, all tenants for superadmin
   */
  async getAllUsers(req: AuthRequest & TenantRequest, res: Response) {
    try {
      let users;

      if (req.user?.isSuperAdmin) {
        // Superadmin can see all users across all tenants
        users = await userService.getAllUsers();
      } else {
        // Admin can only see users in their tenant
        if (!req.tenantId) {
          return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
        }
        const tenantId = req.tenantId;
        users = await userService.getUsersByTenant(tenantId);
      }

      res.json(users);
    } catch (error) {
      logger.error('Error getting users:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GET_USERS });
    }
  }

  /**
   * Get user by ID - tenant-scoped for admin, any tenant for superadmin
   */
  async getUserById(req: AuthRequest & TenantRequest, res: Response) {
    try {
      const { id } = req.params;

      const user = await userService.getUserById(id);

      if (!user) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
      }

      // Check tenant isolation for non-superadmin users
      if (!req.user?.isSuperAdmin && user.tenantId !== req.tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
      }

      res.json(user);
    } catch (error) {
      logger.error('Error getting user:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GET_USER });
    }
  }

  /**
   * Create new user - within tenant for admin, any tenant for superadmin
   */
  async createUser(req: AuthRequest & TenantRequest, res: Response) {
    try {
      const userData = req.body;
      let tenantId: string;

      if (req.user?.isSuperAdmin && userData.tenantId) {
        // Superadmin can specify tenant
        tenantId = userData.tenantId;
      } else {
        // Admin can only create users in their tenant
        if (!req.tenantId) {
          return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
        }
        tenantId = req.tenantId;
      }

      const user = await userService.createUser({
        ...userData,
        tenantId,
      });
      res.status(status.CREATED).json(user);
    } catch (error) {
      logger.error('Error creating user:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_CREATE_USER });
    }
  }

  /**
   * Update user - tenant-scoped for admin, any tenant for superadmin
   */
  async updateUser(req: AuthRequest & TenantRequest, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;

      // First check if the user exists
      const existingUser = await userService.getUserById(id);
      if (!existingUser) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
      }

      // Check tenant isolation for non-superadmin users
      if (!req.user?.isSuperAdmin && existingUser.tenantId !== req.tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
      }

      // Prevent non-superadmin from changing tenant or role to superadmin
      if (!req.user?.isSuperAdmin) {
        delete updates.tenantId;
        if (updates.role === 'superadmin') {
          return res.status(status.FORBIDDEN).json({ error: 'Cannot assign superadmin role' });
        }
      }

      const user = await userService.updateUser(id, updates);

      if (!user) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
      }

      res.json(user);
    } catch (error) {
      logger.error('Error updating user:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_UPDATE_USER });
    }
  }

  /**
   * Delete user - tenant-scoped for admin, any tenant for superadmin
   */
  async deleteUser(req: AuthRequest & TenantRequest, res: Response) {
    try {
      const { id } = req.params;

      // First check if the user exists
      const existingUser = await userService.getUserById(id);
      if (!existingUser) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
      }

      // Check tenant isolation for non-superadmin users
      if (!req.user?.isSuperAdmin && existingUser.tenantId !== req.tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
      }

      // Prevent deleting superadmin users by non-superadmin
      if (!req.user?.isSuperAdmin && existingUser.isSuperAdmin) {
        return res.status(status.FORBIDDEN).json({ error: 'Cannot delete superadmin user' });
      }

      const deleted = await userService.deleteUser(id);

      if (!deleted) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.USER_NOT_FOUND });
      }

      res.status(status.NO_CONTENT).send();
    } catch (error) {
      logger.error('Error deleting user:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_DELETE_USER });
    }
  }
}
