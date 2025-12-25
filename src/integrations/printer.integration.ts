import logger from '../utils/logger';
import type { PrinterIntegration as PrinterConfig } from '../services/integration.service';
import { pcAgentRegistry } from '../services/pc-agent-registry.service';
import { randomUUID } from 'crypto';

/**
 * XPrinter Network Printer Integration
 * Sends ESC/POS commands to network thermal printers (same as POS systems)
 * 
 * Printing Method:
 * - Uses ESC/POS buffer commands for ALL languages (English, Arabic, and both)
 * - Direct ESC/POS commands provide superior print quality
 * - Supports PC864 (codepage 63) for Arabic text based on printer self-test
 * - Fast and reliable printing without browser dependencies
 * 
 * Arabic Codepage Options (from printer self-test):
 * - Codepage 22 (0x16): Windows-1256 Arabic
 * - Codepage 63 (0x3F): PC864 Arabic (Currently Used) ✓
 * - Codepage 82 (0x52): PC1001 Arabic (Alternative)
 */
export class XPrinterIntegration {
  /**
   * Print a service request receipt
   */
  async printRequest(
    printerConfig: PrinterConfig,
    requestData: {
      tableNumber: string;
      requestType: string;
      requestTypeNameEn?: string;
      requestTypeNameAr?: string;
      customNote?: string;
      timestamp: Date;
      restaurantName?: string;
      restaurantAddress?: string;
      restaurantPhone?: string;
    },
    tenantId: string,
  ): Promise<void> {
    if (!printerConfig.enabled) {
      logger.debug('Printer integration is disabled, skipping print');
      return;
    }

    try {
      let commands: Buffer[] = [];

      // Use buffer-based printing for ALL languages (better quality, faster, more reliable)
      // ESC/POS supports multiple character encodings including Arabic/Persian
      if (printerConfig.language === 'both') {
        // Print both English and Arabic versions
        const englishCommands = this.buildReceiptCommands(printerConfig, requestData, 'en');
        const arabicCommands = this.buildReceiptCommands(printerConfig, requestData, 'ar');
        commands = [englishCommands, arabicCommands];
      } else if (printerConfig.language === 'ar') {
        // Arabic only
        const arabicCommands = this.buildReceiptCommands(printerConfig, requestData, 'ar');
        commands = [arabicCommands];
      } else {
        // English only (default)
        const englishCommands = this.buildReceiptCommands(printerConfig, requestData, 'en');
        commands = [englishCommands];
      }

      // Send each receipt to printer via PC Agent (ONLY method)
      // PC Agent connects to backend via Socket.IO (reverse connection)
      for (const commandBuffer of commands) {
        await this.sendToPcAgent(printerConfig, commandBuffer, tenantId);
        // Small delay between receipts if printing multiple
        if (commands.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      logger.info(`Printed request receipt for table ${requestData.tableNumber}`, {
        language: printerConfig.language,
        receiptsCount: commands.length,
      });
    } catch (error) {
      logger.error('Error printing request receipt:', error);
      // Don't throw - we don't want printing failures to break the request flow
    }
  }

  /**
   * Build ESC/POS commands for receipt
   * Supports both English and Arabic with proper character encoding
   */
  private buildReceiptCommands(
    config: PrinterConfig,
    data: {
      tableNumber: string;
      requestType: string;
      requestTypeNameEn?: string;
      requestTypeNameAr?: string;
      customNote?: string;
      timestamp: Date;
      restaurantName?: string;
      restaurantAddress?: string;
      restaurantPhone?: string;
    },
    language: 'en' | 'ar' = 'en',
  ): Buffer {
    const commands: number[] = [];
    const isArabic = language === 'ar';

    // Initialize printer
    commands.push(0x1b, 0x40); // ESC @ - Initialize printer

    // Set character encoding
    if (isArabic) {
      // Use PC864 (Arabic) character encoding based on printer self-test
      // Available Arabic codepages from self-test:
      //   - Codepage 22 (0x16): Windows-1256 Arabic
      //   - Codepage 63 (0x3F): PC864 Arabic ← Using this (most common)
      //   - Codepage 82 (0x52): PC1001 Arabic (alternative)
      commands.push(0x1b, 0x74, 0x3F); // ESC t 63 - Select character code table 63 (PC864)
    } else {
      // Use ASCII/Latin1 for English
      commands.push(0x1b, 0x74, 0x00); // ESC t 0 - Select character code table 0 (ASCII)
    }

    // Set larger font size for better readability (double height and width)
    commands.push(0x1b, 0x21, 0x30); // ESC ! 0x30 - Double height and width

    // Add top margin/padding
    commands.push(0x0a, 0x0a); // Two line feeds for top padding

    // Set text direction for Arabic (right-to-left)
    if (isArabic) {
      commands.push(0x1b, 0x61, 0x02); // ESC a 2 - Right alignment for RTL
    }

    // Header (if enabled)
    if (config.printHeader) {
      // Center align
      commands.push(0x1b, 0x61, 0x01); // ESC a 1 - Center alignment

      if (data.restaurantName) {
        const restaurantName = isArabic ? data.restaurantName : data.restaurantName.toUpperCase();
        commands.push(...this.textToBytes(restaurantName));
        commands.push(0x0a, 0x0a);
      }

      if (data.restaurantAddress) {
        commands.push(...this.textToBytes(data.restaurantAddress));
        commands.push(0x0a, 0x0a);
      }

      if (data.restaurantPhone) {
        const phoneLabel = isArabic ? 'الهاتف: ' : 'Phone: ';
        commands.push(...this.textToBytes(`${phoneLabel}${data.restaurantPhone}`));
        commands.push(0x0a, 0x0a);
      }

      commands.push(0x1b, 0x61, isArabic ? 0x02 : 0x00);
      commands.push(0x0a);
      commands.push(...this.textToBytes('======================='));
      commands.push(0x0a, 0x0a);
    }

    commands.push(0x1b, 0x61, 0x01); // Center align
    commands.push(0x1b, 0x45, 0x01); // Bold on
    const orderHeader = isArabic ? '*** طلب جديد ***' : '*** NEW ORDER ***';
    commands.push(...this.textToBytes(orderHeader));
    commands.push(0x1b, 0x45, 0x00); // Bold off
    commands.push(0x0a, 0x0a, 0x0a);

    const timeStr = `${data.timestamp.getHours().toString().padStart(2, '0')}:${data.timestamp.getMinutes().toString().padStart(2, '0')}`;
    commands.push(0x1b, 0x61, isArabic ? 0x02 : 0x00); // Right align for Arabic, left for English
    
    const tableLabel = isArabic ? 'الطاولة: ' : 'Table: ';
    const timeLabel = isArabic ? 'الوقت: ' : 'Time: ';
    
    commands.push(...this.textToBytes(`${tableLabel}${data.tableNumber}`));
    commands.push(0x09, 0x09);
    commands.push(0x1b, 0x21, 0x00); // Normal font size
    commands.push(...this.textToBytes(`${timeLabel}${timeStr}`));
    commands.push(0x1b, 0x21, 0x30); // Double size
    commands.push(0x0a, 0x0a);

    commands.push(...this.textToBytes('======================='));
    commands.push(0x0a, 0x0a);

    commands.push(0x1b, 0x45, 0x01); // Bold on
    const requestTypeLabel = isArabic ? 'نوع الطلب:' : 'REQUEST TYPE:';
    commands.push(...this.textToBytes(requestTypeLabel));
    commands.push(0x1b, 0x45, 0x00); // Bold off
    commands.push(0x0a, 0x0a);
    
    const requestTypeName = isArabic 
      ? (data.requestTypeNameAr || data.requestType)
      : (data.requestTypeNameEn || data.requestType);
    commands.push(...this.textToBytes(`* ${requestTypeName}`));
    commands.push(0x0a, 0x0a);

    if (data.customNote) {
      commands.push(0x1b, 0x45, 0x01); // Bold on
      const noteLabel = isArabic ? 'ملاحظة:' : 'NOTE:';
      commands.push(...this.textToBytes(noteLabel));
      commands.push(0x1b, 0x45, 0x00); // Bold off
      commands.push(0x0a, 0x0a);
      
      commands.push(...this.textToBytes(data.customNote));
      commands.push(0x0a, 0x0a);
    }

    commands.push(0x0a);
    commands.push(...this.textToBytes('======================='));
    commands.push(0x0a, 0x0a);

    if (config.printFooter) {
      commands.push(0x1b, 0x61, 0x01); // Center align
      commands.push(0x1b, 0x45, 0x01); // Bold on
      const thankYou = isArabic ? 'شكراً لك!' : 'THANK YOU!';
      commands.push(...this.textToBytes(thankYou));
      commands.push(0x1b, 0x45, 0x00); // Bold off
      commands.push(0x0a, 0x0a);
      commands.push(...this.textToBytes(data.timestamp.toLocaleString('en-US')));
      commands.push(0x0a, 0x0a);
    }

    // Cut paper with extra feed for margin
    commands.push(0x0a, 0x0a, 0x0a, 0x0a); // Four line feeds for bottom margin
    commands.push(0x1d, 0x56, 0x41, 0x03); // GS V A 3 - Partial cut

    return Buffer.from(commands);
  }

  /**
   * Convert text to bytes using UTF-8 encoding
   * The printer handles character encoding based on the codepage set (PC864 for Arabic, ASCII for English)
   */
  private textToBytes(text: string): number[] {
    return Array.from(Buffer.from(text, 'utf8'));
  }

  /**
   * Send commands to PC Agent via Socket.IO
   * PC Agent is the ONLY method for printer communication (Local Network Bridge)
   * Uses reverse connection: PC Agent connects to backend, backend sends print jobs via Socket.IO
   * 
   * Architecture:
   * Cloud/Web App (Backend) -> Socket.IO -> PC Agent -> TCP Socket -> LAN Printer
   * 
   * This enables SaaS-compatible printing where the server is on a different
   * network than the customer's printer. The PC Agent runs on the customer's
   * local network and connects to the backend via Socket.IO (reverse connection).
   * 
   * Benefits:
   * - No Port Forwarding: PC Agent connects outbound (works through NAT/firewalls)
   * - Scalable: PC Agent handles all printer connections locally
   * - Reliable: Socket.IO provides automatic reconnection
   * - Flexible: PC Agent can manage multiple printers
   * - Secure: Local network isolation
   */
  private async sendToPcAgent(config: PrinterConfig, commands: Buffer, tenantId: string): Promise<void> {
    // Check if PC Agent is connected for this tenant
    const pcAgentSocket = pcAgentRegistry.getAgent(tenantId);
    if (!pcAgentSocket) {
      throw new Error(
        `PC Agent is not connected for tenant: ${tenantId}. ` +
        `Please ensure the PC Agent is running and connected to the backend.`
      );
    }

    try {
      // Convert ESC/POS buffer to base64 for Socket.IO transmission
      const base64Data = commands.toString('base64');
      
      // Generate unique job ID for tracking
      const jobId = randomUUID();
      
      logger.debug(`Sending print request to PC Agent via Socket.IO`, {
        tenantId,
        jobId,
        dataLength: commands.length,
        base64Length: base64Data.length,
      });
      
      // Send print job via Socket.IO and wait for result
      // PC Agent uses default printer from .env file
      const result = await new Promise<{
        success: boolean;
        message: string;
      }>((resolve, reject) => {
        // Set timeout for print job (15 seconds)
        const timeout = setTimeout(() => {
          reject(new Error(`Print job timeout: PC Agent did not respond within 15 seconds`));
        }, 15000);

        // Listen for print result
        const resultHandler = (data: {
          jobId: string;
          success: boolean;
          message: string;
        }) => {
          if (data.jobId === jobId) {
            clearTimeout(timeout);
            pcAgentSocket.off('pc-agent:print-result', resultHandler);
            resolve(data);
          }
        };

        pcAgentSocket.on('pc-agent:print-result', resultHandler);

        // Send print job (PC Agent uses default printer from .env)
        pcAgentSocket.emit('pc-agent:print-job', {
          jobId,
          text: base64Data,
          format: 'base64',
        });
      });

      // Check result
      if (!result.success) {
        throw new Error(`PC Agent print job failed: ${result.message}`);
      }

      logger.info(`Print request sent successfully to PC Agent via Socket.IO`, {
        tenantId,
        jobId,
        dataLength: commands.length,
      });
    } catch (error) {
      // Enhanced error handling
      if (error instanceof Error) {
        // Check if it's a connection error
        if (error.message.includes('not connected')) {
          throw new Error(
            `PC Agent is not connected for tenant: ${tenantId}. ` +
            `Please ensure the PC Agent is running and connected to the backend.`
          );
        }
        throw error;
      }
      
      // Fallback for unknown error types
      throw new Error(`Unexpected error communicating with PC Agent: ${String(error)}`);
    }
  }


  /**
   * Test printer connection via PC Agent
   * PC Agent is the ONLY method for printer communication
   */
  async testPrint(printerConfig: PrinterConfig, tenantId: string): Promise<void> {
    if (!printerConfig.enabled) {
      throw new Error('Printer integration is disabled');
    }

    // Check if PC Agent is connected
    if (!pcAgentRegistry.isConnected(tenantId)) {
      throw new Error(
        `PC Agent is not connected for tenant: ${tenantId}. ` +
        `Please ensure the PC Agent is running and connected to the backend.`
      );
    }

    const testData = {
      tableNumber: 'TEST',
      requestType: 'test',
      requestTypeNameEn: 'Test Print',
      requestTypeNameAr: 'طباعة تجريبية',
      timestamp: new Date(),
      restaurantName: 'Test Restaurant',
      restaurantAddress: '123 Test Street',
      restaurantPhone: '+1234567890',
    };

    await this.printRequest(printerConfig, testData, tenantId);
  }
}

export const printerIntegration = new XPrinterIntegration();
