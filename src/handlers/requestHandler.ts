import { db } from '../database/db';
import { serviceRequests, NewServiceRequest, tenants, tables, requestTypes } from '../database/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { Server as SocketIOServer } from 'socket.io';
import logger from '../utils/logger';
import { IntegrationService } from '../services/integration.service';
import { printerIntegration } from '../integrations/printer.integration';
import { speakerIntegration } from '../integrations/speaker.integration';
import { MultiTenantCacheManager, CacheManager } from '../utils/cache-manager';

// In-memory cache for active requests (per tenant) with TTL and size limits
// Configuration:
// - Max 1000 requests per tenant (prevents memory leaks)
// - TTL: 1 hour (3600000ms) - requests should be completed within this time
// - Cleanup interval: 5 minutes (300000ms)
const activeRequestsCache = new MultiTenantCacheManager<ActiveRequest>(
  1000, // Max 1000 requests per tenant
  3600000, // 1 hour TTL
  300000, // Cleanup every 5 minutes
);

// Cache for tenant ID resolution (slug -> UUID)
// Configuration:
// - Max 1000 entries (should cover all tenants)
// - TTL: 24 hours (86400000ms) - tenant data rarely changes
// - Cleanup interval: 1 hour (3600000ms)
const tenantIdCache = new CacheManager<string>(1000, 86400000, 3600000);

// Cache for table ID resolution (tenantId + tableNumber -> UUID)
// Configuration:
// - Max 5000 entries (covers many tables across tenants)
// - TTL: 24 hours (86400000ms) - table data rarely changes
// - Cleanup interval: 1 hour (3600000ms)
const tableIdCache = new CacheManager<string>(5000, 86400000, 3600000);

// Export cache for monitoring
export { activeRequestsCache };

export interface ActiveRequest {
  id: string;
  tenantId: string;
  tableId: string;
  type: string;
  status: string;
  timestamp: Date;
  customNote?: string;
  acknowledgedBy?: string;
}

/**
 * Initialize request handler with Socket.IO instance
 */
let io: SocketIOServer;

export function initializeRequestHandler(socketIO: SocketIOServer) {
  io = socketIO;
  logger.info('✅ Request handler initialized');
}

/**
 * Handle new service request
 * - Store in memory for real-time
 * - Save to database asynchronously
 * - Broadcast via Socket.IO
 */
export async function handleNewRequest(data: {
  tenantId: string;
  tableId: string;
  type: string;
  customNote?: string;
}): Promise<ActiveRequest> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // 1. Create request object
  const request: ActiveRequest = {
    id: requestId,
    tenantId: data.tenantId,
    tableId: data.tableId,
    type: data.type,
    status: 'pending',
    timestamp: new Date(),
    customNote: data.customNote,
  };

  // 2. Store in memory for real-time access with TTL
  // TTL: 1 hour (requests should be completed within this time)
  activeRequestsCache.set(data.tenantId, requestId, request, 3600000);

  // 3. Save to database (async, non-blocking)
  saveRequestToDatabase(request).catch((err) => {
    logger.error('❌ Failed to save request to DB:', err);
  });

  // 3.5. Trigger integrations (async, non-blocking)
  triggerIntegrations(request, data).catch((err) => {
    logger.error('❌ Failed to trigger integrations:', err);
  });

  // 4. Broadcast via Socket.IO
  if (io) {
    // Convert to frontend-compatible format before broadcasting
    const frontendRequest = {
      id: request.id,
      tenantId: request.tenantId,
      tableId: request.tableId,
      requestType: request.type, // Map 'type' to 'requestType'
      status: request.status,
      timestampCreated: request.timestamp, // Map 'timestamp' to 'timestampCreated'
      timestampAcknowledged: null,
      timestampCompleted: null,
      acknowledgedBy: request.acknowledgedBy || null,
      customNote: request.customNote || null,
      durationSeconds: null,
      createdAt: request.timestamp,
      updatedAt: request.timestamp,
    };

    logger.info('📡 Broadcasting new_request to waiter room:', `tenant-${data.tenantId}-waiter`);
    io.to(`tenant-${data.tenantId}-waiter`).emit('new_request', frontendRequest);

    logger.info(
      '📡 Broadcasting request_sent to table room:',
      `tenant-${data.tenantId}-table-${data.tableId}`,
    );
    io.to(`tenant-${data.tenantId}-table-${data.tableId}`).emit('request_sent', frontendRequest);
  }

  logger.info(`📝 New request created: ${requestId} for tenant ${data.tenantId}`);
  return request;
}

/**
 * Handle request acknowledgment
 * - Update in-memory state
 * - Update database asynchronously
 * - Broadcast update
 */
export async function handleAcknowledge(
  requestId: string,
  userId: string | null,
  tenantId: string,
): Promise<ActiveRequest | null> {
  // 1. Get from memory
  const request = activeRequestsCache.get(tenantId, requestId);

  if (!request) {
    logger.warn(`⚠️ Request ${requestId} not found in memory`);
    return null;
  }

  // 2. Update in-memory state
  request.status = 'acknowledged';
  request.acknowledgedBy = userId || undefined;
  
  // Update cache with new status (refresh TTL)
  activeRequestsCache.set(tenantId, requestId, request, 3600000);

  // 3. Update database (async)
  resolveTenantId(tenantId).then((tenantUuid) => {
    if (!tenantUuid) return;

    db.update(serviceRequests)
      .set({
        status: 'acknowledged',
        timestampAcknowledged: new Date(),
        acknowledgedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(serviceRequests.id, requestId), eq(serviceRequests.tenantId, tenantUuid)))
      .catch((err) => {
        logger.error('❌ Failed to update request in DB:', err);
      });
  });

  // 4. Broadcast update
  if (io) {
    // Convert to frontend-compatible format
    const frontendRequest = {
      id: request.id,
      tenantId: request.tenantId,
      tableId: request.tableId,
      requestType: request.type,
      status: 'acknowledged',
      timestampCreated: request.timestamp,
      timestampAcknowledged: new Date(),
      timestampCompleted: null,
      acknowledgedBy: request.acknowledgedBy || null,
      customNote: request.customNote || null,
      durationSeconds: null,
      createdAt: request.timestamp,
      updatedAt: new Date(),
    };

    io.to(`tenant-${tenantId}-waiter`).emit('request_updated', frontendRequest);
    io.to(`tenant-${tenantId}-table-${request.tableId}`).emit('request_status', frontendRequest);
  }

  logger.info(`✅ Request ${requestId} acknowledged by ${userId}`);
  return request;
}

/**
 * Handle request completion
 * - Update in-memory state
 * - Calculate duration and update database
 * - Broadcast completion
 * - Remove from memory after delay
 */
export async function handleComplete(
  requestId: string,
  tenantId: string,
): Promise<ActiveRequest | null> {
  // 1. Get from memory
  const request = activeRequestsCache.get(tenantId, requestId);

  if (!request) {
    logger.warn(`⚠️ Request ${requestId} not found in memory`);
    return null;
  }

  // 2. Update in-memory state
  request.status = 'completed';
  
  // Update cache with new status
  activeRequestsCache.set(tenantId, requestId, request, 3600000);

  // 3. Calculate duration and update database
  const durationSeconds = Math.floor((Date.now() - request.timestamp.getTime()) / 1000);

  resolveTenantId(tenantId).then((tenantUuid) => {
    if (!tenantUuid) return;

    db.update(serviceRequests)
      .set({
        status: 'completed',
        timestampCompleted: new Date(),
        durationSeconds,
        updatedAt: new Date(),
      })
      .where(and(eq(serviceRequests.id, requestId), eq(serviceRequests.tenantId, tenantUuid)))
      .catch((err) => {
        logger.error('❌ Failed to complete request in DB:', err);
      });
  });

  // 4. Broadcast completion
  if (io) {
    // Convert to frontend-compatible format
    const frontendRequest = {
      id: request.id,
      tenantId: request.tenantId,
      tableId: request.tableId,
      requestType: request.type,
      status: 'completed',
      timestampCreated: request.timestamp,
      timestampAcknowledged: null,
      timestampCompleted: new Date(),
      acknowledgedBy: request.acknowledgedBy || null,
      customNote: request.customNote || null,
      durationSeconds: durationSeconds,
      createdAt: request.timestamp,
      updatedAt: new Date(),
    };

    io.to(`tenant-${tenantId}-waiter`).emit('request_updated', frontendRequest);
    io.to(`tenant-${tenantId}-table-${request.tableId}`).emit('request_status', frontendRequest);
  }

  // 5. Remove from memory after 5 seconds (allow time for UI updates)
  setTimeout(() => {
    activeRequestsCache.delete(tenantId, requestId);
    logger.info(`🗑️ Request ${requestId} removed from memory`);
  }, 5000);

  logger.info(`✅ Request ${requestId} completed (${durationSeconds}s)`);
  return request;
}

/**
 * Handle request cancellation
 */
export async function handleCancel(
  requestId: string,
  tenantId: string,
): Promise<ActiveRequest | null> {
  const request = activeRequestsCache.get(tenantId, requestId);

  if (!request) {
    return null;
  }

  request.status = 'cancelled';

  // Update database
  resolveTenantId(tenantId).then((tenantUuid) => {
    if (!tenantUuid) return;

    db.update(serviceRequests)
      .set({
        status: 'cancelled',
        timestampCompleted: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(serviceRequests.id, requestId), eq(serviceRequests.tenantId, tenantUuid)))
      .catch((err) => {
        logger.error('❌ Failed to cancel request in DB:', err);
      });
  });

  // Broadcast cancellation
  if (io) {
    // Convert to frontend-compatible format
    const frontendRequest = {
      id: request.id,
      tenantId: request.tenantId,
      tableId: request.tableId,
      requestType: request.type,
      status: 'cancelled',
      timestampCreated: request.timestamp,
      timestampAcknowledged: null,
      timestampCompleted: new Date(),
      acknowledgedBy: request.acknowledgedBy || null,
      customNote: request.customNote || null,
      durationSeconds: null,
      createdAt: request.timestamp,
      updatedAt: new Date(),
    };

    io.to(`tenant-${tenantId}-waiter`).emit('request_updated', frontendRequest);
    io.to(`tenant-${tenantId}-table-${request.tableId}`).emit('request_status', frontendRequest);
  }

  // Remove from memory
  setTimeout(() => {
    activeRequestsCache.delete(tenantId, requestId);
  }, 3000);

  logger.info(`❌ Request ${requestId} cancelled`);
  return request;
}

/**
 * Get active requests for a tenant (from memory)
 */
export function getActiveRequests(tenantId: string): ActiveRequest[] {
  const cache = activeRequestsCache.getCache(tenantId);
  return cache.values();
}

/**
 * Get pending requests for a tenant (from memory)
 */
export function getPendingRequests(tenantId: string): ActiveRequest[] {
  return getActiveRequests(tenantId).filter((req) => req.status === 'pending');
}

/**
 * Get acknowledged requests for a tenant (from memory)
 */
export function getAcknowledgedRequests(tenantId: string): ActiveRequest[] {
  return getActiveRequests(tenantId).filter((req) => req.status === 'acknowledged');
}

/**
 * Load active requests from database on server restart
 * This restores in-memory state from persistent storage
 */
export async function loadActiveRequestsFromDB(tenantId: string): Promise<number> {
  try {
    // Resolve tenant UUID if slug provided
    const tenantUuid = await resolveTenantId(tenantId);
    if (!tenantUuid) return 0;

    const requests = await db
      .select({
        request: serviceRequests,
        tenantSlug: tenants.slug,
        tableNumber: tables.tableNumber,
      })
      .from(serviceRequests)
      .leftJoin(tenants, eq(serviceRequests.tenantId, tenants.id))
      .leftJoin(tables, eq(serviceRequests.tableId, tables.id))
      .where(
        and(
          eq(serviceRequests.tenantId, tenantUuid),
          inArray(serviceRequests.status, ['pending', 'acknowledged']),
        ),
      );

    requests.forEach((row) => {
      // tableId should be the UUID for proper reference
      // tableNumber is the display name (e.g., "T-01", "Table 5")
      const request: ActiveRequest = {
        id: row.request.id,
        tenantId: row.tenantSlug || row.request.tenantId,
        tableId: row.request.tableId, // Keep UUID as tableId
        type: row.request.requestType,
        status: row.request.status,
        timestamp: row.request.timestampCreated,
        customNote: row.request.customNote || undefined,
        acknowledgedBy: row.request.acknowledgedBy || undefined,
      };
      // Store with 1 hour TTL
      activeRequestsCache.set(tenantId, row.request.id, request, 3600000);
    });

    logger.info(`📥 Loaded ${requests.length} active requests for tenant ${tenantId}`);
    return requests.length;
  } catch (error) {
    logger.error(`❌ Failed to load active requests for tenant ${tenantId}:`, error);
    return 0;
  }
}

/**
 * Load active requests for all tenants on server startup
 */
export async function loadAllActiveRequests(): Promise<void> {
  try {
    const requests = await db
      .select({
        request: serviceRequests,
        tenantSlug: tenants.slug,
        tableNumber: tables.tableNumber,
      })
      .from(serviceRequests)
      .leftJoin(tenants, eq(serviceRequests.tenantId, tenants.id))
      .leftJoin(tables, eq(serviceRequests.tableId, tables.id))
      .where(inArray(serviceRequests.status, ['pending', 'acknowledged']));

    // Group by tenant (slug)
    const requestsByTenant = new Map<string, ActiveRequest[]>();

    requests.forEach((row) => {
      const tenantKey = row.tenantSlug || row.request.tenantId;

      if (!requestsByTenant.has(tenantKey)) {
        requestsByTenant.set(tenantKey, []);
      }

      const tenantRequests = requestsByTenant.get(tenantKey);
      if (tenantRequests) {
        tenantRequests.push({
          id: row.request.id,
          tenantId: tenantKey,
          tableId: row.request.tableId, // Keep UUID as tableId
          type: row.request.requestType,
          status: row.request.status,
          timestamp: row.request.timestampCreated,
          customNote: row.request.customNote || undefined,
          acknowledgedBy: row.request.acknowledgedBy || undefined,
        });
      }
    });

    // Populate cache
    requestsByTenant.forEach((requests, tenantId) => {
      requests.forEach((req) => {
        // Store with 1 hour TTL
        activeRequestsCache.set(tenantId, req.id, req, 3600000);
      });
    });

    logger.info(
      `📥 Loaded ${requests.length} active requests across ${requestsByTenant.size} tenants`,
    );
  } catch (error) {
    logger.error('❌ Failed to load active requests:', error);
  }
}

/**
 * Save request to database (internal helper)
 */
/**
 * Helper to resolve tenant ID (UUID) from slug or ID
 */
async function resolveTenantId(tenantIdOrSlug: string): Promise<string | null> {
  // Check cache first
  const cachedId = tenantIdCache.get(tenantIdOrSlug);
  if (cachedId) {
    return cachedId;
  }

  // Simple UUID regex check
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    tenantIdOrSlug,
  );
  if (isUuid) {
    tenantIdCache.set(tenantIdOrSlug, tenantIdOrSlug);
    return tenantIdOrSlug;
  }

  try {
    const result = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, tenantIdOrSlug))
      .limit(1);

    const tenantId = result.length > 0 ? result[0].id : null;
    if (tenantId) {
      tenantIdCache.set(tenantIdOrSlug, tenantId);
    }
    return tenantId;
  } catch (err) {
    logger.error('Error resolving tenant ID:', err);
    return null;
  }
}

/**
 * Helper to resolve table ID (UUID) from tableNumber or UUID
 * Now that tableId is always UUID, this mainly handles legacy formats
 */
async function resolveTableId(tableIdOrNumber: string, tenantId: string): Promise<string | null> {
  const cacheKey = `${tenantId}:${tableIdOrNumber}`;

  // Check cache first
  const cachedId = tableIdCache.get(cacheKey);
  if (cachedId) {
    return cachedId;
  }

  // Check if already a UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    tableIdOrNumber,
  );
  if (isUuid) {
    tableIdCache.set(cacheKey, tableIdOrNumber);
    return tableIdOrNumber;
  }

  // Not a UUID, treat as tableNumber - search by tableNumber field
  try {
    // Try exact match with tableNumber
    const result = await db
      .select({ id: tables.id })
      .from(tables)
      .where(and(eq(tables.tenantId, tenantId), eq(tables.tableNumber, tableIdOrNumber)))
      .limit(1);

    if (result.length > 0) {
      const tableUuid = result[0].id;
      tableIdCache.set(cacheKey, tableUuid);
      return tableUuid;
    }

    logger.warn(`⚠️ Table not found for tableNumber: ${tableIdOrNumber} in tenant: ${tenantId}`);
    return null;
  } catch (err) {
    logger.error('Error resolving table ID:', err);
    return null;
  }
}

/**
 * Save request to database (internal helper)
 */
async function saveRequestToDatabase(request: ActiveRequest): Promise<void> {
  const tenantUuid = await resolveTenantId(request.tenantId);
  if (!tenantUuid) {
    logger.error(`❌ Could not resolve tenant UUID for ${request.tenantId}`);
    return;
  }

  const tableUuid = await resolveTableId(request.tableId, tenantUuid);
  if (!tableUuid) {
    logger.error(`❌ Could not resolve table UUID for ${request.tableId} in tenant ${tenantUuid}`);
    return;
  }

  const newRequest: NewServiceRequest = {
    id: request.id,
    tenantId: tenantUuid,
    tableId: tableUuid,
    requestType: request.type,
    status: request.status,
    customNote: request.customNote || null,
    timestampCreated: request.timestamp,
  };

  await db.insert(serviceRequests).values(newRequest);
  logger.info(`💾 Request ${request.id} saved to database`);
}

/**
 * Trigger integrations (printer, speaker) for new request
 * Runs asynchronously and doesn't block request flow
 */
async function triggerIntegrations(
  request: ActiveRequest,
  requestData: { tenantId: string; tableId: string; type: string; customNote?: string },
): Promise<void> {
  try {
    // Resolve tenant UUID from subdomain
    const tenantUuid = await resolveTenantId(request.tenantId);
    if (!tenantUuid) {
      logger.warn(`Could not resolve tenant UUID for ${request.tenantId}, skipping integrations`);
      return;
    }

    // Get integration settings
    const integrationService = new IntegrationService();
    const integrations = await integrationService.getIntegrations(tenantUuid);

    // Get tenant info for printer header
    const [tenant] = await db
      .select({
        name: tenants.name,
        facebookUrl: tenants.facebookUrl,
        instagramUrl: tenants.instagramUrl,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantUuid))
      .limit(1);

    // Get table info
    const tableUuid = await resolveTableId(requestData.tableId, tenantUuid);
    let tableNumber = requestData.tableId;
    if (tableUuid) {
      const [table] = await db
        .select({ tableNumber: tables.tableNumber })
        .from(tables)
        .where(eq(tables.id, tableUuid))
        .limit(1);
      if (table) {
        tableNumber = table.tableNumber;
      }
    }

    // Get request type names from database (both English and Arabic)
    let requestTypeNameEn: string | undefined;
    let requestTypeNameAr: string | undefined;
    if (requestData.type.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const [requestType] = await db
        .select({
          nameEn: requestTypes.nameEn,
          nameAr: requestTypes.nameAr,
        })
        .from(requestTypes)
        .where(eq(requestTypes.id, requestData.type))
        .limit(1);
      if (requestType) {
        requestTypeNameEn = requestType.nameEn;
        requestTypeNameAr = requestType.nameAr;
      }
    }

    // Trigger printer if enabled and autoPrint is on
    // Printer is configured in PC Agent's .env file (PRINTER_IP, PRINTER_PORT)
    if (integrations.printer?.enabled && integrations.printer.autoPrint) {
      logger.debug(`Printing request for tenant ${tenantUuid}`, {
        tableNumber,
      });
      
      printerIntegration
        .printRequest(integrations.printer, {
          tableNumber,
          requestType: requestData.type,
          requestTypeNameEn,
          requestTypeNameAr,
          customNote: requestData.customNote,
          timestamp: request.timestamp,
          restaurantName: tenant?.name,
          restaurantAddress: tenant?.facebookUrl || undefined, // Can be used for address if needed
          restaurantPhone: tenant?.instagramUrl || undefined, // Can be used for phone if needed
        }, tenantUuid)
        .catch((err) => {
          logger.error('Error printing request:', err);
        });
    }

    // Trigger speaker alert if enabled
    if (integrations.speaker?.enabled) {
      speakerIntegration
        .triggerAlert(integrations.speaker)
        .catch((err) => {
          logger.error('Error triggering speaker alert:', err);
        });
    }
  } catch (error) {
    logger.error('Error in triggerIntegrations:', error);
    // Don't throw - integrations should not break the request flow
  }
}

/**
 * Preload tenant and table caches for better performance
 */
export async function preloadCaches(): Promise<void> {
  try {
    logger.info('🔄 Preloading caches...');

    // Load all tenants
    const tenantResults = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants);
    tenantResults.forEach((tenant) => {
      tenantIdCache.set(tenant.slug, tenant.id);
    });

    // Load all tables
    const tableResults = await db
      .select({
        id: tables.id,
        tenantId: tables.tenantId,
        tableNumber: tables.tableNumber,
      })
      .from(tables);

    tableResults.forEach((table) => {
      // Cache by tableNumber (e.g., "T-01", "Table 5")
      const cacheKey = `${table.tenantId}:${table.tableNumber}`;
      tableIdCache.set(cacheKey, table.id);

      // Also cache by UUID directly
      const uuidCacheKey = `${table.tenantId}:${table.id}`;
      tableIdCache.set(uuidCacheKey, table.id);
    });

    logger.info(
      `✅ Preloaded ${tenantResults.length} tenants and ${tableResults.length} tables into cache`,
    );
  } catch (error) {
    logger.error('❌ Failed to preload caches:', error);
  }
}
