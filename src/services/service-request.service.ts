import { db } from '../database/db';
import { serviceRequests, tables, users, requestTypes, NewServiceRequest } from '../database/schema';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { RequestStatus } from '../models/types';
import { requestTypeService } from './request-type.service';

export class ServiceRequestService {
  /**
   * Calculate duration in seconds for a service request
   */
  private _calculateDuration(request: { timestampCreated?: Date | string; timestampCompleted?: Date | string | null; status?: string; updatedAt?: Date | string }): number {
    if (!request.timestampCreated) return 0;

    const created = new Date(request.timestampCreated);
    let endTime: Date;

    if (request.status === 'completed' && request.timestampCompleted) {
      endTime = new Date(request.timestampCompleted);
    } else if (request.status === 'cancelled') {
      // For cancelled, use updatedAt as end time
      endTime = new Date(request.updatedAt || Date.now());
    } else {
      // For pending/acknowledged, use current time
      endTime = new Date();
    }

    return Math.floor((endTime.getTime() - created.getTime()) / 1000);
  }
  async getAllServiceRequests() {
    const requests = await db
      .select({
        id: serviceRequests.id,
        tenantId: serviceRequests.tenantId,
        tableId: serviceRequests.tableId,
        requestType: serviceRequests.requestType,
        status: serviceRequests.status,
        customNote: serviceRequests.customNote,
        timestampCreated: serviceRequests.timestampCreated,
        timestampAcknowledged: serviceRequests.timestampAcknowledged,
        timestampCompleted: serviceRequests.timestampCompleted,
        acknowledgedBy: serviceRequests.acknowledgedBy,
        durationSeconds: serviceRequests.durationSeconds,
        createdAt: serviceRequests.createdAt,
        updatedAt: serviceRequests.updatedAt,
        // Joined data
        tableNumber: tables.tableNumber,
        acknowledgedByUser: users.fullName,
        requestTypeNameEn: requestTypes.nameEn,
        requestTypeNameAr: requestTypes.nameAr,
        requestTypeIcon: requestTypes.icon,
      })
      .from(serviceRequests)
      .leftJoin(tables, eq(serviceRequests.tableId, tables.id))
      .leftJoin(users, eq(serviceRequests.acknowledgedBy, users.id))
      .leftJoin(requestTypes, sql`
        CASE 
          WHEN ${serviceRequests.requestType} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN CAST(${serviceRequests.requestType} AS UUID) = ${requestTypes.id}
          ELSE FALSE
        END
      `)
      .orderBy(desc(serviceRequests.timestampCreated));

    // Calculate duration for requests that don't have it
    return requests.map((request) => ({
      ...request,
      durationSeconds: request.durationSeconds || this._calculateDuration(request),
    }));
  }

  /**
   * Get service requests with pagination, filtering, and sorting
   */
  async getServiceRequestsWithPagination(
    tenantId: string,
    options: {
      page: number;
      limit: number;
      filters: {
        status?: string;
        type?: string;
        tableId?: string;
      };
      sort: {
        by: string;
        order: 'asc' | 'desc';
      };
    },
  ) {
    const { page, limit, filters, sort } = options;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(serviceRequests.tenantId, tenantId)];

    if (filters.status) {
      conditions.push(eq(serviceRequests.status, filters.status));
    }

    if (filters.type) {
      conditions.push(eq(serviceRequests.requestType, filters.type));
    }

    if (filters.tableId) {
      conditions.push(eq(serviceRequests.tableId, filters.tableId));
    }

    // Build order by
    let orderBy;
    switch (sort.by) {
      case 'timestampCreated':
        orderBy =
          sort.order === 'desc'
            ? desc(serviceRequests.timestampCreated)
            : serviceRequests.timestampCreated;
        break;
      case 'status':
        orderBy = sort.order === 'desc' ? desc(serviceRequests.status) : serviceRequests.status;
        break;
      case 'requestType':
        orderBy =
          sort.order === 'desc' ? desc(serviceRequests.requestType) : serviceRequests.requestType;
        break;
      case 'tableNumber':
        orderBy = sort.order === 'desc' ? desc(tables.tableNumber) : tables.tableNumber;
        break;
      case 'durationSeconds':
        orderBy =
          sort.order === 'desc'
            ? desc(serviceRequests.durationSeconds)
            : serviceRequests.durationSeconds;
        break;
      default:
        orderBy = desc(serviceRequests.timestampCreated);
    }

    // Get total count
    const totalCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(serviceRequests)
      .leftJoin(tables, eq(serviceRequests.tableId, tables.id))
      .where(and(...conditions));

    const totalCount = totalCountResult[0]?.count || 0;

    // Get paginated results
    const requests = await db
      .select({
        id: serviceRequests.id,
        tenantId: serviceRequests.tenantId,
        tableId: serviceRequests.tableId,
        requestType: serviceRequests.requestType,
        status: serviceRequests.status,
        customNote: serviceRequests.customNote,
        timestampCreated: serviceRequests.timestampCreated,
        timestampAcknowledged: serviceRequests.timestampAcknowledged,
        timestampCompleted: serviceRequests.timestampCompleted,
        acknowledgedBy: serviceRequests.acknowledgedBy,
        durationSeconds: serviceRequests.durationSeconds,
        createdAt: serviceRequests.createdAt,
        updatedAt: serviceRequests.updatedAt,
        // Joined data
        tableNumber: tables.tableNumber,
        acknowledgedByUser: users.fullName,
        requestTypeNameEn: requestTypes.nameEn,
        requestTypeNameAr: requestTypes.nameAr,
        requestTypeIcon: requestTypes.icon,
      })
      .from(serviceRequests)
      .leftJoin(tables, eq(serviceRequests.tableId, tables.id))
      .leftJoin(users, eq(serviceRequests.acknowledgedBy, users.id))
      .leftJoin(requestTypes, sql`
        CASE 
          WHEN ${serviceRequests.requestType} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN CAST(${serviceRequests.requestType} AS UUID) = ${requestTypes.id}
          ELSE FALSE
        END
      `)
      .where(and(...conditions))
      .orderBy(
        sort.by === 'durationSeconds'
          ? sort.order === 'desc'
            ? desc(sql<number>`
                        CASE
                            WHEN ${serviceRequests.status} = 'completed' AND ${serviceRequests.timestampCompleted} IS NOT NULL
                            THEN EXTRACT(EPOCH FROM (${serviceRequests.timestampCompleted} - ${serviceRequests.timestampCreated}))
                            WHEN ${serviceRequests.status} = 'cancelled'
                            THEN EXTRACT(EPOCH FROM (COALESCE(${serviceRequests.updatedAt}, NOW()) - ${serviceRequests.timestampCreated}))
                            ELSE EXTRACT(EPOCH FROM (NOW() - ${serviceRequests.timestampCreated}))
                        END
                    `)
            : sql<number>`
                        CASE
                            WHEN ${serviceRequests.status} = 'completed' AND ${serviceRequests.timestampCompleted} IS NOT NULL
                            THEN EXTRACT(EPOCH FROM (${serviceRequests.timestampCompleted} - ${serviceRequests.timestampCreated}))
                            WHEN ${serviceRequests.status} = 'cancelled'
                            THEN EXTRACT(EPOCH FROM (COALESCE(${serviceRequests.updatedAt}, NOW()) - ${serviceRequests.timestampCreated}))
                            ELSE EXTRACT(EPOCH FROM (NOW() - ${serviceRequests.timestampCreated}))
                        END
                    `
          : orderBy,
      )
      .limit(limit)
      .offset(offset);

    // Calculate duration for requests that don't have it
    const enrichedRequests = requests.map((request) => ({
      ...request,
      durationSeconds: request.durationSeconds || this._calculateDuration(request),
    }));

    return {
      data: enrichedRequests,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get active service requests by tenant
   */
  async getActiveServiceRequestsByTenant(tenantId: string) {
    const requests = await db
      .select({
        id: serviceRequests.id,
        tenantId: serviceRequests.tenantId,
        tableId: serviceRequests.tableId,
        requestType: serviceRequests.requestType,
        status: serviceRequests.status,
        customNote: serviceRequests.customNote,
        timestampCreated: serviceRequests.timestampCreated,
        timestampAcknowledged: serviceRequests.timestampAcknowledged,
        timestampCompleted: serviceRequests.timestampCompleted,
        acknowledgedBy: serviceRequests.acknowledgedBy,
        durationSeconds: serviceRequests.durationSeconds,
        createdAt: serviceRequests.createdAt,
        updatedAt: serviceRequests.updatedAt,
        // Joined data
        tableNumber: tables.tableNumber,
        acknowledgedByUser: users.fullName,
      })
      .from(serviceRequests)
      .leftJoin(tables, eq(serviceRequests.tableId, tables.id))
      .leftJoin(users, eq(serviceRequests.acknowledgedBy, users.id))
      .where(and(eq(serviceRequests.tenantId, tenantId), eq(serviceRequests.status, 'pending')))
      .orderBy(desc(serviceRequests.timestampCreated));

    // Calculate duration for requests that don't have it
    return requests.map((request) => ({
      ...request,
      durationSeconds: request.durationSeconds || this._calculateDuration(request),
    }));
  }

  /**
   * Get service request by ID
   */
  async getServiceRequestById(id: string) {
    const [request] = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, id))
      .limit(1);

    return request || null;
  }

  /**
   * Create new service request
   */
  async createServiceRequest(
    requestData: Omit<NewServiceRequest, 'id' | 'createdAt' | 'updatedAt'>,
  ) {
    // Validate request data against LAS schemas
    const validation = await requestTypeService.validateRequestData(requestData.requestType, requestData);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors?.join(', ')}`);
    }

    // Validate request type exists and is active for the tenant (if requestType is a UUID)
    // Skip validation for legacy hardcoded types like 'call_waiter', 'bill', 'assistance', 'custom'
    const legacyTypes = ['call_waiter', 'bill', 'assistance', 'custom'];
    if (requestData.requestType && !legacyTypes.includes(requestData.requestType)) {
      const isValid = await requestTypeService.validateRequestType(
        requestData.requestType,
        requestData.tenantId
      );
      
      if (!isValid) {
        throw new Error('Invalid or inactive request type');
      }
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newRequest: NewServiceRequest = {
      id,
      ...requestData,
      status: requestData.status || 'pending',
      timestampCreated: new Date(),
    };

    const result = await db.insert(serviceRequests).values(newRequest).returning();

    return result[0];
  }

  /**
   * Update service request
   */
  async updateServiceRequest(id: string, updates: Partial<NewServiceRequest>) {
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    // Handle status-specific updates
    if (updates.status === 'acknowledged') {
      updateData.timestampAcknowledged = new Date();
    } else if (updates.status === 'completed' || updates.status === 'cancelled') {
      if (updates.status === 'completed') {
        updateData.timestampCompleted = new Date();
      }

      // Calculate duration if not provided
      if (!updateData.durationSeconds) {
        const request = await this.getServiceRequestById(id);
        if (request?.timestampCreated) {
          updateData.durationSeconds = Math.floor(
            (Date.now() - request.timestampCreated.getTime()) / 1000,
          );
        }
      }
    }

    const result = await db
      .update(serviceRequests)
      .set(updateData)
      .where(eq(serviceRequests.id, id))
      .returning();

    return result[0] || null;
  }

  /**
   * Acknowledge service request
   */
  async acknowledgeServiceRequest(id: string, acknowledgedBy: string) {
    return await this.updateServiceRequest(id, {
      status: 'acknowledged',
      acknowledgedBy,
    });
  }

  /**
   * Complete service request
   */
  async completeServiceRequest(id: string) {
    return await this.updateServiceRequest(id, {
      status: 'completed',
    });
  }

  /**
   * Cancel service request
   */
  async cancelServiceRequest(id: string) {
    return await this.updateServiceRequest(id, {
      status: 'cancelled',
    });
  }

  /**
   * Delete service request
   */
  async deleteServiceRequest(id: string) {
    const result = await db.delete(serviceRequests).where(eq(serviceRequests.id, id));

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get service requests by status
   */
  async getServiceRequestsByStatus(status: RequestStatus, tenantId?: string) {
    const conditions = [eq(serviceRequests.status, status)];

    if (tenantId) {
      conditions.push(eq(serviceRequests.tenantId, tenantId));
    }

    const requests = await db
      .select({
        id: serviceRequests.id,
        tenantId: serviceRequests.tenantId,
        tableId: serviceRequests.tableId,
        requestType: serviceRequests.requestType,
        status: serviceRequests.status,
        customNote: serviceRequests.customNote,
        timestampCreated: serviceRequests.timestampCreated,
        timestampAcknowledged: serviceRequests.timestampAcknowledged,
        timestampCompleted: serviceRequests.timestampCompleted,
        acknowledgedBy: serviceRequests.acknowledgedBy,
        durationSeconds: serviceRequests.durationSeconds,
        createdAt: serviceRequests.createdAt,
        updatedAt: serviceRequests.updatedAt,
        // Joined data
        tableNumber: tables.tableNumber,
        acknowledgedByUser: users.fullName,
      })
      .from(serviceRequests)
      .leftJoin(tables, eq(serviceRequests.tableId, tables.id))
      .leftJoin(users, eq(serviceRequests.acknowledgedBy, users.id))
      .where(and(...conditions))
      .orderBy(desc(serviceRequests.timestampCreated));

    // Calculate duration for requests that don't have it
    return requests.map((request) => ({
      ...request,
      durationSeconds: request.durationSeconds || this._calculateDuration(request),
    }));
  }

  /**
   * Get service requests by table
   */
  async getServiceRequestsByTable(tableId: string, tenantId: string) {
    const requests = await db
      .select({
        id: serviceRequests.id,
        tenantId: serviceRequests.tenantId,
        tableId: serviceRequests.tableId,
        requestType: serviceRequests.requestType,
        status: serviceRequests.status,
        customNote: serviceRequests.customNote,
        timestampCreated: serviceRequests.timestampCreated,
        timestampAcknowledged: serviceRequests.timestampAcknowledged,
        timestampCompleted: serviceRequests.timestampCompleted,
        acknowledgedBy: serviceRequests.acknowledgedBy,
        durationSeconds: serviceRequests.durationSeconds,
        createdAt: serviceRequests.createdAt,
        updatedAt: serviceRequests.updatedAt,
        // Joined data
        tableNumber: tables.tableNumber,
        acknowledgedByUser: users.fullName,
      })
      .from(serviceRequests)
      .leftJoin(tables, eq(serviceRequests.tableId, tables.id))
      .leftJoin(users, eq(serviceRequests.acknowledgedBy, users.id))
      .where(and(eq(serviceRequests.tableId, tableId), eq(serviceRequests.tenantId, tenantId)))
      .orderBy(desc(serviceRequests.timestampCreated));

    // Calculate duration for requests that don't have it
    return requests.map((request) => ({
      ...request,
      durationSeconds: request.durationSeconds || this._calculateDuration(request),
    }));
  }

  /**
   * Get analytics data
   */
  async getAnalytics(tenantId?: string) {
    const conditions = tenantId ? [eq(serviceRequests.tenantId, tenantId)] : [];

    const allRequests = await db
      .select()
      .from(serviceRequests)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const totalRequests = allRequests.length;
    const pendingRequests = allRequests.filter((r) => r.status === 'pending').length;
    const completedRequests = allRequests.filter((r) => r.status === 'completed').length;

    // Calculate average response time for completed requests
    const completedWithDuration = allRequests.filter(
      (r) => r.status === 'completed' && r.durationSeconds,
    );
    const averageResponseTime =
      completedWithDuration.length > 0
        ? Math.round(
          completedWithDuration.reduce((sum, r) => sum + (r.durationSeconds || 0), 0) /
          completedWithDuration.length,
        )
        : 0;

    // Group by type
    const requestsByType: Record<string, number> = {};
    allRequests.forEach((r) => {
      requestsByType[r.requestType] = (requestsByType[r.requestType] || 0) + 1;
    });

    // Group by table
    const requestsByTable: Record<string, number> = {};
    allRequests.forEach((r) => {
      if (r.tableId) {
        requestsByTable[r.tableId] = (requestsByTable[r.tableId] || 0) + 1;
      }
    });

    return {
      totalRequests,
      pendingRequests,
      completedRequests,
      averageResponseTime,
      requestsByType,
      requestsByTable,
    };
  }

  /**
   * Get service requests within date range
   */
  async getServiceRequestsByDateRange(startDate: Date, endDate: Date, tenantId?: string) {
    const conditions = [
      gte(serviceRequests.timestampCreated, startDate),
      lte(serviceRequests.timestampCreated, endDate),
    ];

    if (tenantId) {
      conditions.push(eq(serviceRequests.tenantId, tenantId));
    }

    const requests = await db
      .select({
        id: serviceRequests.id,
        tenantId: serviceRequests.tenantId,
        tableId: serviceRequests.tableId,
        requestType: serviceRequests.requestType,
        status: serviceRequests.status,
        customNote: serviceRequests.customNote,
        timestampCreated: serviceRequests.timestampCreated,
        timestampAcknowledged: serviceRequests.timestampAcknowledged,
        timestampCompleted: serviceRequests.timestampCompleted,
        acknowledgedBy: serviceRequests.acknowledgedBy,
        durationSeconds: serviceRequests.durationSeconds,
        createdAt: serviceRequests.createdAt,
        updatedAt: serviceRequests.updatedAt,
        // Joined data
        tableNumber: tables.tableNumber,
        acknowledgedByUser: users.fullName,
      })
      .from(serviceRequests)
      .leftJoin(tables, eq(serviceRequests.tableId, tables.id))
      .leftJoin(users, eq(serviceRequests.acknowledgedBy, users.id))
      .where(and(...conditions))
      .orderBy(desc(serviceRequests.timestampCreated));

    // Calculate duration for requests that don't have it
    return requests.map((request) => ({
      ...request,
      durationSeconds: request.durationSeconds || this._calculateDuration(request),
    }));
  }
}
