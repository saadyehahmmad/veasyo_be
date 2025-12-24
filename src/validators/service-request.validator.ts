import { z } from 'zod';

/**
 * Service Request validation schemas using Zod
 */

const requestStatuses = ['pending', 'acknowledged', 'completed', 'cancelled'] as const;

export const createServiceRequestSchema = z.object({
  tableId: z
    .string()
    .uuid('Invalid table ID format'),
  
  requestType: z
    .string()
    .min(1, 'Request type is required')
    .max(50, 'Request type must not exceed 50 characters'),
  
  customNote: z
    .string()
    .max(500, 'Custom note must not exceed 500 characters')
    .optional(),
  
  status: z.enum(requestStatuses).optional(),
});

export const updateServiceRequestSchema = z.object({
  status: z.enum(requestStatuses).optional(),
  
  customNote: z
    .string()
    .max(500, 'Custom note must not exceed 500 characters')
    .optional(),
  
  acknowledgedBy: z
    .string()
    .uuid('Invalid user ID format')
    .optional(),
  
  completedBy: z
    .enum(['waiter', 'customer'])
    .optional(),
});

export const acknowledgeRequestSchema = z.object({
  acknowledgedBy: z
    .string()
    .uuid('Invalid user ID format'),
});

export const serviceRequestIdParamSchema = z.object({
  id: z
    .string()
    .min(1, 'Request ID is required')
    .max(100, 'Request ID is too long'),
});

export const getServiceRequestsQuerySchema = z.object({
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
  
  status: z.enum(requestStatuses).optional(),
  
  type: z.string().max(50).optional(),
  
  tableId: z.string().uuid('Invalid table ID format').optional(),
  
  sortBy: z
    .enum(['timestampCreated', 'status', 'requestType', 'tableNumber', 'durationSeconds'])
    .optional()
    .default('timestampCreated'),
  
  sortOrder: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc'),
});

export const dateRangeQuerySchema = z.object({
  startDate: z
    .string()
    .datetime('Invalid start date format')
    .transform((str) => new Date(str)),
  
  endDate: z
    .string()
    .datetime('Invalid end date format')
    .transform((str) => new Date(str)),
});

// Type exports for TypeScript
export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;
export type UpdateServiceRequestInput = z.infer<typeof updateServiceRequestSchema>;
export type AcknowledgeRequestInput = z.infer<typeof acknowledgeRequestSchema>;
export type GetServiceRequestsQuery = z.infer<typeof getServiceRequestsQuerySchema>;
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

