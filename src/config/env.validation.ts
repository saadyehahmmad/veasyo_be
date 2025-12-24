import Joi from 'joi';
import logger from '../utils/logger';

/**
 * Environment variables validation schema
 * Ensures all required environment variables are present and valid
 */
const envSchema = Joi.object({
  // Server Configuration
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  
  PORT: Joi.number()
    .port()
    .default(3000),
  
  HOST: Joi.string()
    .hostname()
    .default('localhost'),

  // Database Configuration
  DATABASE_URL: Joi.string()
    .uri()
    .required()
    .messages({
      'any.required': 'DATABASE_URL is required',
      'string.uri': 'DATABASE_URL must be a valid URI',
    }),
  
  DATABASE_HOST: Joi.string()
    .hostname()
    .when('DATABASE_URL', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
  
  DATABASE_PORT: Joi.number()
    .port()
    .default(5432),
  
  DATABASE_USER: Joi.string()
    .when('DATABASE_URL', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
  
  DATABASE_PASSWORD: Joi.string()
    .when('DATABASE_URL', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
  
  DATABASE_NAME: Joi.string()
    .when('DATABASE_URL', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
  
  DATABASE_POOL_MAX: Joi.number()
    .integer()
    .min(1)
    .max(500)
    .default(100),
  
  DATABASE_POOL_MIN: Joi.number()
    .integer()
    .min(0)
    .max(100)
    .default(10),

  // Redis Configuration
  REDIS_HOST: Joi.string()
    .hostname()
    .default('localhost'),
  
  REDIS_PORT: Joi.number()
    .port()
    .default(6379),
  
  REDIS_PASSWORD: Joi.string()
    .allow('')
    .optional(),
  
  REDIS_CLUSTER_NODES: Joi.string()
    .optional(),

  // JWT Configuration
  JWT_SECRET: Joi.string()
    .min(32)
    .required()
    .messages({
      'any.required': 'JWT_SECRET is required',
      'string.min': 'JWT_SECRET must be at least 32 characters long for security',
    }),
  
  JWT_EXPIRES_IN: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('1d')
    .messages({
      'string.pattern.base': 'JWT_EXPIRES_IN must be in format like "1d", "2h", "30m"',
    }),
  
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .required()
    .messages({
      'any.required': 'JWT_REFRESH_SECRET is required',
      'string.min': 'JWT_REFRESH_SECRET must be at least 32 characters long',
    }),
  
  JWT_REFRESH_EXPIRES_IN: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('7d'),

  // CORS Configuration
  CORS_ORIGIN: Joi.string()
    .default('*'),
  
  DOMAIN_URL: Joi.string()
    .required()
    .messages({
      'any.required': 'DOMAIN_URL is required for QR code generation',
    }),

  // Logging Configuration
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
    .default('info'),

  // Socket.IO Configuration
  SOCKET_IO_PATH: Joi.string()
    .default('/socket.io'),

  // Telegram Configuration (Optional)
  TELEGRAM_BOT_TOKEN: Joi.string()
    .optional()
    .allow(''),
  
  TELEGRAM_ADMIN_CHAT_IDS: Joi.string()
    .optional()
    .allow(''),

  // Feature Flags (Optional)
  // Joi.boolean() automatically converts 'true'/'false' strings to booleans
  ENABLE_METRICS: Joi.boolean()
    .truthy('true', '1', 'yes', 'on')
    .falsy('false', '0', 'no', 'off')
    .default(true),
  
  ENABLE_SWAGGER: Joi.boolean()
    .truthy('true', '1', 'yes', 'on')
    .falsy('false', '0', 'no', 'off')
    .default(true),
})
  .unknown(true); // Allow unknown environment variables

/**
 * Validate environment variables
 * Throws error if validation fails
 */
export function validateEnv(): Record<string, unknown> {
  const { error, value } = envSchema.validate(process.env, {
    abortEarly: false, // Show all errors, not just the first one
    stripUnknown: false, // Keep unknown variables
  });

  if (error) {
    const errorMessages = error.details.map((detail) => detail.message).join('\n  - ');
    
    logger.error('❌ Environment validation failed:');
    logger.error(`  - ${errorMessages}`);
    
    throw new Error(`Environment validation error:\n  - ${errorMessages}`);
  }

  // Log successful validation in development
  if (value.NODE_ENV === 'development') {
    logger.info('✅ Environment variables validated successfully');
  }

  return value;
}

/**
 * Get validated environment variable
 * Returns undefined if variable doesn't exist
 */
export function getEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * Get validated environment variable or throw error
 */
export function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  
  if (!value) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  
  return value;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if running in test
 */
export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

