import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/environment';
import logger from '../utils/logger';
import * as os from 'os';
import { AnalyticsService } from './analytics.service';
import { db } from '../database/db';
import { tenants } from '../database/schema';
import { eq } from 'drizzle-orm';

class LicenseService {
  private globalLicenseEnabled: boolean = true; // Global system license (fallback)
  private telegramBot?: TelegramBot;
  private analyticsService: AnalyticsService;

  constructor() {
    this.analyticsService = new AnalyticsService();
    // Initialize Telegram bot if token is provided
    const botToken = config.telegram.botToken;
    if (botToken) {
      this.telegramBot = new TelegramBot(botToken, { polling: true });
      this.setupTelegramCommands();
      logger.info('🤖 Telegram bot initialized for per-tenant license control');
    } else {
      logger.warn('⚠️ Telegram bot token not provided, bot control disabled');
    }
  }

  /**
   * Validates license for a specific tenant
   */
  async validateLicense(tenantId?: string): Promise<boolean> {
    // If no tenant specified, return global status
    if (!tenantId) {
      return this.globalLicenseEnabled;
    }

    try {
      // Check tenant-specific license status
      const [tenant] = await db
        .select({ licenseEnabled: tenants.licenseEnabled })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!tenant) {
        logger.warn(`Tenant ${tenantId} not found for license validation`);
        return false;
      }

      return tenant.licenseEnabled;
    } catch (error) {
      logger.error('Error validating tenant license:', error);
      return false;
    }
  }

  /**
   * Checks if license is currently enabled for a tenant
   */
  async isLicenseValid(tenantId?: string): Promise<boolean> {
    return this.validateLicense(tenantId);
  }

  /**
   * Gets license status for health checks (global or tenant-specific)
   */
  async getLicenseStatus(tenantId?: string): Promise<{ status: string; enabled: boolean }> {
    const enabled = await this.validateLicense(tenantId);
    return {
      status: enabled ? 'active' : 'disabled',
      enabled,
    };
  }

  /**
   * Enable license for a specific tenant
   */
  async enableTenantLicense(tenantId: string): Promise<boolean> {
    try {
      await db
        .update(tenants)
        .set({ licenseEnabled: true })
        .where(eq(tenants.id, tenantId));
      
      logger.info(`License enabled for tenant: ${tenantId}`);
      return true;
    } catch (error) {
      logger.error(`Error enabling license for tenant ${tenantId}:`, error);
      return false;
    }
  }

  /**
   * Disable license for a specific tenant
   */
  async disableTenantLicense(tenantId: string): Promise<boolean> {
    try {
      await db
        .update(tenants)
        .set({ licenseEnabled: false })
        .where(eq(tenants.id, tenantId));
      
      logger.info(`License disabled for tenant: ${tenantId}`);
      return true;
    } catch (error) {
      logger.error(`Error disabling license for tenant ${tenantId}:`, error);
      return false;
    }
  }

  /**
   * Get all tenants with their license status
   */
  async getAllTenantsLicenseStatus(): Promise<Array<{ id: string; name: string; subdomain: string | null; licenseEnabled: boolean }>> {
    try {
      const allTenants = await db
        .select({
          id: tenants.id,
          name: tenants.name,
          subdomain: tenants.subdomain,
          licenseEnabled: tenants.licenseEnabled,
        })
        .from(tenants);
      
      return allTenants;
    } catch (error) {
      logger.error('Error getting tenants license status:', error);
      return [];
    }
  }

  /**
   * Sets up Telegram bot commands for per-tenant license control
   */
  private setupTelegramCommands(): void {
    if (!this.telegramBot) return;

    // Log all incoming messages for chat ID discovery
    this.telegramBot.on('message', (msg) => {
      logger.info(`🤖 Telegram message from chat ID: ${msg.chat.id}, username: ${msg.from?.username || 'unknown'}, text: "${msg.text}"`);
    });

    // /list command - List all tenants with their license status
    this.telegramBot.onText(/\/list/, async (msg) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        await this.safeSendMessage(msg.chat.id, 'Unauthorized');
        return;
      }

      try {
        const tenantsList = await this.getAllTenantsLicenseStatus();
        
        if (tenantsList.length === 0) {
          await this.safeSendMessage(msg.chat.id, 'No tenants found');
          return;
        }

        let message = `📋 All Tenants (${tenantsList.length}):\n\n`;
        
        for (const tenant of tenantsList) {
          const status = tenant.licenseEnabled ? '✅ Enabled' : '❌ Disabled';
          const subdomain = tenant.subdomain || 'N/A';
          message += `• ${tenant.name}\n`;
          message += `  ID: ${tenant.id}\n`;
          message += `  Subdomain: ${subdomain}\n`;
          message += `  Status: ${status}\n\n`;
        }

        // Split message if too long
        const parts = this.splitMessage(message);
        for (const part of parts) {
          await this.safeSendMessage(msg.chat.id, part);
        }
      } catch (error) {
        logger.error('Error listing tenants:', error);
        await this.safeSendMessage(msg.chat.id, 'Failed to list tenants');
      }
    });

    // /status <tenant_id> command - Get license status for a specific tenant
    this.telegramBot.onText(/\/status(?:\s+(.+))?/, async (msg, match) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        await this.safeSendMessage(msg.chat.id, 'Unauthorized');
        return;
      }

      const tenantId = match?.[1]?.trim();
      
      if (!tenantId) {
        await this.safeSendMessage(msg.chat.id, 'Usage: /status <tenant_id>\nUse /list to see all tenant IDs');
        return;
      }

      try {
        const status = await this.getLicenseStatus(tenantId);
        const message = `License Status for Tenant\n\nTenant ID: ${tenantId}\nStatus: ${status.status.toUpperCase()}\nEnabled: ${status.enabled ? 'Yes ✅' : 'No ❌'}`;
        await this.safeSendMessage(msg.chat.id, message);
      } catch (error) {
        logger.error('Error getting tenant status:', error);
        await this.safeSendMessage(msg.chat.id, 'Failed to get tenant status');
      }
    });

    // /enable <tenant_id> command - Enable license for a specific tenant
    this.telegramBot.onText(/\/enable(?:\s+(.+))?/, async (msg, match) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        await this.safeSendMessage(msg.chat.id, 'Unauthorized');
        return;
      }

      const tenantId = match?.[1]?.trim();
      
      if (!tenantId) {
        await this.safeSendMessage(msg.chat.id, 'Usage: /enable <tenant_id>\nUse /list to see all tenant IDs');
        return;
      }

      try {
        const success = await this.enableTenantLicense(tenantId);
        if (success) {
          await this.safeSendMessage(msg.chat.id, `✅ License enabled for tenant: ${tenantId}`);
          logger.info(`License enabled for tenant ${tenantId} via Telegram by chat ID: ${msg.chat.id}`);
        } else {
          await this.safeSendMessage(msg.chat.id, `❌ Failed to enable license for tenant: ${tenantId}`);
        }
      } catch (error) {
        logger.error('Error enabling tenant license:', error);
        await this.safeSendMessage(msg.chat.id, 'Failed to enable tenant license');
      }
    });

    // /disable <tenant_id> command - Disable license for a specific tenant
    this.telegramBot.onText(/\/disable(?:\s+(.+))?/, async (msg, match) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        await this.safeSendMessage(msg.chat.id, 'Unauthorized');
        return;
      }

      const tenantId = match?.[1]?.trim();
      
      if (!tenantId) {
        await this.safeSendMessage(msg.chat.id, 'Usage: /disable <tenant_id>\nUse /list to see all tenant IDs');
        return;
      }

      try {
        const success = await this.disableTenantLicense(tenantId);
        if (success) {
          await this.safeSendMessage(msg.chat.id, `❌ License disabled for tenant: ${tenantId}`);
          logger.info(`License disabled for tenant ${tenantId} via Telegram by chat ID: ${msg.chat.id}`);
        } else {
          await this.safeSendMessage(msg.chat.id, `❌ Failed to disable license for tenant: ${tenantId}`);
        }
      } catch (error) {
        logger.error('Error disabling tenant license:', error);
        await this.safeSendMessage(msg.chat.id, 'Failed to disable tenant license');
      }
    });

    // /analytics command - Get system analytics
    this.telegramBot.onText(/\/analytics/, async (msg) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        await this.safeSendMessage(msg.chat.id, 'Unauthorized');
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

        await this.safeSendMessage(msg.chat.id, analyticsMessage);
      } catch (error) {
        logger.error('Error getting analytics:', error);
        await this.safeSendMessage(msg.chat.id, 'Failed to get analytics');
      }
    });

    // /system command - Get OS/system details
    this.telegramBot.onText(/\/system/, async (msg) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        await this.safeSendMessage(msg.chat.id, 'Unauthorized');
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

      await this.safeSendMessage(msg.chat.id, systemInfo);
    });

    // /tenants command - Get tenant analytics
    this.telegramBot.onText(/\/tenants/, async (msg) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        await this.safeSendMessage(msg.chat.id, 'Unauthorized');
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

        await this.safeSendMessage(msg.chat.id, tenantsMessage);
      } catch (error) {
        logger.error('Error getting tenant analytics:', error);
        await this.safeSendMessage(msg.chat.id, 'Failed to get tenant analytics');
      }
    });

    // /help command - Show available commands
    this.telegramBot.onText(/\/help/, async (msg) => {
      if (!this.isAdmin(msg.chat.id.toString())) {
        await this.safeSendMessage(msg.chat.id, 'Unauthorized');
        return;
      }

      const helpMessage = `🤖 Per-Tenant License Control Bot

📋 Tenant Management:
/list - List all tenants with license status
/status <tenant_id> - Get license status for a tenant
/enable <tenant_id> - Enable license for a tenant
/disable <tenant_id> - Disable license for a tenant

📊 Analytics & System:
/analytics - Get system analytics
/system - Get system/OS information
/tenants - Get tenant analytics overview
/help - Show this help message

💡 Usage Examples:
/list
/status abc-123-def-456
/enable abc-123-def-456
/disable abc-123-def-456

⚠️ Notes:
- All commands require admin authorization
- Use /list to get tenant IDs
- License control is now per-tenant`;

      await this.safeSendMessage(msg.chat.id, helpMessage);
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
  getValidationSchemas(): Record<string, unknown> | null {
    return null;
  }

  /**
   * Gets form engines (not available in simple mode)
   */
  getFormEngines(): Record<string, unknown> | null {
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
  async getDynamicConfig(): Promise<Record<string, unknown> | null> {
    return null;
  }

  /**
   * Forces revalidation for a tenant
   */
  async forceRevalidate(tenantId?: string): Promise<boolean> {
    return this.validateLicense(tenantId);
  }

  /**
   * Safely send a Telegram message with error handling
   */
  private async safeSendMessage(chatId: number, message: string): Promise<void> {
    if (!this.telegramBot) return;
    
    try {
      await this.telegramBot.sendMessage(chatId, message);
    } catch (error) {
      logger.error(`Failed to send Telegram message to chat ${chatId}:`, error);
      // Don't throw - we want to continue even if Telegram fails
    }
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