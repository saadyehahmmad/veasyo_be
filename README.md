# Waiter Backend API

A robust, scalable, multi-tenant SaaS backend for restaurant waiter calling systems built with Node.js, TypeScript, and Express. Features real-time communication via Socket.IO, comprehensive integration support, and a clean, layered architecture.

## 📋 Table of Contents

- [Features Overview](#-features-overview)
- [Architecture](#-architecture)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [API Documentation](#-api-documentation)
- [Architecture Details](#-architecture-details)
- [Development](#-development)

## ✨ Features Overview

### Core Features

#### 🏢 Multi-Tenant SaaS Architecture
- **Tenant Isolation**: Complete data isolation per restaurant/tenant
- **Subdomain Routing**: Automatic tenant identification via subdomain
- **Flexible Plans**: Support for free, basic, premium, and enterprise subscription tiers
- **Resource Limits**: Configurable limits per plan (tables, users, etc.)

#### 📱 Service Request Management
- **Real-Time Requests**: Instant waiter calls via WebSocket connections
- **Request Types**: Customizable request types (call waiter, bill, assistance, etc.)
- **Status Tracking**: Full lifecycle tracking (pending → acknowledged → completed/cancelled)
- **Duration Analytics**: Automatic calculation of request handling times
- **Custom Notes**: Support for customer-specified notes on requests

#### 👥 User Management & Authentication
- **Role-Based Access Control (RBAC)**: Superadmin, Admin, and Waiter roles
- **JWT Authentication**: Secure token-based authentication with refresh tokens
- **Multi-Tenant Users**: Users scoped to tenants with permission isolation
- **Superadmin Portal**: Global administration capabilities

#### 🎨 Branding & Customization
- **White-Label Theming**: Fully customizable tenant branding
- **Color Schemes**: Primary, secondary, accent, and text color customization
- **Background Patterns**: Support for gradients and custom patterns
- **Custom CSS**: Advanced styling capabilities per tenant
- **Logo & Favicon**: Tenant-specific branding assets
- **Social Media Integration**: Links to social media profiles

#### 🖨️ Hardware Integrations
- **Printer Integration**: XPrinter network thermal printer support (ESC/POS)
  - Automatic receipt printing on new requests
  - Configurable paper widths (58mm/80mm)
  - Custom header/footer support
- **Speaker Integration**: Network-based audio alerts
  - Configurable volume and duration
  - Multiple sound types (beep, alert, custom)
- **PC Agent Support**: Direct communication with PC-based hardware agents

#### 🔗 External Integrations
- **Webhook Support**: Real-time webhook notifications for external systems
- **Event-Based Triggers**: Configurable events (new request, acknowledged, completed)
- **Retry Logic**: Automatic retry with configurable attempts and timeouts

#### 📊 Analytics & Reporting
- **Request Analytics**: Total, pending, and completed request metrics
- **Response Time Tracking**: Average response time calculations
- **Request Type Distribution**: Analytics by request type
- **Table Performance**: Request analytics per table
- **Feedback System**: Customer feedback collection with ratings and comments

#### 🗄️ Database & Persistence
- **PostgreSQL**: Robust relational database with optimized queries
- **Drizzle ORM**: Type-safe database queries with SQL-like syntax
- **Connection Pooling**: High-performance connection management
- **Migration System**: Versioned database migrations
- **Database Seeding**: Development data seeding support

#### 🔒 Security Features
- **Input Validation**: Zod schema validation for all inputs
- **XSS Protection**: Input sanitization middleware
- **SQL Injection Prevention**: Parameterized queries via ORM
- **Rate Limiting**: API and authentication endpoint rate limiting
- **CORS Configuration**: Configurable cross-origin resource sharing
- **Security Headers**: Helmet.js for security headers
- **Password Hashing**: bcrypt for secure password storage

#### 📡 Real-Time Communication
- **Socket.IO**: WebSocket-based real-time bidirectional communication
- **Room-Based Broadcasting**: Tenant and table-specific message routing
- **Horizontal Scaling**: Redis pub/sub for multi-instance deployment
- **Connection Management**: Automatic reconnection and health monitoring

#### 📈 Monitoring & Observability
- **Health Checks**: Comprehensive health check endpoints
- **Prometheus Metrics**: Built-in metrics export for monitoring
- **Request Logging**: Structured logging with Winston
- **Error Tracking**: Centralized error handling with context
- **Performance Metrics**: Database pool, socket, and system metrics

## 🏗️ Architecture

### Clean Architecture Principles

This backend follows **Clean Architecture** principles, organizing code into distinct layers with clear separation of concerns and dependency inversion.

```
┌─────────────────────────────────────────────────────────────┐
│                      Presentation Layer                      │
│  (Routes, Controllers, Middleware, Socket Handlers)         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                       │
│              (Services, Business Logic)                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                       Domain Layer                           │
│         (Models, Types, Error Classes)                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Infrastructure Layer                       │
│    (Database, External APIs, Integrations, Utils)           │
└─────────────────────────────────────────────────────────────┘
```

### Architecture Layers

#### 1. **Presentation Layer** (`src/routes`, `src/controllers`, `src/middleware`, `src/server`)
- **Routes**: HTTP route definitions with validation middleware
- **Controllers**: Request/response handling, delegation to services
- **Middleware**: Authentication, authorization, validation, error handling
- **Socket Handlers**: WebSocket event handling and real-time communication

#### 2. **Application Layer** (`src/services`)
- **Business Logic**: Core application logic and use cases
- **Service Classes**: Stateless services that orchestrate domain operations
- **Transaction Management**: Database transaction handling
- **Integration Orchestration**: Coordination of external integrations

#### 3. **Domain Layer** (`src/models`, `src/errors`)
- **Domain Models**: Core business entities and value objects
- **Error Classes**: Domain-specific error definitions
- **Types**: TypeScript type definitions for domain concepts

#### 4. **Infrastructure Layer** (`src/database`, `src/integrations`, `src/utils`)
- **Database Access**: Drizzle ORM queries and schema definitions
- **External Services**: Printer, speaker, webhook integrations
- **Utilities**: JWT, password hashing, caching, logging

### Key Architectural Patterns

#### Dependency Injection
- Services are instantiated within controllers
- Dependencies flow from outer layers to inner layers
- Easy to mock for testing

#### Repository Pattern (via Drizzle ORM)
- Database queries encapsulated in service layer
- Type-safe queries with compile-time validation
- Database-agnostic business logic

#### Middleware Pattern
- Composable request processing pipeline
- Authentication, validation, and error handling as middleware
- Clean separation of cross-cutting concerns

#### Event-Driven Architecture
- Socket.IO events for real-time communication
- Asynchronous integration triggers
- Non-blocking request processing

## 🛠️ Technology Stack

### Core
- **Node.js**: Runtime environment
- **TypeScript**: Type-safe JavaScript
- **Express.js**: Web application framework

### Database & ORM
- **PostgreSQL**: Primary database
- **Drizzle ORM**: Type-safe SQL query builder
- **pg (node-postgres)**: PostgreSQL client with connection pooling

### Real-Time Communication
- **Socket.IO**: WebSocket framework for real-time bidirectional communication
- **Redis**: Pub/sub adapter for horizontal scaling

### Authentication & Security
- **jsonwebtoken**: JWT token generation and validation
- **bcrypt**: Password hashing
- **helmet**: Security headers middleware
- **express-rate-limit**: Rate limiting

### Validation & Schema
- **Zod**: Runtime type validation and schema definition
- **Joi**: Environment variable validation

### Monitoring & Logging
- **Winston**: Structured logging
- **prom-client**: Prometheus metrics collection
- **morgan**: HTTP request logging

### Development Tools
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **nodemon**: Development auto-reload
- **ts-node**: TypeScript execution

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/              # Configuration files
│   │   ├── environment.ts   # Environment configuration
│   │   ├── env.validation.ts # Environment variable validation
│   │   └── swagger.ts       # Swagger/OpenAPI documentation
│   │
│   ├── controllers/         # Request handlers (Presentation Layer)
│   │   ├── auth.controller.ts
│   │   ├── service-request.controller.ts
│   │   ├── tenant.controller.ts
│   │   └── ...
│   │
│   ├── services/            # Business logic (Application Layer)
│   │   ├── auth.service.ts
│   │   ├── service-request.service.ts
│   │   ├── tenant.service.ts
│   │   └── ...
│   │
│   ├── routes/              # Route definitions
│   │   ├── auth.routes.ts
│   │   ├── service-request.routes.ts
│   │   └── ...
│   │
│   ├── middleware/          # Express middleware
│   │   ├── auth.ts          # Authentication middleware
│   │   ├── rbac.ts          # Role-based access control
│   │   ├── error-handler.ts # Error handling middleware
│   │   ├── validate.ts      # Input validation middleware
│   │   └── tenant.ts        # Tenant extraction middleware
│   │
│   ├── database/            # Database layer (Infrastructure)
│   │   ├── db.ts            # Database connection
│   │   ├── schema.ts        # Drizzle schema definitions
│   │   ├── migrations/      # Database migrations
│   │   └── seed.ts          # Database seeding
│   │
│   ├── integrations/        # External integrations
│   │   ├── printer.integration.ts
│   │   ├── speaker.integration.ts
│   │   └── README.md
│   │
│   ├── models/              # Domain models (Domain Layer)
│   │   └── types.ts         # TypeScript type definitions
│   │
│   ├── errors/              # Error classes (Domain Layer)
│   │   └── AppError.ts      # Custom error hierarchy
│   │
│   ├── utils/               # Utility functions
│   │   ├── jwt.ts           # JWT utilities
│   │   ├── password.ts      # Password hashing
│   │   ├── logger.ts        # Winston logger
│   │   └── cache-manager.ts # In-memory caching
│   │
│   ├── validators/          # Zod validation schemas
│   │   ├── service-request.validator.ts
│   │   └── user.validator.ts
│   │
│   ├── handlers/            # Event handlers
│   │   └── requestHandler.ts # Request lifecycle handlers
│   │
│   ├── server/              # Server configuration
│   │   ├── index.ts         # Main server entry point
│   │   ├── app.config.ts    # Express app setup
│   │   ├── middleware.config.ts
│   │   ├── socket.config.ts # Socket.IO configuration
│   │   ├── socket.handlers.ts
│   │   ├── redis.service.ts # Redis connection service
│   │   ├── routes.config.ts
│   │   ├── health.config.ts # Health check endpoints
│   │   ├── metrics.config.ts # Prometheus metrics
│   │   └── swagger.config.ts
│   │
│   └── server.ts            # Server entry point
│
├── dist/                    # Compiled JavaScript output
├── logs/                    # Application logs
├── docs/                    # Additional documentation
├── scripts/                 # Utility scripts
├── package.json
├── tsconfig.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **PostgreSQL** 12+ (or Docker)
- **Redis** 6+ (optional, for horizontal scaling)

### Installation

1. **Clone the repository** (if applicable)

2. **Install dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Configure environment variables**

   Create a `.env` file in the `backend` directory:
   ```env
   # Server Configuration
   NODE_ENV=development
   PORT=3000
   HOST=localhost

   # Database Configuration
   DATABASE_URL=postgresql://username:password@localhost:5432/waiter_saas
   # OR use individual parameters:
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_USER=postgres
   DATABASE_PASSWORD=your_password
   DATABASE_NAME=waiter_saas

   # Redis Configuration (optional)
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=

   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-min-32-characters-long
   JWT_EXPIRES_IN=1h
   JWT_REFRESH_SECRET=your-refresh-token-secret-min-32-characters
   JWT_REFRESH_EXPIRES_IN=7d

   # CORS Configuration
   CORS_ORIGIN=*

   # Domain Configuration
   DOMAIN_URL=http://localhost:3000

   # Logging
   LOG_LEVEL=info

   # Feature Flags
   ENABLE_METRICS=true
   ENABLE_SWAGGER=true
   ```

4. **Setup Database**

   ```bash
   # Run migrations
   npm run db:migrate

   # Seed database (optional, for development)
   npm run db:seed
   ```

5. **Start the server**

   ```bash
   # Development mode (with auto-reload)
   npm run dev

   # Production mode
   npm run build
   npm run start:prod
   ```

6. **Verify Installation**

   ```bash
   # Health check
   curl http://localhost:3000/api/health

   # API documentation (if Swagger is enabled)
   # Open http://localhost:3000/api-docs in your browser
   ```

### Database Setup

For detailed database setup instructions, see [DATABASE_SETUP.md](./DATABASE_SETUP.md).

## 📚 API Documentation

### API Base URL

- **Development**: `http://localhost:3000/api`
- **Production**: `https://your-domain.com/api`

### Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```http
Authorization: Bearer <your-access-token>
```

### Main API Endpoints

#### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

#### Service Requests
- `GET /api/service-requests` - List service requests (with pagination, filtering, sorting)
- `POST /api/service-requests` - Create new service request
- `GET /api/service-requests/:id` - Get service request by ID
- `PUT /api/service-requests/:id` - Update service request
- `POST /api/service-requests/:id/acknowledge` - Acknowledge request
- `POST /api/service-requests/:id/complete` - Complete request
- `POST /api/service-requests/:id/cancel` - Cancel request
- `GET /api/service-requests/analytics` - Get analytics data

#### Tenants
- `GET /api/tenants` - List tenants (admin only)
- `POST /api/tenants` - Create tenant
- `GET /api/tenants/:id` - Get tenant details
- `PUT /api/tenants/:id` - Update tenant
- `GET /api/tenants/:id/branding` - Get tenant branding settings
- `PUT /api/tenants/:id/branding` - Update tenant branding

#### Tables
- `GET /api/tables` - List tables for tenant
- `POST /api/tables` - Create table
- `GET /api/tables/:id` - Get table details
- `PUT /api/tables/:id` - Update table
- `DELETE /api/tables/:id` - Delete table
- `POST /api/tables/:id/generate-qr` - Generate QR code for table

#### Integrations
- `GET /api/integrations/printer` - Get printer settings
- `PUT /api/integrations/printer` - Update printer settings
- `POST /api/integrations/printer/test` - Test printer connection
- `GET /api/integrations/speaker` - Get speaker settings
- `PUT /api/integrations/speaker` - Update speaker settings
- `POST /api/integrations/speaker/test` - Test speaker connection

#### Health & Metrics
- `GET /api/health` - Basic health check
- `GET /api/health/comprehensive` - Comprehensive health check
- `GET /api/health/sockets` - Socket.IO statistics
- `GET /api/health/db-pool` - Database pool statistics
- `GET /api/health/system` - System metrics
- `GET /metrics` - Prometheus metrics endpoint

### Swagger Documentation

When `ENABLE_SWAGGER=true`, interactive API documentation is available at:

```
http://localhost:3000/api-docs
```

## 🏗️ Architecture Details

### Request Flow

```
Client Request
    ↓
Routes Layer (route definitions)
    ↓
Authentication Middleware (JWT validation)
    ↓
Authorization Middleware (RBAC checks)
    ↓
Validation Middleware (Zod schema validation)
    ↓
Controller (request/response handling)
    ↓
Service Layer (business logic)
    ↓
Database Layer (Drizzle ORM)
    ↓
PostgreSQL Database
```

### Real-Time Flow (Socket.IO)

```
Client Connection
    ↓
Socket.IO Server
    ↓
Authentication (JWT from handshake)
    ↓
Tenant Extraction (from subdomain)
    ↓
Room Joining (tenant-based rooms)
    ↓
Event Handling (call_waiter, acknowledge, etc.)
    ↓
Request Handler (in-memory + database)
    ↓
Broadcast to Relevant Rooms
    ↓
Integration Triggers (printer, speaker, webhook)
```

### Multi-Tenant Isolation

1. **Subdomain-Based**: Tenants identified by subdomain (e.g., `restaurant1.yourdomain.com`)
2. **Database Level**: All tables include `tenant_id` foreign key
3. **Middleware**: Automatic tenant extraction and validation
4. **Service Layer**: All queries filtered by tenant ID
5. **Socket.IO**: Room-based isolation (`tenant-{id}-*`)

### Error Handling Strategy

1. **Domain Errors**: Custom error classes (`AppError`, `ValidationError`, etc.)
2. **Service Layer**: Throws domain errors
3. **Middleware**: Centralized error handler catches all errors
4. **Response**: Consistent error response format with status codes
5. **Logging**: All errors logged with full context

### Caching Strategy

- **In-Memory Cache**: Active requests cached for real-time access
- **TTL-Based**: Automatic expiration of cached entries
- **Tenant Data**: Frequently accessed tenant data cached
- **Cache Invalidation**: On tenant/table updates

### Horizontal Scaling

- **Redis Pub/Sub**: Socket.IO adapter for multi-instance deployment
- **Stateless Design**: Minimal server-side state
- **Connection Pooling**: Database and Redis connection pooling
- **Load Balancing**: Compatible with standard load balancers

## 💻 Development

### Available Scripts

```bash
# Development
npm run dev              # Start with nodemon (auto-reload)
npm start                # Start with ts-node
npm run start:network    # Start with network access (0.0.0.0)

# Production
npm run build            # Compile TypeScript
npm run start:prod       # Start compiled JavaScript

# Database
npm run db:migrate       # Run database migrations
npm run db:seed          # Seed database
npm run db:studio        # Open Drizzle Studio

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint errors
npm run format           # Format code with Prettier
npm run format:check     # Check code formatting
```

### Code Style

- **ESLint**: TypeScript recommended rules
- **Prettier**: 100 character line width, single quotes
- **TypeScript**: Strict mode enabled

### Environment Variables

All environment variables are validated on startup using Joi. Invalid configuration will prevent the server from starting.

See `src/config/env.validation.ts` for the complete schema.

### Logging

Logs are written to:
- **Console**: In development mode
- **Files**: `logs/combined.log` and `logs/error.log`

Log levels: `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`

## 📝 License

[Your License Here]

## 🤝 Contributing

[Contributing Guidelines]

## 📧 Support

[Support Information]

---

**Built with ❤️ using Clean Architecture principles**

