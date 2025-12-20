import { Server } from 'socket.io';
import { Server as HTTPServer } from 'http';
import logger from '../utils/logger';
import { config } from '../config/environment';
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../models/types';
import { CustomSocket, extractTenantFromSocket, authenticateSocket, setupSocketHandlers } from './socket.handlers';
import { initializeRequestHandler } from '../handlers/requestHandler';
import { setupPcAgentNamespace } from './pc-agent.handlers';

/**
 * Configure Socket.IO server with optimized settings for high concurrency
 * Optimized for millions of concurrent connections
 */
export function createSocketIOServer(server: HTTPServer): Server<ClientToServerEvents, ServerToClientEvents> {
  const isDevelopment = config.nodeEnv !== 'production';

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    // Custom path for Socket.IO (default is '/socket.io')
    // In production, if reverse proxy strips path prefix, this should be default
    // If reverse proxy keeps path prefix, set via environment variable
    path: process.env.SOCKET_IO_PATH || '/socket.io',
    cors: {
      // In development, allow all origins (including localhost)
      // In production, use configured CORS origin
      origin: isDevelopment
        ? true
        : config.corsOrigin === '*'
        ? true
        : config.corsOrigin.split(',').map((o) => o.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Connection settings optimized for high concurrency
    pingTimeout: 60000, // 60 seconds - time to wait for pong response
    pingInterval: 25000, // 25 seconds - how often to ping clients
    upgradeTimeout: 30000, // 30 seconds - timeout for HTTP upgrade to WebSocket
    maxHttpBufferSize: 1e6, // 1MB - maximum size of HTTP message buffer
    allowEIO3: true, // Allow Engine.IO v3 clients for backward compatibility

    // Transport options
    transports: ['websocket', 'polling'], // Allow both WebSocket and polling
    allowUpgrades: true, // Allow transport upgrades

    // Performance optimizations
    perMessageDeflate: {
      threshold: 1024, // Only compress messages larger than 1KB
      zlibDeflateOptions: {
        chunkSize: 16 * 1024, // 16KB chunks
      },
      zlibInflateOptions: {
        chunkSize: 16 * 1024,
      },
      concurrencyLimit: 10, // Limit concurrent compression operations
    },

    // Connection management
    connectTimeout: 45000, // 45 seconds - timeout for connection handshake
    // No connection limit - system can handle unlimited connections
  });

  // Initialize request handler with Socket.IO
  initializeRequestHandler(io);

  // Setup PC Agent namespace for reverse connections
  setupPcAgentNamespace(io);

  // Socket.IO connection handler
  io.on('connection', (socket: CustomSocket) => {
    logger.info(`User connected: ${socket.id}`);

    // Extract tenant from socket handshake - STRICT: no fallbacks
    const tenantSubdomain = extractTenantFromSocket(socket);

    // STRICT: Reject connection if no tenant found
    if (!tenantSubdomain) {
      logger.error(
        `❌ Socket connection rejected: No tenant subdomain found for socket ${socket.id}`,
      );
      socket.emit(
        'error',
        'Tenant subdomain is required. Please access via subdomain (e.g., a.localhost:4200)',
      );
      socket.disconnect();
      return;
    }

    logger.info(`🔍 Final tenant subdomain for socket ${socket.id}: ${tenantSubdomain}`);

    // Store tenantSubdomain on socket for use in event handlers
    // This ensures all handlers use the same tenant identifier
    socket.tenantSubdomain = tenantSubdomain;

    // Authenticate socket connection
    const user = authenticateSocket(socket);
    if (user === null && socket.connected) {
      // Authentication failed but socket might still be connected (for customer requests)
      // Continue with null user
    }

    // Setup event handlers
    setupSocketHandlers(socket, user || null);
  });

  logger.info('✅ Socket.IO server configured');
  return io;
}

