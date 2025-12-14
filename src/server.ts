import 'dotenv/config'; // Load env vars before other imports
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config/environment';
import licenseService from './services/license.service';
import {
  initializeRequestHandler,
  handleNewRequest,
  handleAcknowledge,
  handleComplete,
  handleCancel,
  getActiveRequests,
  loadAllActiveRequests,
  preloadCaches,
} from './handlers/requestHandler';
import {
  CallWaiterData,
  ClientToServerEvents,
  ServerToClientEvents,
} from './models/types';
import { type TenantRequest, extractSubdomain, extractTenant } from './middleware/tenant';
import { licenseCheckMiddleware } from './middleware/license';
import { status } from "http-status";
// Extend Request interface to include requestId
// Using interface augmentation instead of namespace
declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

// Custom socket interface to include tenantSubdomain
interface CustomSocket extends Socket<ClientToServerEvents, ServerToClientEvents> {
  tenantSubdomain?: string;
  requestId?: string;
}

// Import logger
import logger from './utils/logger';

// Import utilities
import { verifyToken, JWTPayload } from './utils/jwt';

// Import routes
import authRoutes from './routes/auth.routes';
import superadminRoutes from './routes/superadmin.routes';
import tenantRoutes from './routes/tenant.routes';
import userRoutes from './routes/user.routes';
import tableRoutes from './routes/table.routes';
import serviceRequestRoutes from './routes/service-request.routes';
import brandingRoutes from './routes/branding.routes';
import requestTypeRoutes from './routes/request-type.routes';
import integrationsRoutes from './routes/integrations.routes';

// Import services
import { AnalyticsService } from './services/analytics.service';

const app = express();
const server = http.createServer(app);

// Optimize HTTP server for high concurrency
// No connection limit - system can handle unlimited connections
server.maxConnections = Infinity;

// Increase keep-alive timeout for long-lived connections (sockets)
// Default is 5 seconds, increase to 65 seconds (just below common load balancer timeout of 70s)
server.keepAliveTimeout = 65000; // 65 seconds
server.headersTimeout = 66000; // Must be greater than keepAliveTimeout

// Note: Node.js default maxConnections is Infinity, but we set it explicitly for clarity
// The system is configured to handle unlimited concurrent socket connections

// Security: Rate limiting
// General API rate limiter - 100 requests per 15 minutes per IP
// Note: Rate limiting does NOT apply to Socket.IO connections (they use WebSocket/polling)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip Socket.IO endpoints - they should not be rate limited
  skip: (req) => {
    // Skip rate limiting for Socket.IO handshake and polling requests
    return req.path.startsWith('/socket.io/');
  },
});

// Stricter rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Security: Helmet.js for security headers
// Configure Helmet with appropriate settings for the application
// CSP is more permissive in development to allow localhost connections
const isDevelopment = config.nodeEnv !== 'production';

app.use(
  helmet({
    // Content Security Policy - adjust based on your needs
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Angular Material needs this
          'https://fonts.googleapis.com', // Google Fonts
        ],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Angular needs this for inline scripts
          "'unsafe-eval'", // Angular needs this for dynamic code evaluation
        ],
        imgSrc: ["'self'", 'data:', 'https:'], // Allow images from any HTTPS source
        connectSrc: [
          "'self'",
          'ws:', // WebSocket
          'wss:', // Secure WebSocket
          // Allow localhost connections in development
          ...(isDevelopment ? ['http://localhost:*', 'http://127.0.0.1:*', 'http://localhost:3000', 'http://localhost:4200', 'http://localhost:8080'] : []),
        ],
        fontSrc: [
          "'self'",
          'data:',
          'https://fonts.gstatic.com', // Google Fonts
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: config.nodeEnv === 'production' ? [] : null, // Only in production
      },
    },
    // Cross-Origin Embedder Policy - disabled for Socket.IO compatibility
    crossOriginEmbedderPolicy: false,
    // Cross-Origin Resource Policy - allow cross-origin resources
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // HSTS (HTTP Strict Transport Security) - only in production
    hsts: config.nodeEnv === 'production'
      ? {
          maxAge: 31536000, // 1 year
          includeSubDomains: true,
          preload: true,
        }
      : false,
  }),
);

// Middleware
// CORS configuration - restrict origins in production, allow localhost in development
const getCorsOrigin = (): boolean | string | string[] | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void) => {
  // In development, allow all origins (including localhost)
  if (isDevelopment) {
    return true; // Allow all origins in development
  }

  // In production, use configured origins
  if (config.corsOrigin === '*') {
    return true;
  }

  // Return array of allowed origins
  return config.corsOrigin.split(',').map((o) => o.trim());
};

// CORS header constants
const REQUEST_ID_HEADER = 'X-Request-ID';
const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Tenant-Subdomain',
  REQUEST_ID_HEADER,
  'X-Tenant-Slug',
];

const corsOptions = {
  origin: getCorsOrigin(),
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: CORS_ALLOWED_HEADERS,
  exposedHeaders: [REQUEST_ID_HEADER],
};
app.use(cors(corsOptions));

// Request ID tracking middleware
// Generate unique request ID for each request to enable request tracing
app.use((req: Request, res: Response, next: NextFunction) => {
  // Use existing request ID from header if present (for distributed tracing)
  // Otherwise generate new UUID
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  
  // Attach request ID to request object
  req.requestId = requestId;
  
  // Add request ID to response headers for client tracking
  res.setHeader(REQUEST_ID_HEADER, requestId);
  
  // Log request start with request ID
  logger.info('Request started', {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  
  next();
});

// Body parser with size limits to prevent DoS attacks
app.use(express.json({ limit: '10mb' })); // Limit JSON payload to 10MB
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Limit URL-encoded payload to 10MB

// Apply general rate limiting to all API routes
// Socket.IO connections are excluded from rate limiting (handled in skip function)
app.use('/api', apiLimiter);

// HTTP request logging with Morgan
// Use 'combined' format in production, 'dev' format in development
// Include request ID in log format
const morganFormat = config.nodeEnv === 'production' ? 'combined' : 'dev';
morgan.token('request-id', (req: Request) => req.requestId || 'unknown');
app.use(
  morgan(`${morganFormat} :request-id`, {
    // Stream logs to winston logger instead of console
    stream: {
      write: (message: string) => {
        logger.info(message.trim());
      },
    },
  }),
);

// Socket.IO with typed events
// Optimized for high concurrency - no connection limits
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    // In development, allow all origins (including localhost)
    // In production, use configured CORS origin
    origin: isDevelopment ? true : (config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((o) => o.trim())),
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
  // No maxHttpBufferSize limit (removed to allow larger messages if needed)
  // No connection limit - system can handle unlimited connections
});

// Initialize hybrid request handler with Socket.IO
initializeRequestHandler(io);

// Preload caches and load active requests (non-blocking)
setImmediate(async () => {
  await preloadCaches();

  loadAllActiveRequests()
    .then(() => {
      logger.info('✅ Active requests loaded from database');
    })
    .catch((err) => {
      logger.error('❌ Failed to load active requests:', err);
    });
});

// Socket.IO event handlers
io.on('connection', (socket: CustomSocket) => {
  logger.info(`User connected: ${socket.id}`);

  // Extract tenant from socket handshake - STRICT: no fallbacks
  // Priority: 1. auth.tenantSubdomain (explicitly passed), 2. query.tenant, 3. origin header
  let tenantSubdomain: string | null = null;

  // First, try to get tenant from auth object (explicitly passed by client)
  if (socket.handshake.auth?.tenantSubdomain) {
    tenantSubdomain = socket.handshake.auth.tenantSubdomain;
    logger.info(`🔍 Using tenant from auth.tenantSubdomain: ${tenantSubdomain}`);
  }
  // Second, try query parameter
  else if (socket.handshake.query?.tenant) {
    const queryTenant = socket.handshake.query.tenant;
    tenantSubdomain = Array.isArray(queryTenant) ? queryTenant[0] : queryTenant;
    logger.info(`🔍 Using tenant from query.tenant: ${tenantSubdomain}`);
  }
  // Third, try to extract from origin header (client's URL)
  else {
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
      }
    }
  }

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
  (socket as Socket & { tenantSubdomain: string }).tenantSubdomain = tenantSubdomain;

  // Authenticate socket connection
  const token =
    socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
  let user: JWTPayload | null = null;

  if (token) {
    try {
      const payload = verifyToken(token);
      user = payload;
      logger.info(`Authenticated user: ${user.email} (${user.role})`);
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
      return;
    }
  } else {
    logger.info('Socket connection without authentication - allowing for customer requests');
  }

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

  socket.on('call_waiter', async (data: CallWaiterData) => {
    logger.info(`📨 Server received call_waiter:`, data);
    try {
      // Always use tenantSubdomain extracted from connection (subdomain)
      // This ensures customers and waiters on the same subdomain can communicate
      // Even if user is authenticated, we use subdomain for room names to ensure consistency
      const tenantId = tenantSubdomain;
      logger.info(`🏢 Using tenant ID: ${tenantId} (from subdomain)`);

      // Use hybrid handler (in-memory + database)
      const newRequest = await handleNewRequest({
        tenantId: tenantId,
        tableId: data.tableId.toString(),
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

  socket.on('acknowledge_request', async (requestId: string) => {
    // Only authenticated users can acknowledge requests
    if (!user) {
      socket.emit('error', 'Authentication required');
      return;
    }

    try {
      // Always use tenantSubdomain (from socket connection) instead of user.tenantId
      // This ensures we use the same tenant identifier as when the request was created
      // Requests are stored with subdomain (e.g., "a"), not UUID
      // Get from socket storage to ensure consistency
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

  socket.on('complete_request', async (requestId: string) => {
    // Allow both authenticated users (waiters) and unauthenticated users (customers) to complete requests
    // Customers can complete their own requests

    try {
      // Always use tenantSubdomain (from socket connection) instead of user.tenantId
      // This ensures we use the same tenant identifier as when the request was created
      // Get from socket storage to ensure consistency
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

  socket.on('cancel_request', async (requestId: string) => {
    // Allow both authenticated users (waiters) and unauthenticated users (customers) to cancel requests
    // Customers can cancel their own requests

    try {
      // Always use tenantSubdomain (from socket connection)
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

  socket.on('disconnect', () => {
    logger.info('User disconnected:', socket.id);
  });
});

// Health check endpoint
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const licenseStatus = licenseService.getLicenseStatus();
    const isLicenseValid = await licenseService.validateLicense();

    res.json({
      status: isLicenseValid ? 'ok' : 'license_disabled',
      license: licenseStatus,
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(status.BAD_GATEWAY).json({
      status: 'error',
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  }
});

// Monitoring endpoints for system health and performance
// Database connection pool monitoring
app.get('/api/health/db-pool', async (req: Request, res: Response) => {
  try {
    const pool = (await import('./database/db')).pool;
    const poolStats = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
      requestId: req.requestId,
    };
    
    logger.info('Database pool stats', { ...poolStats, requestId: req.requestId });
    res.json(poolStats);
  } catch (error) {
    logger.error('Error getting database pool stats', { error, requestId: req.requestId });
    res.status(status.INTERNAL_SERVER_ERROR).json({ 
      error: 'Failed to get database pool stats',
      requestId: req.requestId,
    });
  }
});

// Socket.IO connection monitoring
app.get('/api/health/sockets', (req: Request, res: Response) => {
  try {
    const connectedClients = io.engine.clientsCount;
    const rooms = Array.from(io.sockets.adapter.rooms.keys());
    const sockets = Array.from(io.sockets.sockets.keys());
    
    const socketStats = {
      connectedClients,
      totalRooms: rooms.length,
      totalSockets: sockets.length,
      rooms: rooms.slice(0, 100), // Limit to first 100 rooms for response size
      requestId: req.requestId,
    };
    
    logger.info('Socket.IO stats', { ...socketStats, requestId: req.requestId });
    res.json(socketStats);
  } catch (error) {
    logger.error('Error getting Socket.IO stats', { error, requestId: req.requestId });
    res.status(status.INTERNAL_SERVER_ERROR).json({ 
      error: 'Failed to get Socket.IO stats',
      requestId: req.requestId,
    });
  }
});

// System metrics monitoring
app.get('/api/health/system', async (req: Request, res: Response) => {
  try {
    const os = await import('os');
    const processModule = await import('process');
    
    const systemStats = {
      uptime: {
        process: processModule.default.uptime(), // Process uptime in seconds
        system: os.default.uptime(), // System uptime in seconds
      },
      memory: {
        process: {
          used: Math.round(processModule.default.memoryUsage().heapUsed / 1024 / 1024), // MB
          total: Math.round(processModule.default.memoryUsage().heapTotal / 1024 / 1024), // MB
          external: Math.round(processModule.default.memoryUsage().external / 1024 / 1024), // MB
          rss: Math.round(processModule.default.memoryUsage().rss / 1024 / 1024), // MB
        },
        system: {
          total: Math.round(os.default.totalmem() / 1024 / 1024), // MB
          free: Math.round(os.default.freemem() / 1024 / 1024), // MB
          used: Math.round((os.default.totalmem() - os.default.freemem()) / 1024 / 1024), // MB
        },
      },
      cpu: {
        count: os.default.cpus().length,
        model: os.default.cpus()[0]?.model || 'unknown',
      },
      platform: {
        type: os.default.type(),
        platform: os.default.platform(),
        arch: os.default.arch(),
        release: os.default.release(),
      },
      nodeVersion: processModule.default.version,
      requestId: req.requestId,
    };
    
    logger.info('System stats', { requestId: req.requestId });
    res.json(systemStats);
  } catch (error) {
    logger.error('Error getting system stats', { error, requestId: req.requestId });
    res.status(status.INTERNAL_SERVER_ERROR).json({ 
      error: 'Failed to get system stats',
      requestId: req.requestId,
    });
  }
});

// Comprehensive health check (all systems)
app.get('/api/health/comprehensive', async (req: Request, res: Response) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      requestId: req.requestId,
      services: {
        database: { status: 'unknown' as string },
        redis: { status: 'unknown' as string },
        socketIO: { status: 'ok' as string },
        license: { status: 'unknown' as string },
      },
    };
    
    // Check database
    try {
      const pool = (await import('./database/db')).pool;
      await pool.query('SELECT 1');
      health.services.database = {
        status: 'ok',
        pool: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        },
      } as { status: string; pool: { total: number; idle: number; waiting: number } };
    } catch (error) {
      health.services.database = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      } as { status: string; error: string };
      health.status = 'degraded';
    }
    
    // Check Redis (if Redis client is available)
    try {
      // Note: Redis check would require Redis client setup
      // For now, we'll skip this or implement if Redis client is available
      health.services.redis = { status: 'not_configured' };
    } catch (error) {
      health.services.redis = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      } as { status: string; error: string };
    }
    
    // Check license status
    try {
      const licenseStatus = licenseService.getLicenseStatus();
      health.services.license = licenseStatus;
      if (licenseStatus.status !== 'active') {
        health.status = 'degraded';
      }
    } catch (error) {
      health.services.license = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      } as { status: string; error: string };
      health.status = 'degraded';
    }
    
    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Error in comprehensive health check', { error, requestId: req.requestId });
    res.status(status.INTERNAL_SERVER_ERROR).json({
      status: 'error',
      error: 'Health check failed',
      requestId: req.requestId,
    });
  }
});

// Auth routes (no tenant extraction needed) - with stricter rate limiting
app.use('/api/auth', authLimiter, licenseCheckMiddleware, authRoutes);

// Superadmin routes (no tenant extraction, authentication handled in routes)
app.use('/api/superadmin', licenseCheckMiddleware, superadminRoutes);

// Tenant-scoped routes
// Note: tenant branding is public (no auth required), but other routes need auth
app.use('/api/tenants', licenseCheckMiddleware, tenantRoutes); // Moved extractTenant inside routes for flexibility
app.use('/api/users', licenseCheckMiddleware, extractTenant, userRoutes);
app.use('/api/tables', licenseCheckMiddleware, extractTenant, tableRoutes);
app.use('/api/service-requests', licenseCheckMiddleware, extractTenant, serviceRequestRoutes);
app.use('/api/branding', licenseCheckMiddleware, extractTenant, brandingRoutes);
app.use('/api/request-types', licenseCheckMiddleware, requestTypeRoutes);
app.use('/api/integrations', licenseCheckMiddleware, extractTenant, integrationsRoutes);

// New endpoint to get active requests from database
// Extract tenant from subdomain to ensure proper isolation - STRICT: no fallbacks
app.get('/api/requests/active-db', licenseCheckMiddleware, async (req: Request, res: Response) => {
  try {
    // Extract tenant subdomain from multiple sources - STRICT: no fallbacks
    // Priority: 1. X-Tenant-Subdomain header (from frontend), 2. hostname
    const tenantHeader = req.headers['x-tenant-subdomain'] as string;
    const hostname = req.hostname;

    const tenantSubdomain: string | null = tenantHeader || extractSubdomain(hostname) || null;

    // STRICT: Return error if no tenant found
    if (!tenantSubdomain) {
      logger.error(
        `❌ Request rejected: No tenant subdomain found (header: ${tenantHeader}, hostname: ${hostname})`,
      );
      return res.status(status.BAD_REQUEST).json({
        error: 'Tenant subdomain is required',
        message:
          'Please access via subdomain (e.g., a.localhost:4200) or provide X-Tenant-Subdomain header',
      });
    }

    logger.info(
      `📥 Getting active requests for tenant: ${tenantSubdomain} (from ${tenantHeader ? 'header' : `hostname: ${hostname}`})`,
    );

    const activeRequests = getActiveRequests(tenantSubdomain);
    logger.info(`📦 Found ${activeRequests.length} active requests for tenant ${tenantSubdomain}`);

    // Convert to frontend-compatible format
    // Frontend expects: requestType, timestampCreated (not type, timestamp)
    const frontendRequests = activeRequests.map((req) => ({
      id: req.id,
      tenantId: req.tenantId,
      tableId: req.tableId, // This is already normalized to number/string
      requestType: req.type, // Map 'type' to 'requestType' for frontend
      status: req.status,
      timestampCreated: req.timestamp, // Map 'timestamp' to 'timestampCreated' for frontend
      timestampAcknowledged: null,
      timestampCompleted: null,
      acknowledgedBy: req.acknowledgedBy || null,
      customNote: req.customNote || null,
      durationSeconds: null,
      createdAt: req.timestamp,
      updatedAt: req.timestamp,
    }));

    logger.info(`📤 Sending ${frontendRequests.length} requests to frontend`);
    res.json(frontendRequests);
  } catch (error) {
    logger.error('Error getting active requests from DB:', error);
    res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get active requests' });
  }
});

// Analytics endpoint (requires tenant context)
app.get('/api/analytics/summary', licenseCheckMiddleware, extractTenant, async (req: TenantRequest, res: Response) => {
  try {
    if (!req.tenantId) {
      return res.status(status.BAD_REQUEST).json({ error: 'Tenant context required' });
    }

    const analyticsService = new AnalyticsService();
    const analytics = await analyticsService.getAnalyticsSummary(req.tenantId);

    res.json(analytics);
  } catch (error) {
    logger.error('Error getting analytics:', error);
    res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get analytics' });
  }
});

// Analytics chart data endpoint
app.get('/api/analytics/charts', licenseCheckMiddleware, extractTenant, async (req: TenantRequest, res: Response) => {
  try {
    if (!req.tenantId) {
      return res.status(status.BAD_REQUEST).json({ error: 'Tenant context required' });
    }

    const analyticsService = new AnalyticsService();
    const chartData = await analyticsService.getChartData(req.tenantId);

    res.json(chartData);
  } catch (error) {
    logger.error('Error getting chart data:', error);
    res.status(500).json({ error: 'Failed to get chart data' });
  }
});

// Real-time analytics endpoint
app.get('/api/analytics/realtime', licenseCheckMiddleware, extractTenant, async (req: TenantRequest, res: Response) => {
  try {
    if (!req.tenantId) {
      return res.status(status.BAD_REQUEST).json({ error: 'Tenant context required' });
    }

    const analyticsService = new AnalyticsService();
    const realtimeData = await analyticsService.getRealtimeAnalytics(req.tenantId);

    res.json(realtimeData);
  } catch (error) {
    logger.error('Error getting realtime analytics:', error);
    res.status(status.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get realtime analytics' });
  }
});

// Error handling middleware
// Note: Error handling middleware must have 4 parameters (err, req, res, next)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Error:', {
    error: err.message,
    stack: err.stack,
    requestId: req.requestId,
    path: req.path,
    method: req.method,
  });
  res.status(status.INTERNAL_SERVER_ERROR).json({
    error: 'Internal Server Error',
    message: config.nodeEnv === 'development' ? err.message : undefined,
    requestId: req.requestId,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  logger.warn('404 Not Found', {
    requestId: req.requestId,
    path: req.path,
    method: req.method,
  });
  res.status(status.NOT_FOUND).json({ 
    error: 'Not Found',
    requestId: req.requestId,
  });
});

// Start server
const port = Number(config.port);
const host = config.host;

logger.info('🚀 Starting server...');

server.listen(port, host, () => {
  logger.info(`🚀 Server is running on ${host}:${port}`);
  logger.info(`📡 Environment: ${config.nodeEnv}`);
  logger.info(`🔌 Socket.IO ready for connections`);
  if (host === '0.0.0.0') {
    logger.info(`🌐 Network access enabled - accessible from all network interfaces`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
