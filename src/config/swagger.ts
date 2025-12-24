import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './environment';

/**
 * Swagger/OpenAPI configuration
 */
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Waiter Calling System API',
      version: '1.0.0',
      description: 'Multi-tenant SaaS platform for restaurant service requests',
      contact: {
        name: 'API Support',
        email: 'support@waiter-system.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `http://${config.host}:${config.port}`,
        description: 'Development server',
      },
      {
        url: 'https://veasyo.com/devapi',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/auth/login',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'error',
            },
            statusCode: {
              type: 'number',
              example: 400,
            },
            message: {
              type: 'string',
              example: 'Validation failed',
            },
            code: {
              type: 'string',
              example: 'VALIDATION_ERROR',
            },
            requestId: {
              type: 'string',
              format: 'uuid',
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: {
                    type: 'string',
                  },
                  message: {
                    type: 'string',
                  },
                  code: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            username: {
              type: 'string',
            },
            email: {
              type: 'string',
              format: 'email',
            },
            fullName: {
              type: 'string',
            },
            role: {
              type: 'string',
              enum: ['admin', 'waiter', 'superadmin'],
            },
            active: {
              type: 'boolean',
            },
            tenantId: {
              type: 'string',
              format: 'uuid',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        ServiceRequest: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            tenantId: {
              type: 'string',
              format: 'uuid',
            },
            tableId: {
              type: 'string',
              format: 'uuid',
            },
            requestType: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['pending', 'acknowledged', 'completed', 'cancelled'],
            },
            customNote: {
              type: 'string',
            },
            timestampCreated: {
              type: 'string',
              format: 'date-time',
            },
            timestampAcknowledged: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            timestampCompleted: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            acknowledgedBy: {
              type: 'string',
              format: 'uuid',
              nullable: true,
            },
            completedBy: {
              type: 'string',
              enum: ['waiter', 'customer'],
              nullable: true,
            },
            durationSeconds: {
              type: 'number',
              nullable: true,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: {
              type: 'number',
            },
            limit: {
              type: 'number',
            },
            total: {
              type: 'number',
            },
            totalPages: {
              type: 'number',
            },
            hasNext: {
              type: 'boolean',
            },
            hasPrev: {
              type: 'boolean',
            },
          },
        },
        responses: {
          UnauthorizedError: {
            description: 'Authentication required',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                example: {
                  status: 'error',
                  statusCode: 401,
                  message: 'Unauthorized',
                  code: 'UNAUTHORIZED',
                },
              },
            },
          },
          ForbiddenError: {
            description: 'Access denied',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                example: {
                  status: 'error',
                  statusCode: 403,
                  message: 'Access denied',
                  code: 'FORBIDDEN',
                },
              },
            },
          },
          NotFoundError: {
            description: 'Resource not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                example: {
                  status: 'error',
                  statusCode: 404,
                  message: 'Resource not found',
                  code: 'NOT_FOUND',
                },
              },
            },
          },
          ValidationError: {
            description: 'Validation failed',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Error' },
                    {
                      type: 'object',
                      properties: {
                        errors: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              field: {
                                type: 'string',
                              },
                              message: {
                                type: 'string',
                              },
                              code: {
                                type: 'string',
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
                example: {
                  status: 'error',
                  statusCode: 400,
                  message: 'Validation failed',
                  code: 'VALIDATION_ERROR',
                  errors: [
                    {
                      field: 'email',
                      message: 'Invalid email address',
                      code: 'invalid_string',
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './src/routes/*.ts',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

