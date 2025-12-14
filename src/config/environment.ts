export const config = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || 'localhost', // Host to bind to (0.0.0.0 for network access)
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  domainUrl: process.env.DOMAIN_URL || 'localhost', // Base domain for QR code generation
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    adminChatIds: process.env.TELEGRAM_ADMIN_CHAT_IDS ? process.env.TELEGRAM_ADMIN_CHAT_IDS.split(',').map(id => id.trim()) : [],
  },
};
