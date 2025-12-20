import express from 'express';
import http from 'http';
import { status } from 'http-status';
import logger from '../utils/logger';
import { config } from '../config/environment';

/**
 * Create and configure Express application
 */
export function createExpressApp(): express.Application {
  const app = express();
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
 */
export function configureErrorHandling(app: express.Application): void {
  // Error handling middleware
  // Note: Error handling middleware must have 4 parameters (err, req, res, next)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
  app.use((req: express.Request, res: express.Response) => {
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
}

