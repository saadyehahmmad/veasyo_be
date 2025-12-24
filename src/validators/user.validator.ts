import { z } from 'zod';

/**
 * User validation schemas using Zod
 */

// Base user fields
const userRoles = ['admin', 'waiter', 'superadmin'] as const;

export const createUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(100, 'Username must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters'),
  
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  
  fullName: z
    .string()
    .min(1, 'Full name is required')
    .max(255, 'Full name must not exceed 255 characters'),
  
  role: z.enum(userRoles, {
    message: 'Role must be one of: admin, waiter, superadmin',
  }),
  
  tenantId: z
    .string()
    .uuid('Invalid tenant ID format')
    .optional(),
  
  active: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(100, 'Username must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens')
    .optional(),
  
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters')
    .optional(),
  
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    )
    .optional(),
  
  fullName: z
    .string()
    .min(1, 'Full name is required')
    .max(255, 'Full name must not exceed 255 characters')
    .optional(),
  
  role: z.enum(userRoles).optional(),
  
  active: z.boolean().optional(),
  
  tenantId: z
    .string()
    .uuid('Invalid tenant ID format')
    .optional(),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid('Invalid user ID format'),
});

export const getUsersQuerySchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/, 'Page must be a number')
    .transform((val) => parseInt(val, 10))
    .refine((n) => n > 0, 'Page must be greater than 0')
    .optional(),
  
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a number')
    .transform((val) => parseInt(val, 10))
    .refine((n) => n > 0 && n <= 100, 'Limit must be between 1 and 100')
    .optional(),
  
  search: z.string().max(255).optional(),
  
  role: z.enum(userRoles).optional(),
  
  active: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  
  tenantId: z.string().uuid().optional(),
});

// Type exports for TypeScript
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type GetUsersQuery = z.infer<typeof getUsersQuerySchema>;

