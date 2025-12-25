import logger from '../utils/logger';
import type { PrinterIntegration as PrinterConfig } from '../services/integration.service';
import { pcAgentRegistry } from '../services/pc-agent-registry.service';
import { randomUUID } from 'crypto';
import { createCanvas, Canvas } from 'canvas';

/**
 * XPrinter Network Printer Integration
 * Sends ESC/POS commands to network thermal printers (same as POS systems)
 * 
 * Printing Method:
 * - English: Uses direct ESC/POS text commands (fast, efficient)
 * - Arabic: Renders text as image and prints as bitmap (perfect rendering, no encoding issues)
 * - Both: Prints English as text, Arabic as image
 * 
 * Why Image-Based for Arabic?
 * - Bypasses all character encoding/code page issues
 * - Perfect Arabic rendering with proper fonts
 * - Works with all thermal printers (no font support required)
 * - Handles RTL (right-to-left) text correctly
 */
export class XPrinterIntegration {
  /**
   * Print a service request receipt
   * Uses image-based printing for Arabic (perfect rendering, no encoding issues)
   * Uses text-based printing for English (fast and efficient)
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

      // NEW APPROACH: Use image-based printing for Arabic (like Android app)
      // This bypasses ALL character encoding issues and produces perfect results
      if (printerConfig.language === 'both') {
        // Print both English (text) and Arabic (image) versions
        const englishCommands = this.buildReceiptCommands(printerConfig, requestData, 'en');
        const arabicCommands = await this.buildReceiptCommandsAsImage(printerConfig, requestData, 'ar');
        commands = [englishCommands, arabicCommands];
      } else if (printerConfig.language === 'ar') {
        // Arabic only (image-based)
        const arabicCommands = await this.buildReceiptCommandsAsImage(printerConfig, requestData, 'ar');
        commands = [arabicCommands];
      } else {
        // English only (text-based, fast)
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
        method: printerConfig.language === 'en' ? 'text-based' : 'image-based',
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

    // Cut paper before printing (prepare fresh paper)
    commands.push(0x1d, 0x56, 0x41, 0x03); // GS V A 3 - Partial cut
    
    // Beep/alarm before printing (alert staff)
    commands.push(0x1b, 0x42, 0x03, 0x01); // ESC B n t - Beep 3 times, 100ms each
    
    // Initialize printer
    commands.push(0x1b, 0x40); // ESC @ - Initialize printer

    // Set character encoding
    if (isArabic) {
      // Use Windows-1256 (Arabic) character encoding based on printer self-test
      // Available Arabic codepages from self-test:
      //   - Codepage 22 (0x16): Windows-1256 Arabic ← Currently trying this
      //   - Codepage 34 (0x22): PC864 Arabic (most common)
      //   - Codepage 47 (0x2F): WPC1256 Arabic (Windows standard)
      //   - Codepage 82 (0x52): PC1001 Arabic (alternative)
      // Use the Debug Arabic button to test all code tables and find the best one
      commands.push(0x1b, 0x74, 0x16); // ESC t 0x16 - Select character code table 22 (Windows-1256)
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

    // Bottom margin
    commands.push(0x0a, 0x0a, 0x0a, 0x0a); // Four line feeds for bottom margin
    
    // Beep/alarm after printing (alert staff that print is complete)
    commands.push(0x1b, 0x42, 0x05, 0x01); // ESC B n t - Beep 5 times, 100ms each
    
    // Cut paper after printing
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
   * Build ESC/POS commands for receipt using IMAGE-BASED printing for Arabic
   * This method renders text as an image and converts it to ESC/POS bitmap commands
   * Perfect for Arabic text - bypasses all character encoding issues!
   * 
   * Based on Android AsyncEscPosPrinter approach - renders to bitmap then prints as image
   */
  private async buildReceiptCommandsAsImage(
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
  ): Promise<Buffer> {
    const isArabic = language === 'ar';
    
    // Receipt dimensions (for 58mm thermal printer)
    const paperWidthMM = 58;
    const printerDPI = 203; // Standard thermal printer DPI
    const paperWidthPixels = Math.floor((paperWidthMM / 25.4) * printerDPI); // ~465 pixels
    
    // Estimate height needed - increased for larger fonts
    const estimatedHeight = 1200; // Will be trimmed after rendering
    
    // Create canvas
    const canvas = createCanvas(paperWidthPixels, estimatedHeight);
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, paperWidthPixels, estimatedHeight);
    
    // Black text
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    let yPos = 20; // Top margin
    
    // Font sizes - Much larger for Arabic text (48px bold for main content)
    const massiveFontSize = 48;      // Main content (table number, request type)
    const extraLargeFontSize = 40;   // Headers and important text
    const largeFontSize = 36;        // Secondary content
    const normalFontSize = 32;       // Separators and labels
    const smallFontSize = 28;        // Timestamps
    
    // Line heights - Increased spacing for readability
    const massiveLineHeight = massiveFontSize + 20;
    const extraLargeLineHeight = extraLargeFontSize + 18;
    const largeLineHeight = largeFontSize + 15;
    const normalLineHeight = normalFontSize + 12;
    const smallLineHeight = smallFontSize + 10;
    
    // Helper to draw text - Always use bold for better clarity
    const drawText = (text: string, fontSize: number, lineHeight: number, align: 'left' | 'center' | 'right' = 'center') => {
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      
      let x = paperWidthPixels / 2; // Center by default
      if (align === 'left') {
        ctx.textAlign = 'left';
        x = 10;
      } else if (align === 'right') {
        ctx.textAlign = 'right';
        x = paperWidthPixels - 10;
      } else {
        ctx.textAlign = 'center';
      }
      
      ctx.fillText(text, x, yPos);
      yPos += lineHeight;
    };
    
    const drawSeparator = () => {
      drawText('=======================', normalFontSize, normalLineHeight);
    };
    
    // Header
    if (config.printHeader) {
      if (data.restaurantName) {
        drawText(data.restaurantName.toUpperCase(), extraLargeFontSize, extraLargeLineHeight);
      }
      if (data.restaurantAddress) {
        drawText(data.restaurantAddress, normalFontSize, normalLineHeight);
      }
      if (data.restaurantPhone) {
        const phoneLabel = isArabic ? 'الهاتف: ' : 'Phone: ';
        drawText(`${phoneLabel}${data.restaurantPhone}`, normalFontSize, normalLineHeight);
      }
      yPos += 15;
      drawSeparator();
      yPos += 15;
    }
    
    // Order header - Extra Large Bold
    drawText(isArabic ? '*** طلب جديد ***' : '*** NEW ORDER ***', extraLargeFontSize, extraLargeLineHeight);
    yPos += 20;
    
    // Table and time - MASSIVE font for table number
    const timeStr = `${data.timestamp.getHours().toString().padStart(2, '0')}:${data.timestamp.getMinutes().toString().padStart(2, '0')}`;
    const tableLabel = isArabic ? 'الطاولة: ' : 'Table: ';
    const timeLabel = isArabic ? 'الوقت: ' : 'Time: ';
    
    drawText(`${tableLabel}${data.tableNumber}`, massiveFontSize, massiveLineHeight, isArabic ? 'right' : 'left');
    drawText(`${timeLabel}${timeStr}`, largeFontSize, largeLineHeight, isArabic ? 'right' : 'left');
    yPos += 20;
    
    drawSeparator();
    yPos += 20;
    
    // Request type - MASSIVE font for request type
    const requestTypeLabel = isArabic ? 'نوع الطلب:' : 'REQUEST TYPE:';
    drawText(requestTypeLabel, largeFontSize, largeLineHeight);
    
    const requestTypeName = isArabic 
      ? (data.requestTypeNameAr || data.requestType)
      : (data.requestTypeNameEn || data.requestType);
    drawText(`* ${requestTypeName}`, massiveFontSize, massiveLineHeight);
    yPos += 20;
    
    // Custom note - MASSIVE font for custom notes
    if (data.customNote) {
      const noteLabel = isArabic ? 'ملاحظة:' : 'NOTE:';
      drawText(noteLabel, largeFontSize, largeLineHeight);
      drawText(data.customNote, massiveFontSize, massiveLineHeight);
      yPos += 20;
    }
    
    drawSeparator();
    yPos += 20;
    
    // Footer
    if (config.printFooter) {
      const thankYou = isArabic ? 'شكراً لك!' : 'THANK YOU!';
      drawText(thankYou, extraLargeFontSize, extraLargeLineHeight);
      drawText(data.timestamp.toLocaleString('en-US'), smallFontSize, smallLineHeight);
      yPos += 15;
    }
    
    // Trim canvas to actual content height
    const trimmedHeight = yPos + 40; // Add bottom margin
    const trimmedCanvas = createCanvas(paperWidthPixels, trimmedHeight);
    const trimmedCtx = trimmedCanvas.getContext('2d');
    trimmedCtx.drawImage(canvas, 0, 0);
    
    // Convert canvas to ESC/POS bitmap commands
    return this.canvasToEscPosCommands(trimmedCanvas, paperWidthPixels);
  }

  /**
   * Convert canvas to ESC/POS bitmap commands
   * Splits image into 256-pixel-high chunks (ESC/POS limitation)
   * Based on Android PrinterTextParserImg.bitmapToHexadecimalString approach
   */
  private canvasToEscPosCommands(canvas: Canvas, width: number): Buffer {
    const commands: number[] = [];
    const height = canvas.height;
    
    // Beep/alarm before printing (alert staff)
    commands.push(0x1b, 0x42, 0x03, 0x01); // ESC B n t - Beep 3 times, 100ms each
    
    // Initialize printer
    commands.push(0x1b, 0x40); // ESC @ - Initialize printer
    
    // Center alignment
    commands.push(0x1b, 0x61, 0x01); // ESC a 1 - Center
    
    // Process image in 256-pixel-high chunks
    for (let y = 0; y < height; y += 256) {
      const chunkHeight = Math.min(256, height - y);
      
      // Get image data for this chunk
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, y, width, chunkHeight);
      
      // Convert to monochrome bitmap
      const bitmap = this.imageToBitmap(imageData, width, chunkHeight);
      
      // Add ESC/POS bitmap command
      // GS v 0 - Print raster bitmap
      // m=0 (normal), xL xH (width in bytes), yL yH (height in dots)
      const widthBytes = Math.ceil(width / 8);
      commands.push(0x1d, 0x76, 0x30, 0x00); // GS v 0 0
      commands.push(widthBytes & 0xff, (widthBytes >> 8) & 0xff); // Width in bytes
      commands.push(chunkHeight & 0xff, (chunkHeight >> 8) & 0xff); // Height in dots
      commands.push(...bitmap);
      
      // Line feed between chunks
      commands.push(0x0a);
    }
    
    // Bottom margin
    commands.push(0x0a, 0x0a, 0x0a, 0x0a);
    
    // Beep/alarm after printing (alert staff that print is complete)
    commands.push(0x1b, 0x42, 0x05, 0x01); // ESC B n t - Beep 5 times, 100ms each
    
    // Cut paper after printing
    commands.push(0x1d, 0x56, 0x41, 0x03); // GS V A 3 - Partial cut
    
    return Buffer.from(commands);
  }

  /**
   * Convert ImageData to monochrome bitmap for thermal printer
   * Uses simple thresholding: pixels < 128 = black, >= 128 = white
   */
  private imageToBitmap(imageData: { data: Uint8ClampedArray }, width: number, height: number): number[] {
    const bitmap: number[] = [];
    const widthBytes = Math.ceil(width / 8);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < widthBytes; x++) {
        let byte = 0;
        
        for (let bit = 0; bit < 8; bit++) {
          const pixelX = x * 8 + bit;
          if (pixelX < width) {
            const idx = (y * width + pixelX) * 4;
            // Get grayscale value (simple average)
            const gray = (imageData.data[idx] + imageData.data[idx + 1] + imageData.data[idx + 2]) / 3;
            
            // Threshold: if darker than 128, print black
            if (gray < 128) {
              byte |= (1 << (7 - bit));
            }
          }
        }
        
        bitmap.push(byte);
      }
    }
    
    return bitmap;
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
