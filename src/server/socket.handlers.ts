import { Socket } from 'socket.io';
import logger from '../utils/logger';
import { verifyToken, JWTPayload } from '../utils/jwt';
import { extractSubdomain } from '../middleware/tenant';
import {
  CallWaiterData,
  ClientToServerEvents,
  ServerToClientEvents,
} from '../models/types';
import {
  handleNewRequest,
  handleAcknowledge,
  handleComplete,
  handleCancel,
} from '../handlers/requestHandler';

/**
 * Custom socket interface to include tenantSubdomain
 */
export interface CustomSocket extends Socket<ClientToServerEvents, ServerToClientEvents> {
  tenantSubdomain?: string;
  requestId?: string;
}

/**
 * Extract tenant subdomain from socket handshake
 * Priority: 1. auth.tenantSubdomain, 2. query.tenant, 3. origin/referer header
 */
export function extractTenantFromSocket(socket: CustomSocket): string | null {
  let tenantSubdomain: string | null = null;

  // First, try to get tenant from auth object (explicitly passed by client)
  if (socket.handshake.auth?.tenantSubdomain) {
    tenantSubdomain = socket.handshake.auth.tenantSubdomain;
    logger.info(`🔍 Using tenant from auth.tenantSubdomain: ${tenantSubdomain}`);
    return tenantSubdomain;
  }

  // Second, try query parameter
  if (socket.handshake.query?.tenant) {
    const queryTenant = socket.handshake.query.tenant;
    tenantSubdomain = Array.isArray(queryTenant) ? queryTenant[0] : queryTenant;
    logger.info(`🔍 Using tenant from query.tenant: ${tenantSubdomain}`);
    return tenantSubdomain;
  }

  // Third, try to extract from origin header (client's URL)
  let hostname = '';
  const originHeader = socket.handshake.headers.origin;
  if (originHeader) {
    try {
      const originUrl = Array.isArray(originHeader) ? originHeader[0] : originHeader;
      const url = new URL(originUrl);
      hostname = url.hostname;
    } catch {
      // Manual extraction if URL parsing fails
      const originStr = Array.isArray(originHeader) ? originHeader[0] : originHeader;
      if (originStr.includes('://')) {
        hostname = originStr.split('://')[1].split('/')[0].split(':')[0];
      }
    }
  }

  // Try referer header if origin is not available
  if (!hostname) {
    const refererHeader = socket.handshake.headers.referer;
    if (refererHeader) {
      try {
        const refererUrl = Array.isArray(refererHeader) ? refererHeader[0] : refererHeader;
        const url = new URL(refererUrl);
        hostname = url.hostname;
      } catch {
        const refererStr = Array.isArray(refererHeader) ? refererHeader[0] : refererHeader;
        if (refererStr.includes('://')) {
          hostname = refererStr.split('://')[1].split('/')[0].split(':')[0];
        }
      }
    }
  }

  // Remove port if present
  if (hostname?.includes(':')) {
    hostname = hostname.split(':')[0];
  }

  if (hostname) {
    const extracted = extractSubdomain(hostname);
    if (extracted) {
      tenantSubdomain = extracted;
      logger.info(`🔍 Extracted tenant from origin "${hostname}": ${tenantSubdomain}`);
      return tenantSubdomain;
    }
  }

  return null;
}

/**
 * Authenticate socket connection
 */
export function authenticateSocket(socket: CustomSocket): JWTPayload | null {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace('Bearer ', '');

  if (!token) {
    logger.info('Socket connection without authentication - allowing for customer requests');
    return null;
  }

  try {
    const payload = verifyToken(token);
    logger.info(`Authenticated user: ${payload.email} (${payload.role})`);
    return payload;
  } catch (error) {
    logger.info('Socket authentication failed:', error);

    // Send specific error message to client before disconnecting
    const errorMessage = error instanceof Error ? error.message : 'Unknown authentication error';
    let errorCode = 'TOKEN_INVALID';

    if (errorMessage.includes('expired')) {
      errorCode = 'TOKEN_EXPIRED';
    } else if (errorMessage.includes('malformed') || errorMessage.includes('invalid')) {
      errorCode = 'TOKEN_MALFORMED';
    }

    socket.emit('auth_error', {
      message: 'Authentication failed',
      code: errorCode,
      details: errorMessage,
    });
    socket.disconnect();
    return null;
  }
}

/**
 * Setup socket event handlers
 */
export function setupSocketHandlers(socket: CustomSocket, user: JWTPayload | null): void {
  const tenantSubdomain = socket.tenantSubdomain;
  if (!tenantSubdomain) {
    logger.error(`❌ Socket handlers setup failed: No tenant subdomain for socket ${socket.id}`);
    return;
  }

  // Join room handler
  socket.on('join', (room: string) => {
    // Allow joining table rooms for unauthenticated users (customers)
    // This allows customers to receive confirmations for their requests
    const isTableRoom = room.startsWith(`tenant-${tenantSubdomain}-table-`);

    if (!user && !isTableRoom) {
      socket.emit('error', 'Authentication required to join this room');
      return;
    }

    socket.join(room);
    logger.info(`Socket ${socket.id} joined room: ${room}`);
  });

  // Call waiter handler
  socket.on('call_waiter', async (data: CallWaiterData) => {
    logger.info(`📨 Server received call_waiter:`, data);
    try {
      // Always use tenantSubdomain extracted from connection (subdomain)
      // This ensures customers and waiters on the same subdomain can communicate
      const tenantId = tenantSubdomain;
      logger.info(`🏢 Using tenant ID: ${tenantId} (from subdomain)`);

      // Use hybrid handler (in-memory + database)
      // Convert tableId to string (handles both string UUID and number)
      const tableIdString = typeof data.tableId === 'string' ? data.tableId : data.tableId.toString();
      const newRequest = await handleNewRequest({
        tenantId: tenantId,
        tableId: tableIdString,
        type: data.type || 'call_waiter',
        customNote: data.customNote,
      });

      logger.info(
        `✅ New request from Table ${data.tableId}: ${newRequest.type}${newRequest.customNote ? ` - "${newRequest.customNote}"` : ''}`,
      );
      logger.info(
        '📡 Broadcasting to rooms:',
        `tenant-${tenantId}-waiter`,
        `tenant-${tenantId}-table-${data.tableId}`,
      );
    } catch (error) {
      logger.error('❌ Error handling call_waiter:', error);
    }
  });

  // Acknowledge request handler
  socket.on('acknowledge_request', async (requestId: string) => {
    // Only authenticated users can acknowledge requests
    if (!user) {
      socket.emit('error', 'Authentication required');
      return;
    }

    try {
      // Always use tenantSubdomain (from socket connection) instead of user.tenantId
      const socketTenantId = socket.tenantSubdomain || tenantSubdomain;
      logger.info(`🔔 Acknowledging request ${requestId} for tenant: ${socketTenantId}`);
      await handleAcknowledge(requestId, user.userId, socketTenantId);

      logger.info(
        `✅ Request ${requestId} acknowledged by ${user.email} for tenant ${socketTenantId}`,
      );
    } catch (error) {
      logger.error('❌ Error handling acknowledge_request:', error);
      socket.emit('error', 'Failed to acknowledge request');
    }
  });

  // Complete request handler
  socket.on('complete_request', async (requestId: string) => {
    // Allow both authenticated users (waiters) and unauthenticated users (customers) to complete requests
    try {
      const socketTenantId = socket.tenantSubdomain || tenantSubdomain;
      logger.info(
        `✅ Completing request ${requestId} for tenant: ${socketTenantId} (by ${user ? user.email : 'customer'})`,
      );
      await handleComplete(requestId, socketTenantId);

      logger.info(`✅ Request ${requestId} completed for tenant ${socketTenantId}`);
    } catch (error) {
      logger.error('❌ Error handling complete_request:', error);
      socket.emit('error', 'Failed to complete request');
    }
  });

  // Cancel request handler
  socket.on('cancel_request', async (requestId: string) => {
    // Allow both authenticated users (waiters) and unauthenticated users (customers) to cancel requests
    try {
      const socketTenantId = socket.tenantSubdomain || tenantSubdomain;
      logger.info(
        `❌ Cancelling request ${requestId} for tenant: ${socketTenantId} (by ${user ? user.email : 'customer'})`,
      );
      await handleCancel(requestId, socketTenantId);

      logger.info(`✅ Request ${requestId} cancelled for tenant ${socketTenantId}`);
    } catch (error) {
      logger.error('❌ Error handling cancel_request:', error);
      socket.emit('error', 'Failed to cancel request');
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    logger.info('User disconnected:', socket.id);
  });
}

