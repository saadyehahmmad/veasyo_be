import { createClient, RedisClientType, RedisClientOptions } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { config } from '../config/environment';
import logger from '../utils/logger';
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../models/types';

/**
 * Redis Service for scalable pub/sub messaging
 * Handles connection management, reconnection, and error recovery
 * Optimized for millions of concurrent connections
 */
export class RedisService {
  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start with 1 second
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  /**
   * Get Redis connection URL
   */
  private getRedisUrl(): string | null {
    const redisUrl = process.env.REDIS_URL || 
      `redis://${config.redis.host}:${config.redis.port}`;
    
    if (!redisUrl || redisUrl === 'redis://:') {
      return null;
    }
    
    return redisUrl;
  }

  /**
   * Create Redis client with optimized settings for high concurrency
   */
  private createRedisClient(url: string): RedisClientType {
    const options: RedisClientOptions = {
      url,
      socket: {
        // Connection timeout
        connectTimeout: 10000, // 10 seconds
        // Keep-alive settings for long-lived connections
        keepAlive: true,
        // Reconnect strategy
        reconnectStrategy: (retries: number) => {
          if (retries > this.maxReconnectAttempts) {
            logger.error('Max Redis reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
          const delay = Math.min(1000 * Math.pow(2, retries), 30000);
          logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        },
      },
    };

    const client = createClient(options) as RedisClientType;

    // Error handling
    client.on('error', (err) => {
      logger.error('Redis client error:', err);
      this.isConnected = false;
      this.scheduleReconnect();
    });

    // Connection events
    client.on('connect', () => {
      logger.info('Redis client connecting...');
    });

    client.on('ready', () => {
      logger.info('✅ Redis client ready');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
    });

    client.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
      this.isConnected = false;
    });

    client.on('end', () => {
      logger.warn('Redis connection ended');
      this.isConnected = false;
    });

    return client;
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max Redis reconnection attempts reached. Stopping reconnection attempts.');
      return;
    }

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      logger.info(`Attempting Redis reconnection (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      await this.connect();
    }, this.reconnectDelay);

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }

  /**
   * Connect to Redis and setup pub/sub clients
   */
  async connect(): Promise<boolean> {
    const redisUrl = this.getRedisUrl();
    
    if (!redisUrl) {
      logger.info('Redis URL not configured; running without Redis adapter');
      return false;
    }

    try {
      // Create pub/sub clients
      this.pubClient = this.createRedisClient(redisUrl);
      this.subClient = this.pubClient.duplicate();

      // Connect both clients
      await Promise.all([
        this.pubClient.connect(),
        this.subClient.connect(),
      ]);

      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;

      // Start health check
      this.startHealthCheck();

      logger.info('✅ Redis pub/sub clients connected successfully');
      return true;
    } catch (err) {
      logger.error('❌ Failed to connect Redis clients:', err);
      this.isConnected = false;
      this.scheduleReconnect();
      return false;
    }
  }

  /**
   * Setup Socket.IO Redis adapter for horizontal scaling
   */
  async setupSocketIOAdapter(
    io: Server<ClientToServerEvents, ServerToClientEvents>
  ): Promise<boolean> {
    if (!this.pubClient || !this.subClient || !this.isConnected) {
      logger.warn('Redis clients not connected; Socket.IO will run without Redis adapter');
      return false;
    }

    try {
      io.adapter(createAdapter(this.pubClient, this.subClient));
      logger.info('✅ Socket.IO Redis adapter enabled for horizontal scaling');
      return true;
    } catch (err) {
      logger.error('❌ Failed to setup Socket.IO Redis adapter:', err);
      return false;
    }
  }

  /**
   * Health check for Redis connection
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      if (!this.pubClient || !this.isConnected) {
        return;
      }

      try {
        await this.pubClient.ping();
      } catch (err) {
        logger.error('Redis health check failed:', err);
        this.isConnected = false;
        this.scheduleReconnect();
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Get Redis connection status
   */
  getStatus(): {
    connected: boolean;
    pubClient: boolean;
    subClient: boolean;
    reconnectAttempts: number;
  } {
    return {
      connected: this.isConnected,
      pubClient: this.pubClient?.isReady || false,
      subClient: this.subClient?.isReady || false,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Get pub client for direct Redis operations
   */
  getPubClient(): RedisClientType | null {
    return this.pubClient;
  }

  /**
   * Get sub client for direct Redis operations
   */
  getSubClient(): RedisClientType | null {
    return this.subClient;
  }

  /**
   * Gracefully disconnect Redis clients
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    const disconnectPromises: Promise<void>[] = [];

    if (this.pubClient) {
      disconnectPromises.push(
        this.pubClient.quit()
          .then(() => {
            // Explicitly return void
            return undefined;
          })
          .catch((err) => {
            logger.error('Error disconnecting pub client:', err);
            // Return void even on error
            return undefined;
          })
      );
    }

    if (this.subClient) {
      disconnectPromises.push(
        this.subClient.quit()
          .then(() => {
            // Explicitly return void
            return undefined;
          })
          .catch((err) => {
            logger.error('Error disconnecting sub client:', err);
            // Return void even on error
            return undefined;
          })
      );
    }

    await Promise.all(disconnectPromises);

    this.pubClient = null;
    this.subClient = null;
    this.isConnected = false;

    logger.info('Redis clients disconnected');
  }
}

// Singleton instance
export const redisService = new RedisService();

