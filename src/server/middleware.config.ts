import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/environment';
import logger from '../utils/logger';

// Extend Request interface to include requestId
declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

// CORS header constants
const REQUEST_ID_HEADER = 'X-Request-ID';
const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Tenant-Subdomain',
  REQUEST_ID_HEADER,
  'X-Tenant-Slug',
];

/**
 * Get CORS origin configuration
 */
function getCorsOrigin(): boolean | string | string[] {
  const isDevelopment = config.nodeEnv !== 'production';

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
}

/**
 * Configure and apply all Express middleware
 */
export function configureMiddleware(app: express.Application): void {
  const isDevelopment = config.nodeEnv !== 'production';

  // Security: Helmet.js for security headers
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
            ...(isDevelopment
              ? [
                  'http://localhost:*',
                  'http://127.0.0.1:*',
                  'http://localhost:3000',
                  'http://localhost:4200',
                  'http://localhost:8080',
                ]
              : []),
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
      hsts:
        config.nodeEnv === 'production'
          ? {
              maxAge: 31536000, // 1 year
              includeSubDomains: true,
              preload: true,
            }
          : false,
    }),
  );

  // CORS configuration
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
}

/**
 * Create rate limiters
 */
export function createRateLimiters() {
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

  return { apiLimiter, authLimiter };
}

