import express from 'express';
import http from 'http';
import logger from '../utils/logger';
import { errorHandler, notFoundHandler } from '../middleware/error-handler';
import { config } from '../config/environment';

/**
 * Create and configure Express application
 */
export function createExpressApp(): express.Application {
  const app = express();
  
  // Trust proxy - CRITICAL for rate limiting to work correctly
  // This allows Express to correctly identify the client's real IP address
  // when behind a reverse proxy (nginx, load balancer, etc.)
  // Without this, all requests would appear to come from the proxy's IP
  if (config.nodeEnv === 'production') {
    // In production, trust the first proxy (nginx, load balancer)
    app.set('trust proxy', 1);
    logger.info('✅ Express configured to trust proxy for IP detection');
  } else {
    // In development, trust all proxies (for testing)
    app.set('trust proxy', true);
    logger.info('✅ Express configured to trust all proxies (development mode)');
  }
  
  return app;
}

/**
 * Create HTTP server with optimized settings for high concurrency
 */
export function createHTTPServer(app: express.Application): http.Server {
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

  logger.info('✅ HTTP server created with high concurrency settings');
  return server;
}

/**
 * Configure error handling middleware
 * IMPORTANT: Must be called LAST, after all routes
 */
export function configureErrorHandling(app: express.Application): void {
  // 404 handler - must come before error handler
  app.use(notFoundHandler);

  // Centralized error handler - must be last
  app.use(errorHandler);

  logger.info('✅ Error handling middleware configured');
}

