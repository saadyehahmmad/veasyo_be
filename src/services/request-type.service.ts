import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../database/db';
import { requestTypes, type RequestType, type NewRequestType } from '../database/schema';
import logger from '../utils/logger';
import licenseService from './license.service';

export class RequestTypeService {
  /**
   * Get dynamic form engines from LAS
   */
  async getFormEngines(): Promise<Record<string, any> | null> {
    try {
      const formEngines = licenseService.getFormEngines();
      if (!formEngines) {
        logger.warn('No form engines available from LAS');
        return null;
      }
      return formEngines;
    } catch (error) {
      logger.error('Error fetching form engines from LAS:', error);
      return null;
    }
  }

  /**
   * Get validation schemas from LAS
   */
  async getValidationSchemas(): Promise<Record<string, any> | null> {
    try {
      const schemas = licenseService.getValidationSchemas();
      if (!schemas) {
        logger.warn('No validation schemas available from LAS');
        return null;
      }
      return schemas;
    } catch (error) {
      logger.error('Error fetching validation schemas from LAS:', error);
      return null;
    }
  }

  /**
   * Validate request data against LAS schemas
   */
  async validateRequestData(requestType: string, data: any): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const schemas = await this.getValidationSchemas();
      if (!schemas || !schemas[requestType]) {
        logger.warn(`No validation schema found for request type: ${requestType}`);
        return { valid: true }; // Allow if no schema
      }

      const schema = schemas[requestType];
      const errors: string[] = [];

      // Basic validation logic - can be enhanced
      for (const [field, rules] of Object.entries(schema) as [string, any][]) {
        if (rules.required && (data[field] === undefined || data[field] === null || data[field] === '')) {
          errors.push(`${field} is required`);
        }

        if (rules.type && typeof data[field] !== rules.type) {
          errors.push(`${field} must be of type ${rules.type}`);
        }

        if (rules.minLength && data[field] && data[field].length < rules.minLength) {
          errors.push(`${field} must be at least ${rules.minLength} characters`);
        }

        if (rules.maxLength && data[field] && data[field].length > rules.maxLength) {
          errors.push(`${field} must be at most ${rules.maxLength} characters`);
        }
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      logger.error('Error validating request data:', error);
      return { valid: false, errors: ['Validation failed due to system error'] };
    }
  }
  async getAllByTenant(tenantId: string, activeOnly: boolean = false): Promise<RequestType[]> {
    try {
      const conditions = activeOnly
        ? and(eq(requestTypes.tenantId, tenantId), eq(requestTypes.active, true))
        : eq(requestTypes.tenantId, tenantId);

      const results = await db
        .select()
        .from(requestTypes)
        .where(conditions)
        .orderBy(asc(requestTypes.displayOrder));

      logger.info(`Retrieved ${results.length} request types for tenant ${tenantId}`);
      return results;
    } catch (error) {
      logger.error('Error fetching request types:', error);
      throw new Error('Failed to fetch request types');
    }
  }

  /**
   * Get a single request type by ID
   * @param id - The request type ID
   */
  async getById(id: string): Promise<RequestType | null> {
    try {
      const result = await db
        .select()
        .from(requestTypes)
        .where(eq(requestTypes.id, id))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      logger.error(`Error fetching request type ${id}:`, error);
      throw new Error('Failed to fetch request type');
    }
  }

  /**
   * Create a new request type
   * @param data - The request type data
   */
  async create(data: NewRequestType): Promise<RequestType> {
    try {
      // Get the current max display order for the tenant
      const maxOrderResult = await db
        .select()
        .from(requestTypes)
        .where(eq(requestTypes.tenantId, data.tenantId))
        .orderBy(desc(requestTypes.displayOrder))
        .limit(1);

      const nextOrder = maxOrderResult.length > 0 ? (maxOrderResult[0].displayOrder || 0) + 1 : 1;

      const result = await db
        .insert(requestTypes)
        .values({
          ...data,
          displayOrder: data.displayOrder ?? nextOrder,
        })
        .returning();

      logger.info(`Created request type: ${result[0].id} for tenant ${data.tenantId}`);
      return result[0];
    } catch (error) {
      logger.error('Error creating request type:', error);
      throw new Error('Failed to create request type');
    }
  }

  /**
   * Update a request type
   * @param id - The request type ID
   * @param updates - The updates to apply
   */
  async update(id: string, updates: Partial<RequestType>): Promise<RequestType> {
    try {
      const result = await db
        .update(requestTypes)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(requestTypes.id, id))
        .returning();

      if (result.length === 0) {
        throw new Error('Request type not found');
      }

      logger.info(`Updated request type: ${id}`);
      return result[0];
    } catch (error) {
      logger.error(`Error updating request type ${id}:`, error);
      throw new Error('Failed to update request type');
    }
  }

  /**
   * Delete a request type
   * @param id - The request type ID
   */
  async delete(id: string): Promise<void> {
    try {
      const result = await db
        .delete(requestTypes)
        .where(eq(requestTypes.id, id))
        .returning();

      if (result.length === 0) {
        throw new Error('Request type not found');
      }

      logger.info(`Deleted request type: ${id}`);
    } catch (error) {
      logger.error(`Error deleting request type ${id}:`, error);
      throw new Error('Failed to delete request type');
    }
  }

  /**
   * Reorder request types for a tenant
   * @param tenantId - The tenant ID
   * @param orderedIds - Array of request type IDs in the desired order
   */
  async reorder(tenantId: string, orderedIds: string[]): Promise<void> {
    try {
      // Step 1: Set all display orders to high temporary values to avoid constraint conflicts
      // (e.g., if reordering [2,1,3], we first set to [1002,1001,1003])
      const tempOffset = 10000;
      const tempUpdatePromises = orderedIds.map((id, index) =>
        db
          .update(requestTypes)
          .set({
            displayOrder: tempOffset + index + 1,
            updatedAt: new Date(),
          })
          .where(and(eq(requestTypes.id, id), eq(requestTypes.tenantId, tenantId)))
      );
      await Promise.all(tempUpdatePromises);

      // Step 2: Set final display orders (1, 2, 3, ...)
      const finalUpdatePromises = orderedIds.map((id, index) =>
        db
          .update(requestTypes)
          .set({
            displayOrder: index + 1,
            updatedAt: new Date(),
          })
          .where(and(eq(requestTypes.id, id), eq(requestTypes.tenantId, tenantId)))
      );
      await Promise.all(finalUpdatePromises);

      logger.info(`Reordered request types for tenant ${tenantId}`);
    } catch (error) {
      logger.error(`Error reordering request types for tenant ${tenantId}:`, error);
      throw new Error('Failed to reorder request types');
    }
  }

  /**
   * Validate that a request type exists and is active for a tenant
   * @param requestTypeId - The request type ID
   * @param tenantId - The tenant ID
   */
  async validateRequestType(requestTypeId: string, tenantId: string): Promise<boolean> {
    try {
      const result = await db
        .select()
        .from(requestTypes)
        .where(
          and(
            eq(requestTypes.id, requestTypeId),
            eq(requestTypes.tenantId, tenantId),
            eq(requestTypes.active, true)
          )
        )
        .limit(1);

      return result.length > 0;
    } catch (error) {
      logger.error('Error validating request type:', error);
      return false;
    }
  }
}

export const requestTypeService = new RequestTypeService();
