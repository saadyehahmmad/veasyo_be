import express, { Request, Response } from 'express';
import { status } from 'http-status';
import { Server } from 'socket.io';
import logger from '../utils/logger';
import licenseService from '../services/license.service';
import { redisService } from './redis.service';
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../models/types';
import { activeRequestsCache } from '../handlers/requestHandler';

/**
 * Configure health check and monitoring endpoints
 */
export function configureHealthChecks(
  app: express.Application,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): void {
  // Database connection pool monitoring with alerts
  app.get('/api/health/db-pool', async (req: Request, res: Response) => {
    try {
      const pool = (await import('../database/db')).pool;
      const totalCount = pool.totalCount;
      const idleCount = pool.idleCount;
      const waitingCount = pool.waitingCount;
      const activeCount = totalCount - idleCount;
      const utilizationPercent = totalCount > 0 ? (activeCount / totalCount) * 100 : 0;
      
      const poolStats = {
        totalCount,
        idleCount,
        activeCount,
        waitingCount,
        utilizationPercent: Math.round(utilizationPercent * 100) / 100,
        status: 'ok' as 'ok' | 'warning' | 'critical',
        alerts: [] as string[],
        requestId: req.requestId,
      };

      // Alert thresholds
      const WARNING_THRESHOLD = 80; // 80% utilization
      const CRITICAL_THRESHOLD = 95; // 95% utilization
      const WAITING_THRESHOLD = 10; // 10+ waiting connections

      // Check for warnings
      if (utilizationPercent >= CRITICAL_THRESHOLD) {
        poolStats.status = 'critical';
        poolStats.alerts.push(`CRITICAL: Connection pool utilization at ${utilizationPercent.toFixed(1)}%`);
        logger.error(`🚨 CRITICAL: Database connection pool utilization at ${utilizationPercent.toFixed(1)}%`, {
          totalCount,
          activeCount,
          idleCount,
          waitingCount,
        });
      } else if (utilizationPercent >= WARNING_THRESHOLD) {
        poolStats.status = 'warning';
        poolStats.alerts.push(`WARNING: Connection pool utilization at ${utilizationPercent.toFixed(1)}%`);
        logger.warn(`⚠️ WARNING: Database connection pool utilization at ${utilizationPercent.toFixed(1)}%`, {
          totalCount,
          activeCount,
          idleCount,
          waitingCount,
        });
      }

      // Check for waiting connections
      if (waitingCount >= WAITING_THRESHOLD) {
        poolStats.status = poolStats.status === 'critical' ? 'critical' : 'warning';
        poolStats.alerts.push(`WARNING: ${waitingCount} connections waiting for pool`);
        logger.warn(`⚠️ WARNING: ${waitingCount} database connections waiting for pool`, {
          totalCount,
          activeCount,
          idleCount,
          waitingCount,
        });
      }

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

  // Cache statistics endpoint
  app.get('/api/health/cache', async (req: Request, res: Response) => {
    try {
      const cacheStats = activeRequestsCache.getStats();
      res.json({
        ...cacheStats,
        requestId: req.requestId,
      });
    } catch (error) {
      logger.error('Error getting cache stats', { error, requestId: req.requestId });
      res.status(status.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to get cache stats',
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
        environment: process.env.NODE_ENV || 'development',
        requestId: req.requestId,
        services: {
          database: { status: 'unknown' as string },
          redis: { status: 'unknown' as string },
          socketIO: { status: 'ok' as string },
          license: { status: 'unknown' as string },
          cache: { status: 'unknown' as string },
        },
      };

      // Check database
      try {
        const pool = (await import('../database/db')).pool;
        await pool.query('SELECT 1');
        const totalCount = pool.totalCount;
        const idleCount = pool.idleCount;
        const waitingCount = pool.waitingCount;
        const activeCount = totalCount - idleCount;
        const utilizationPercent = totalCount > 0 ? (activeCount / totalCount) * 100 : 0;
        
        let dbStatus: 'ok' | 'warning' | 'error' = 'ok';
        if (utilizationPercent >= 95) {
          dbStatus = 'error';
          health.status = 'degraded';
        } else if (utilizationPercent >= 80 || waitingCount >= 10) {
          dbStatus = 'warning';
          health.status = 'degraded';
        }

        health.services.database = {
          status: dbStatus,
          pool: {
            total: totalCount,
            active: activeCount,
            idle: idleCount,
            waiting: waitingCount,
            utilizationPercent: Math.round(utilizationPercent * 100) / 100,
          },
        } as {
          status: string;
          pool: { total: number; active: number; idle: number; waiting: number; utilizationPercent: number };
        };
      } catch (error) {
        health.services.database = {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        } as { status: string; error: string };
        health.status = 'degraded';
      }

      // Check Redis
      try {
        const redisStatus = redisService.getStatus();
        health.services.redis = {
          status: redisStatus.connected ? 'ok' : 'disconnected',
          connected: redisStatus.connected,
          pubClient: redisStatus.pubClient,
          subClient: redisStatus.subClient,
          reconnectAttempts: redisStatus.reconnectAttempts,
        } as { status: string; connected: boolean; pubClient: boolean; subClient: boolean; reconnectAttempts: number };
        
        if (!redisStatus.connected) {
          health.status = 'degraded';
        }
      } catch (error) {
        health.services.redis = {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        } as { status: string; error: string };
        health.status = 'degraded';
      }

      // Check license status
      try {
        const licenseStatus = await licenseService.getLicenseStatus();
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

      // Check cache statistics
      try {
        const cacheStats = activeRequestsCache.getStats();
        health.services.cache = {
          status: 'ok',
          ...cacheStats,
        } as { status: string; tenantCount: number; totalEntries: number };
        
        // Warn if cache is getting large
        if (cacheStats.totalEntries > 5000) {
          health.status = 'degraded';
        }
      } catch (error) {
        health.services.cache = {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        } as { status: string; error: string };
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
}

