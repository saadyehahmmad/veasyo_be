import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Create PostgreSQL connection pool
// Support both DATABASE_URL and individual connection parameters
// DATABASE_URL format: postgresql://user:password@host:port/database
const getDbConfig = () => {
  // If DATABASE_URL is provided, use it (preferred for Docker/cloud deployments)
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      // Increased pool size for high concurrency
      // Default: 20 max, 5 min
      // For high socket load: increase max connections
      max: parseInt(process.env.DATABASE_POOL_MAX || '100'), // Increased from 20 to 100
      min: parseInt(process.env.DATABASE_POOL_MIN || '10'), // Increased from 5 to 10
      // Optimized timeouts for high concurrency
      idleTimeoutMillis: 30000, // 30 seconds - close idle connections
      connectionTimeoutMillis: 10000, // 10 seconds - increased from 5s for high load
      query_timeout: 30000, // 30 seconds - increased from 10s for complex queries
      statement_timeout: 30000, // 30 seconds - increased from 10s
      // Allow more time for connection acquisition under load
      acquireTimeoutMillis: 60000, // 60 seconds - wait time to get connection from pool
    };
  }

  // Otherwise, use individual environment variables (fallback for local development)
  return {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5433', 10),
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'waiter_saas',
    // Use same optimized pool settings as DATABASE_URL configuration
    max: parseInt(process.env.DATABASE_POOL_MAX || '100'), // Increased from 20 to 100
    min: parseInt(process.env.DATABASE_POOL_MIN || '10'), // Increased from 5 to 10
    // Optimized timeouts for high concurrency
    idleTimeoutMillis: 30000, // 30 seconds - close idle connections
    connectionTimeoutMillis: 10000, // 10 seconds - increased from 5s for high load
    query_timeout: 30000, // 30 seconds - increased from 10s for complex queries
    statement_timeout: 30000, // 30 seconds - increased from 10s
    // Allow more time for connection acquisition under load
    acquireTimeoutMillis: 60000, // 60 seconds - wait time to get connection from pool
  };
};

export const pool = new Pool(getDbConfig());

// Initialize Drizzle ORM
export const db = drizzle(pool, { schema });

// Test connection
pool.on('connect', () => {
  // Database connected
});

pool.on('error', () => {
  // Database connection error
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await pool.end();
});
