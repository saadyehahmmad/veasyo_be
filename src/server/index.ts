import 'dotenv/config'; // Load env vars before other imports
import logger from '../utils/logger';
import { config } from '../config/environment';
import { createExpressApp, createHTTPServer, configureErrorHandling } from './app.config';
import { configureMiddleware, createRateLimiters } from './middleware.config';
import { createSocketIOServer } from './socket.config';
import { configureRoutes } from './routes.config';
import { configureHealthChecks } from './health.config';
import { configureMetrics } from './metrics.config';
import { redisService } from './redis.service';
import { loadAllActiveRequests, preloadCaches } from '../handlers/requestHandler';

/**
 * Main server initialization and startup
 * Orchestrates all modules for scalable, reliable operation
 */
async function startServer(): Promise<void> {
  try {
    logger.info('🚀 Starting server initialization...');

    // 1. Create Express app
    const app = createExpressApp();

    // 2. Create HTTP server with optimized settings
    const server = createHTTPServer(app);

    // 3. Configure middleware (security, CORS, logging, etc.)
    configureMiddleware(app);

    // 4. Create rate limiters
    const { apiLimiter, authLimiter } = createRateLimiters();

    // 5. Setup Redis pub/sub for horizontal scaling
    logger.info('📡 Connecting to Redis...');
    const redisConnected = await redisService.connect();

    // 6. Create Socket.IO server
    const io = createSocketIOServer(server);

    // 7. Setup Redis adapter for Socket.IO (if Redis is available)
    if (redisConnected) {
      await redisService.setupSocketIOAdapter(io);
    } else {
      logger.warn('⚠️  Running without Redis adapter - single instance mode');
    }

    // 8. Preload caches and load active requests (non-blocking)
    setImmediate(async () => {
      try {
        await preloadCaches();
        await loadAllActiveRequests();
        logger.info('✅ Active requests loaded from database');
      } catch (err) {
        logger.error('❌ Failed to load active requests:', err);
      }
    });

    // 9. Configure Prometheus metrics
    configureMetrics(app, io);

    // 10. Configure health check endpoints
    configureHealthChecks(app, io);

    // 11. Configure routes
    configureRoutes(app, apiLimiter, authLimiter);

    // 12. Configure error handling (must be last)
    configureErrorHandling(app);

    // 13. Start server
    const port = Number(config.port);
    const host = config.host;

    server.listen(port, host, () => {
      logger.info(`🚀 Server is running on ${host}:${port}`);
      logger.info(`📡 Environment: ${config.nodeEnv}`);
      logger.info(`🔌 Socket.IO ready for connections`);
      if (host === '0.0.0.0') {
        logger.info(`🌐 Network access enabled - accessible from all network interfaces`);
      }
      if (redisConnected) {
        logger.info(`✅ Redis pub/sub enabled for horizontal scaling`);
      }
    });

    // 14. Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      
      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');

        // Disconnect Redis
        await redisService.disconnect();

        // Close Socket.IO
        io.close(() => {
          logger.info('Socket.IO server closed');
          process.exit(0);
        });
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

