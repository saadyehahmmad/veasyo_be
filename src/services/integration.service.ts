import { db } from '../database/db';
import { tenants } from '../database/schema';
import { eq } from 'drizzle-orm';
import logger from '../utils/logger';

// Integration settings interfaces
export interface PrinterIntegration {
  enabled: boolean;
  printerIp: string;
  printerPort: number;
  printerName?: string;
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
 */
export class IntegrationService {
  /**
   * Get integration settings for a tenant
   */
  async getIntegrations(tenantId: string): Promise<IntegrationSettings> {
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

      logger.debug(`Retrieved integrations for tenant ${tenantId}`, { integrations });
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

      logger.info(`Updated integrations for tenant ${tenantId}`, { updatedIntegrations });
      return updatedIntegrations;
    } catch (error) {
      logger.error(`Error updating integrations for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Get printer integration settings
   */
  async getPrinterIntegration(tenantId: string): Promise<PrinterIntegration | null> {
    const integrations = await this.getIntegrations(tenantId);
    return integrations.printer || null;
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
      printerIp: '',
      printerPort: 9100,
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

    logger.debug(`Updating printer integration for tenant ${tenantId}`, { currentPrinter, printerData, updatedPrinter });

    await this.updateIntegrations(tenantId, { printer: updatedPrinter });
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
}

