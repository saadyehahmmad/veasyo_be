import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from '../config/swagger';
import { config } from '../config/environment';
import logger from '../utils/logger';

/**
 * Configure Swagger/OpenAPI documentation
 * Only enabled if ENABLE_SWAGGER=true in environment
 */
export function configureSwagger(app: express.Application): void {
  // Check if Swagger is enabled
  if (!config.features.enableSwagger) {
    logger.info('📚 Swagger/OpenAPI documentation disabled (ENABLE_SWAGGER=false)');
    return;
  }

  try {
    // Swagger UI options
    const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Waiter API Documentation',
      customfavIcon: '/favicon.ico',
      swaggerOptions: {
        persistAuthorization: true, // Keep auth token in browser session
        displayRequestDuration: true,
        filter: true, // Enable search/filter
        tryItOutEnabled: true,
      },
    };

    // Serve Swagger UI
    app.use('/api-docs', swaggerUi.serve);
    app.get('/api-docs', swaggerUi.setup(swaggerSpec, swaggerUiOptions));

    // Also serve raw OpenAPI spec JSON
    app.get('/api-docs.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });

    logger.info('📚 Swagger/OpenAPI documentation available at /api-docs');
  } catch (error) {
    logger.error('Failed to configure Swagger documentation', error);
    // Don't throw - allow server to start even if Swagger setup fails
  }
}

