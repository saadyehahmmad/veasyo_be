/**
 * Main server entry point
 * This file now delegates to the modular server structure in src/server/
 * 
 * The server has been refactored into multiple modules for:
 * - Scalability: Redis pub/sub for horizontal scaling
 * - Reliability: Connection pooling, reconnection logic, error handling
 * - Maintainability: Organized into logical modules
 * 
 * See src/server/index.ts for the main server implementation
 */
import './server/index';
