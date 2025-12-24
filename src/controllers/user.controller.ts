import { Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { TenantRequest } from '../middleware/tenant';
import { AuthRequest } from '../middleware/auth';
import { 
  NotFoundError, 
  BadRequestError, 
  ForbiddenError 
} from '../errors/AppError';

const userService = new UserService();

export class UserController {
  /**
   * Get all users - tenant-scoped for admin, all tenants for superadmin
   */
  async getAllUsers(req: AuthRequest & TenantRequest, res: Response, next: NextFunction) {
    try {
      let users;

      if (req.user?.isSuperAdmin) {
        // Superadmin can see all users across all tenants
        users = await userService.getAllUsers();
      } else {
        // Admin can only see users in their tenant
        if (!req.tenantId) {
          throw new BadRequestError('Tenant ID is required', 'TENANT_ID_REQUIRED');
        }
        users = await userService.getUsersByTenant(req.tenantId);
      }

      res.json(users);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user by ID - tenant-scoped for admin, any tenant for superadmin
   */
  async getUserById(req: AuthRequest & TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const user = await userService.getUserById(id);

      if (!user) {
        throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      }

      // Check tenant isolation for non-superadmin users
      if (!req.user?.isSuperAdmin && user.tenantId !== req.tenantId) {
        throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create new user - within tenant for admin, any tenant for superadmin
   */
  async createUser(req: AuthRequest & TenantRequest, res: Response, next: NextFunction) {
    try {
      const userData = req.body;
      let tenantId: string;

      if (req.user?.isSuperAdmin && userData.tenantId) {
        // Superadmin can specify tenant
        tenantId = userData.tenantId;
      } else {
        // Admin can only create users in their tenant
        if (!req.tenantId) {
          throw new BadRequestError('Tenant ID is required', 'TENANT_ID_REQUIRED');
        }
        tenantId = req.tenantId;
      }

      const user = await userService.createUser({
        ...userData,
        tenantId,
      });
      
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user - tenant-scoped for admin, any tenant for superadmin
   */
  async updateUser(req: AuthRequest & TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updates = req.body;

      // First check if the user exists
      const existingUser = await userService.getUserById(id);
      if (!existingUser) {
        throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      }

      // Check tenant isolation for non-superadmin users
      if (!req.user?.isSuperAdmin && existingUser.tenantId !== req.tenantId) {
        throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      }

      // Prevent non-superadmin from changing tenant or role to superadmin
      if (!req.user?.isSuperAdmin) {
        delete updates.tenantId;
        if (updates.role === 'superadmin') {
          throw new ForbiddenError('Cannot assign superadmin role', 'FORBIDDEN_ROLE_CHANGE');
        }
      }

      const user = await userService.updateUser(id, updates);

      if (!user) {
        throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete user - tenant-scoped for admin, any tenant for superadmin
   */
  async deleteUser(req: AuthRequest & TenantRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // First check if the user exists
      const existingUser = await userService.getUserById(id);
      if (!existingUser) {
        throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      }

      // Check tenant isolation for non-superadmin users
      if (!req.user?.isSuperAdmin && existingUser.tenantId !== req.tenantId) {
        throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      }

      // Prevent deleting superadmin users by non-superadmin
      if (!req.user?.isSuperAdmin && existingUser.isSuperAdmin) {
        throw new ForbiddenError('Cannot delete superadmin user', 'FORBIDDEN_DELETE_SUPERADMIN');
      }

      const deleted = await userService.deleteUser(id);

      if (!deleted) {
        throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
