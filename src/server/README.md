# Server Architecture

This directory contains the modular server architecture, optimized for scalability and reliability with millions of concurrent users.

## Architecture Overview

The server has been refactored from a monolithic `server.ts` file into a modular structure organized by responsibility:

```
src/server/
├── index.ts              # Main entry point - orchestrates all modules
├── app.config.ts         # Express app and HTTP server setup
├── middleware.config.ts  # Express middleware configuration
├── socket.config.ts      # Socket.IO server configuration
├── socket.handlers.ts    # Socket.IO event handlers
├── redis.service.ts      # Redis pub/sub service for horizontal scaling
├── routes.config.ts      # API routes registration
├── health.config.ts      # Health check endpoints
├── metrics.config.ts     # Prometheus metrics configuration
└── README.md             # This file
```

## Key Features

### 1. Redis Pub/Sub for Horizontal Scaling

**File:** `redis.service.ts`

- **Connection Management**: Automatic reconnection with exponential backoff
- **Health Monitoring**: Periodic health checks every 30 seconds
- **Error Recovery**: Graceful handling of connection failures
- **Socket.IO Adapter**: Enables horizontal scaling across multiple server instances

**Configuration:**
- Connection timeout: 10 seconds
- Ping interval: 30 seconds
- Reconnect strategy: Exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s)
- Max reconnection attempts: 10

### 2. Socket.IO Optimization

**Files:** `socket.config.ts`, `socket.handlers.ts`

- **High Concurrency**: Optimized for millions of concurrent connections
- **Tenant Isolation**: Strict tenant subdomain extraction and validation
- **Authentication**: JWT-based socket authentication
- **Event Handlers**: Modular event handling for all socket events

**Settings:**
- Ping timeout: 60 seconds
- Ping interval: 25 seconds
- Upgrade timeout: 30 seconds
- Max HTTP buffer: 1MB
- Compression threshold: 1KB

### 3. Express Middleware

**File:** `middleware.config.ts`

- **Security**: Helmet.js with CSP, HSTS, and security headers
- **CORS**: Configurable CORS with development/production modes
- **Rate Limiting**: API and authentication rate limiters
- **Request Tracking**: UUID-based request ID for distributed tracing
- **Logging**: Morgan HTTP request logging with Winston integration

### 4. Health Monitoring

**File:** `health.config.ts`

Endpoints:
- `/api/health` - Basic health check with license status
- `/api/health/db-pool` - Database connection pool stats
- `/api/health/sockets` - Socket.IO connection stats
- `/api/health/system` - System metrics (CPU, memory, uptime)
- `/api/health/comprehensive` - All systems health check

### 5. Prometheus Metrics

**File:** `metrics.config.ts`

Metrics:
- `waiter_connected_clients` - Number of connected Socket.IO clients
- `waiter_total_rooms` - Total Socket.IO rooms
- `waiter_total_sockets` - Total Socket.IO sockets
- Default Node.js metrics (CPU, memory, event loop, etc.)

Endpoint: `/metrics`

## Scalability Features

### Horizontal Scaling

1. **Redis Pub/Sub**: Enables multiple server instances to share Socket.IO state
2. **Stateless Design**: Most operations are stateless, allowing load balancing
3. **Connection Pooling**: Database and Redis connection pooling for efficiency

### Reliability Features

1. **Automatic Reconnection**: Redis clients automatically reconnect on failure
2. **Health Checks**: Regular health checks for all critical services
3. **Graceful Shutdown**: Proper cleanup of connections and resources
4. **Error Handling**: Comprehensive error handling with logging

### Performance Optimizations

1. **HTTP Keep-Alive**: 65-second keep-alive timeout for long-lived connections
2. **Message Compression**: Per-message deflate compression for large messages
3. **Connection Limits**: No artificial connection limits (system handles unlimited)
4. **Caching**: In-memory caching for active requests and tenant data

## Usage

The server starts automatically when `src/server.ts` is executed:

```bash
npm start
# or
ts-node src/server.ts
```

The main entry point (`src/server/index.ts`) orchestrates all modules in the correct order:

1. Create Express app
2. Create HTTP server
3. Configure middleware
4. Connect to Redis
5. Setup Socket.IO
6. Configure metrics
7. Configure health checks
8. Register routes
9. Start server

## Environment Variables

Required:
- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: localhost)
- `NODE_ENV` - Environment (development/production)
- `REDIS_URL` or `REDIS_HOST` + `REDIS_PORT` - Redis connection

Optional:
- `CORS_ORIGIN` - CORS allowed origins (default: *)
- `DOMAIN_URL` - Base domain for QR codes

## Monitoring

### Health Checks

```bash
# Basic health check
curl http://localhost:3000/api/health

# Comprehensive health check
curl http://localhost:3000/api/health/comprehensive

# Socket.IO stats
curl http://localhost:3000/api/health/sockets

# System metrics
curl http://localhost:3000/api/health/system
```

### Prometheus Metrics

```bash
curl http://localhost:3000/metrics
```

## Troubleshooting

### Redis Connection Issues

1. Check Redis is running: `redis-cli ping`
2. Verify `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT` environment variables
3. Check logs for reconnection attempts
4. Use `/api/health/comprehensive` to check Redis status

### High Memory Usage

1. Monitor `/api/health/system` for memory stats
2. Check Socket.IO connection count: `/api/health/sockets`
3. Review connection pooling: `/api/health/db-pool`
4. Consider horizontal scaling with Redis

### Socket.IO Connection Issues

1. Check CORS configuration in `middleware.config.ts`
2. Verify tenant subdomain extraction in `socket.handlers.ts`
3. Check authentication token validity
4. Review Socket.IO logs for connection errors

## Future Enhancements

- [ ] Redis Cluster support
- [ ] WebSocket compression tuning
- [ ] Connection rate limiting per tenant
- [ ] Advanced metrics and alerting
- [ ] Circuit breaker pattern for external services

