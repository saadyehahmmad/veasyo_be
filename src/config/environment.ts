import { validateEnv } from './env.validation';

interface RedisConfig {
  host: string;
  port: number;
  clusterNodes?: string[];
}

interface TelegramConfig {
  botToken: string;
  adminChatIds: string[];
}

interface AppConfig {
  port: number | string;
  host: string;
  nodeEnv: string;
  corsOrigin: string;
  domainUrl: string;
  redis: RedisConfig;
  telegram: TelegramConfig;
  features: {
    enableMetrics: boolean;
    enableSwagger: boolean;
  };
}

// Validate environment variables on startup
const env = validateEnv();

export const config: AppConfig = {
  port: env.PORT as number,
  host: env.HOST as string,
  nodeEnv: env.NODE_ENV as string,
  corsOrigin: env.CORS_ORIGIN as string,
  domainUrl: env.DOMAIN_URL as string,
  redis: {
    host: env.REDIS_HOST as string,
    port: env.REDIS_PORT as number,
    clusterNodes: env.REDIS_CLUSTER_NODES 
      ? (env.REDIS_CLUSTER_NODES as string).split(',').map((n: string) => n.trim()) 
      : undefined,
  },
  telegram: {
    botToken: (env.TELEGRAM_BOT_TOKEN as string) || '',
    adminChatIds: env.TELEGRAM_ADMIN_CHAT_IDS 
      ? (env.TELEGRAM_ADMIN_CHAT_IDS as string).split(',').map((id: string) => id.trim()) 
      : [],
  },
  features: {
    enableMetrics: env.ENABLE_METRICS as boolean,
    enableSwagger: env.ENABLE_SWAGGER as boolean,
  },
};
