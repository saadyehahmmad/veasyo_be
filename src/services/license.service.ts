import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/environment';
import logger from '../utils/logger';
import * as os from 'os';
import { AnalyticsService } from './analytics.service';

class LicenseService {
  private licenseEnabled: boolean = true; // Start enabled by default
  private telegramBot?: TelegramBot;
  private analyticsService: AnalyticsService;

  constructor() {
    this.analyticsService = new AnalyticsService();
    // Initialize Telegram bot if token is provided
    const botToken = config.telegram.botToken;
    if (botToken) {
      this.telegramBot = new TelegramBot(botToken, { polling: true });
      this.setupTelegramCommands();
      logger.info('🤖 Telegram bot initialized for license control');
    } else {
      logger.warn('⚠️ Telegram bot token not provided, bot control disabled');
    }
  }

  /**
   * Validates license - simply returns the current enabled status
   */
  async validateLicense(): Promise<boolean> {
    return this.licenseEnabled;
  }

  /**
   * Checks if license is currently enabled
   */
  isLicenseValid(): boolean {
    return this.licenseEnabled;
  }

  /**
   * Gets license status for health checks
   */
  getLicenseStatus(): { status: string; enabled: boolean } {
    return {
      status: this.licenseEnabled ? 'active' : 'disabled',
      enabled: this.licenseEnabled,
    };
  }

  /**
   * Sets up Telegram bot commands for license control
   */
  private setupTelegramCommands(): void {
    if (!this.telegramBot) return;

    // Log all incoming messages for chat ID discovery
    this.telegramBot.on('message', (msg) => {
      logger.info(`🤖 Telegram message from chat ID: ${msg.chat.id}, username: ${msg.from?.username || 'unknown'}, text: "${msg.text}"`);
    });

    // /status command - Get current license status
    this.telegramBot.onText(/\/status/, (msg) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        this.telegramBot!.sendMessage(msg.chat.id, 'Unauthorized');
        return;
      }

      const status = this.getLicenseStatus();
      const message = `License Status
Status: ${status.status.toUpperCase()}
Enabled: ${status.enabled ? 'Yes' : 'No'}`;

      this.telegramBot!.sendMessage(msg.chat.id, message);
    });

    // /enable command - Enable license
    this.telegramBot.onText(/\/enable/, (msg) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        this.telegramBot!.sendMessage(msg.chat.id, 'Unauthorized');
        return;
      }

      this.licenseEnabled = true;
      this.telegramBot!.sendMessage(msg.chat.id, 'License enabled');
      logger.info(`License enabled via Telegram by chat ID: ${msg.chat.id}`);
    });

    // /disable command - Disable license
    this.telegramBot.onText(/\/disable/, (msg) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        this.telegramBot!.sendMessage(msg.chat.id, 'Unauthorized');
        return;
      }

      this.licenseEnabled = false;
      this.telegramBot!.sendMessage(msg.chat.id, 'License disabled');
      logger.info(`License disabled via Telegram by chat ID: ${msg.chat.id}`);
    });

    // /analytics command - Get system analytics
    this.telegramBot.onText(/\/analytics/, async (msg) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        this.telegramBot!.sendMessage(msg.chat.id, 'Unauthorized');
        return;
      }

      try {
        // Get platform analytics (this will be for the superadmin tenant or aggregated)
        // For now, we'll show basic system stats since we don't have tenant context here
        const uptime = process.uptime();
        const uptimeFormatted = this.formatTime(uptime);

        const analyticsMessage = `System Analytics

Uptime: ${uptimeFormatted}
Platform: ${os.platform()} ${os.arch()}
Memory: ${this.formatBytes(os.totalmem() - os.freemem())} / ${this.formatBytes(os.totalmem())} used
CPU Cores: ${os.cpus().length}
System Time: ${new Date().toLocaleString()}`;

        this.telegramBot!.sendMessage(msg.chat.id, analyticsMessage);
      } catch (error) {
        logger.error('Error getting analytics:', error);
        this.telegramBot!.sendMessage(msg.chat.id, 'Failed to get analytics');
      }
    });

    // /system command - Get OS/system details
    this.telegramBot.onText(/\/system/, (msg) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        this.telegramBot!.sendMessage(msg.chat.id, 'Unauthorized');
        return;
      }

      const systemInfo = `System Information:
OS: ${os.type()} ${os.release()}
Platform: ${os.platform()}
Architecture: ${os.arch()}
CPU Cores: ${os.cpus().length}
Total Memory: ${this.formatBytes(os.totalmem())}
Free Memory: ${this.formatBytes(os.freemem())}
Uptime: ${this.formatTime(os.uptime())}
Node.js: ${process.version}
PID: ${process.pid}`;

      this.telegramBot!.sendMessage(msg.chat.id, systemInfo);
    });

    // /tenants command - Get tenant analytics
    this.telegramBot.onText(/\/tenants/, async (msg) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        this.telegramBot!.sendMessage(msg.chat.id, 'Unauthorized');
        return;
      }

      try {
        // Get platform analytics which includes tenant analytics
        const SuperAdminService = (await import('./superadmin.service')).SuperAdminService;
        const superAdminService = new SuperAdminService();
        const platformAnalytics = await superAdminService.getPlatformAnalytics();

        const tenantsMessage = `Platform Analytics

Tenants:
- Total: ${platformAnalytics.tenants.total}
- Active: ${platformAnalytics.tenants.active}
- Inactive: ${platformAnalytics.tenants.inactive}

Users:
- Total: ${platformAnalytics.users.total}
- Active: ${platformAnalytics.users.active}
- Admins: ${platformAnalytics.users.admins}
- Waiters: ${platformAnalytics.users.waiters}

Service Requests:
- Total: ${platformAnalytics.requests.total}
- Pending: ${platformAnalytics.requests.pending}
- Completed: ${platformAnalytics.requests.completed}

Tables:
- Total: ${platformAnalytics.tables.total}
- Active: ${platformAnalytics.tables.active}

Subscriptions:
- Total: ${platformAnalytics.subscriptions.total}
- Active: ${platformAnalytics.subscriptions.active}
- Expired: ${platformAnalytics.subscriptions.expired}`;

        this.telegramBot!.sendMessage(msg.chat.id, tenantsMessage);
      } catch (error) {
        logger.error('Error getting tenant analytics:', error);
        this.telegramBot!.sendMessage(msg.chat.id, 'Failed to get tenant analytics');
      }
    });

    // /help command - Show available commands
    this.telegramBot.onText(/\/help/, (msg) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        this.telegramBot!.sendMessage(msg.chat.id, 'Unauthorized');
        return;
      }

      const helpMessage = `License Control Bot Commands

/status - Get current license status
/enable - Enable license
/disable - Disable license
/analytics - Get system analytics
/system - Get system/OS information
/tenants - Get tenant analytics overview
/help - Show this help message

Notes:
- All commands require admin authorization`;

      this.telegramBot!.sendMessage(msg.chat.id, helpMessage);
    });

    // Handle errors
    this.telegramBot.on('polling_error', (error) => {
      logger.error('Telegram bot polling error:', error);
    });

    logger.info(`🤖 Telegram bot commands set up for ${config.telegram.adminChatIds.length} admin(s)`);
  }

  /**
   * Gets feature flags (not available in simple mode)
   */
  getFeatureFlags(): Record<string, boolean> | null {
    return null;
  }

  /**
   * Gets validation schemas (not available in simple mode)
   */
  getValidationSchemas(): Record<string, any> | null {
    return null;
  }

  /**
   * Gets form engines (not available in simple mode)
   */
  getFormEngines(): Record<string, any> | null {
    return null;
  }

  /**
   * Gets runtime token (not available in simple mode)
   */
  getRuntimeToken(): string | null {
    return null;
  }

  /**
   * Gets dynamic configuration (not available in simple mode)
   */
  async getDynamicConfig(): Promise<Record<string, any> | null> {
    return null;
  }

  /**
   * Forces revalidation (no-op in simple mode)
   */
  async forceRevalidate(): Promise<boolean> {
    return this.licenseEnabled;
  }

  /**
   * Checks if a chat ID is authorized as admin
   */
  private isAdmin(chatId: string): boolean {
    return config.telegram.adminChatIds.includes(chatId);
  }

  /**
   * Formats uptime in seconds to a human-readable string
   */
  private formatTime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

    return parts.join(' ');
  }

  /**
   * Formats bytes to a human-readable string
   */
  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = Math.round(bytes / Math.pow(1024, i) * 100) / 100;
    return `${size} ${sizes[i]}`;
  }

  /**
   * Splits a long message into parts that fit within Telegram's message limit
   */
  private splitMessage(message: string, maxLength: number = 4000): string[] {
    const parts: string[] = [];
    let currentPart = '';

    const lines = message.split('\n');

    for (const line of lines) {
      if ((currentPart + line + '\n').length > maxLength) {
        if (currentPart) {
          parts.push(currentPart.trim());
          currentPart = '';
        }
      }
      currentPart += line + '\n';
    }

    if (currentPart) {
      parts.push(currentPart.trim());
    }

    return parts;
  }
}

// Export singleton instance
export const licenseService = new LicenseService();
export default licenseService;