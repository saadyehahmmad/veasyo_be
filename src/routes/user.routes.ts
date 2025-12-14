import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth';
import { requireSelfOrAdmin, requireTenantAdmin } from '../middleware/rbac';

const router = Router();
const userController = new UserController();

// All routes require authentication
router.use(authenticate);

/**
 * @route GET /api/users
 * @desc Get all users within current tenant
 * @access Admin (tenant-scoped), SuperAdmin (all tenants)
 */
router.get('/', requireTenantAdmin(), userController.getAllUsers.bind(userController));

/**
 * @route GET /api/users/:id
 * @desc Get user by ID (within tenant for admin, any for superadmin)
 * @access Admin (tenant-scoped), SuperAdmin, Self
 */
router.get('/:id', requireSelfOrAdmin(), userController.getUserById.bind(userController));

/**
 * @route POST /api/users
 * @desc Create new user within current tenant
 * @access Admin (tenant-scoped), SuperAdmin
 */
router.post('/', requireTenantAdmin(), userController.createUser.bind(userController));

/**
 * @route PUT /api/users/:id
 * @desc Update user (within tenant for admin, any for superadmin)
 * @access Admin (tenant-scoped), SuperAdmin, Self
 */
router.put('/:id', requireSelfOrAdmin(), userController.updateUser.bind(userController));

/**
 * @route DELETE /api/users/:id
 * @desc Delete user (within tenant for admin, any for superadmin)
 * @access Admin (tenant-scoped), SuperAdmin
 */
router.delete('/:id', requireTenantAdmin(), userController.deleteUser.bind(userController));

export default router;
