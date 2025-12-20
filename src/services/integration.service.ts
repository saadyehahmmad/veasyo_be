import { db } from '../database/db';
import { tenants } from '../database/schema';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger';
import { CacheManager } from '../utils/cache-manager';

// Integration settings interfaces
export interface PrinterIntegration {
  enabled: boolean;
  // PC Agent is the ONLY method for printer communication
  // PC Agent acts as a Local Network Bridge between cloud backend and LAN printers
  // Architecture: Backend (public IP) -> Socket.IO <- PC Agent (connects automatically) -> TCP -> Printer
  // PC Agent connects to backend automatically via Socket.IO - no IP/Port configuration needed
  // Printer is configured in PC Agent's .env file (PRINTER_IP, PRINTER_PORT)
  // Common settings
  printerName?: string; // Friendly name for identification
  paperWidth: number; // 58 or 80 (mm)
  autoPrint: boolean;
  printHeader: boolean;
  printFooter: boolean;
  language: 'en' | 'ar' | 'both'; // Language for printing: English, Arabic, or both
}

export interface SpeakerIntegration {
  enabled: boolean;
  speakerIp: string;
  speakerPort: number;
  volume: number; // 0-100
  duration: number; // seconds
  soundType: 'beep' | 'alert' | 'custom';
  customSoundUrl?: string;
}

export interface WebhookIntegration {
  enabled: boolean;
  webhookUrl: string;
  secretKey?: string;
  events: {
    newRequest: boolean;
    requestAcknowledged: boolean;
    requestCompleted: boolean;
    requestCancelled: boolean;
  };
  retryAttempts: number;
  timeout: number; // milliseconds
}

export interface IntegrationSettings {
  printer?: PrinterIntegration;
  speaker?: SpeakerIntegration;
  webhook?: WebhookIntegration;
}

/**
 * Service for managing tenant integrations (printer, speaker, webhook)
 * Caches integration settings in memory for better performance
 */
export class IntegrationService {
  // Cache for integration settings (per tenant)
  // Configuration:
  // - Max 1000 tenants (should cover all tenants)
  // - TTL: 5 minutes (300000ms) - settings can change, but not frequently
  // - Cleanup interval: 1 minute (60000ms)
  private static integrationCache = new CacheManager<IntegrationSettings>(
    1000, // Max 1000 tenants
    300000, // 5 minutes TTL
    60000, // Cleanup every minute
  );

  /**
   * Get integration settings for a tenant (with caching)
   * Printer settings are cached from database
   */
  async getIntegrations(tenantId: string): Promise<IntegrationSettings> {
    // Check cache first
    const cacheKey = `integrations:${tenantId}`;
    const cached = IntegrationService.integrationCache.get(cacheKey);
    if (cached) {
      logger.debug(`Using cached integration settings for tenant ${tenantId}`);
      return cached;
    }

    // Fetch from database
    try {
      const tenant = await db
        .select({ settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!tenant || tenant.length === 0) {
        logger.warn(`Tenant not found: ${tenantId}`);
        return {};
      }

      const settings = tenant[0].settings as Record<string, unknown> | null;
      const integrations = (settings?.integrations as IntegrationSettings) || {};

      // Cache the integration settings (including private IP addresses)
      IntegrationService.integrationCache.set(cacheKey, integrations);
      logger.debug(`Retrieved and cached integrations for tenant ${tenantId}`, { 
        integrations,
        cached: true,
      });
      return integrations;
    } catch (error) {
      logger.error(`Error getting integrations for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Update integration settings for a tenant
   * Merges new settings with existing settings
   */
  async updateIntegrations(
    tenantId: string,
    integrationData: Partial<IntegrationSettings>,
  ): Promise<IntegrationSettings> {
    try {
      // Get current tenant settings
      const tenant = await db
        .select({ settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!tenant || tenant.length === 0) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }

      const currentSettings = (tenant[0].settings as Record<string, unknown>) || {};
      const currentIntegrations = (currentSettings.integrations as IntegrationSettings) || {};

      // Merge new integration settings with existing ones
      const updatedIntegrations: IntegrationSettings = {
        ...currentIntegrations,
        ...integrationData,
      };

      // Update tenant settings with merged integrations
      const updatedSettings = {
        ...currentSettings,
        integrations: updatedIntegrations,
      };

      // Update database
      await db
        .update(tenants)
        .set({
          settings: updatedSettings,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));

      // Invalidate cache to force refresh on next access
      const cacheKey = `integrations:${tenantId}`;
      IntegrationService.integrationCache.delete(cacheKey);
      logger.info(`Updated integrations for tenant ${tenantId} and invalidated cache`, { 
        updatedIntegrations,
        cacheInvalidated: true,
      });
      return updatedIntegrations;
    } catch (error) {
      logger.error(`Error updating integrations for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Get printer integration settings (with caching)
   * Returns cached printer settings from database
   */
  async getPrinterIntegration(tenantId: string): Promise<PrinterIntegration | null> {
    const integrations = await this.getIntegrations(tenantId);
    const printer = integrations.printer || null;
    
    if (printer) {
      logger.debug(`Retrieved printer integration for tenant ${tenantId}`, {
        enabled: printer.enabled,
        printerName: printer.printerName,
      });
    }
    
    return printer;
  }

  /**
   * Update printer integration settings
   */
  async updatePrinterIntegration(
    tenantId: string,
    printerData: Partial<PrinterIntegration>,
  ): Promise<PrinterIntegration> {
    const integrations = await this.getIntegrations(tenantId);
    const currentPrinter = integrations.printer || {
      enabled: false,
      paperWidth: 80,
      autoPrint: true,
      printHeader: true,
      printFooter: true,
      language: 'both' as 'en' | 'ar' | 'both',
    };

    const updatedPrinter: PrinterIntegration = {
      ...currentPrinter,
      ...printerData,
    };

    logger.debug(`Updating printer integration for tenant ${tenantId}`, { 
      currentPrinter, 
      printerData, 
      updatedPrinter,
    });

    // Update integrations (this will invalidate cache automatically)
    await this.updateIntegrations(tenantId, { printer: updatedPrinter });
    
    logger.info(`Printer integration updated for tenant ${tenantId}`, {
      enabled: updatedPrinter.enabled,
      printerName: updatedPrinter.printerName,
      cacheInvalidated: true,
    });
    
    return updatedPrinter;
  }

  /**
   * Get speaker integration settings
   */
  async getSpeakerIntegration(tenantId: string): Promise<SpeakerIntegration | null> {
    const integrations = await this.getIntegrations(tenantId);
    return integrations.speaker || null;
  }

  /**
   * Update speaker integration settings
   */
  async updateSpeakerIntegration(
    tenantId: string,
    speakerData: Partial<SpeakerIntegration>,
  ): Promise<SpeakerIntegration> {
    const integrations = await this.getIntegrations(tenantId);
    const currentSpeaker = integrations.speaker || {
      enabled: false,
      speakerIp: '',
      speakerPort: 8080,
      volume: 80,
      duration: 5,
      soundType: 'beep',
    };

    const updatedSpeaker: SpeakerIntegration = {
      ...currentSpeaker,
      ...speakerData,
    };

    await this.updateIntegrations(tenantId, { speaker: updatedSpeaker });
    return updatedSpeaker;
  }

  /**
   * Get webhook integration settings
   */
  async getWebhookIntegration(tenantId: string): Promise<WebhookIntegration | null> {
    const integrations = await this.getIntegrations(tenantId);
    return integrations.webhook || null;
  }

  /**
   * Update webhook integration settings
   */
  async updateWebhookIntegration(
    tenantId: string,
    webhookData: Partial<WebhookIntegration>,
  ): Promise<WebhookIntegration> {
    const integrations = await this.getIntegrations(tenantId);
    const currentWebhook = integrations.webhook || {
      enabled: false,
      webhookUrl: '',
      secretKey: '',
      events: {
        newRequest: true,
        requestAcknowledged: true,
        requestCompleted: true,
        requestCancelled: false,
      },
      retryAttempts: 3,
      timeout: 5000,
    };

    const updatedWebhook: WebhookIntegration = {
      ...currentWebhook,
      ...webhookData,
    };

    await this.updateIntegrations(tenantId, { webhook: updatedWebhook });
    return updatedWebhook;
  }

  /**
   * Get cache statistics for monitoring
   */
  static getCacheStats(): ReturnType<CacheManager<IntegrationSettings>['getStats']> {
    return IntegrationService.integrationCache.getStats();
  }

  /**
   * Clear cache for a specific tenant (useful for testing or manual cache invalidation)
   */
  static clearCache(tenantId: string): void {
    const cacheKey = `integrations:${tenantId}`;
    IntegrationService.integrationCache.delete(cacheKey);
    logger.info(`Cleared integration cache for tenant ${tenantId}`);
  }

  /**
   * Clear all integration caches
   */
  static clearAllCaches(): void {
    IntegrationService.integrationCache.clear();
    logger.info('Cleared all integration caches');
  }
}

