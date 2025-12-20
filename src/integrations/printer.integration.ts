import fs from 'fs';
import sharp from 'sharp';
import puppeteer, { Browser, LaunchOptions } from 'puppeteer-core';
import logger from '../utils/logger';
import type { PrinterIntegration as PrinterConfig } from '../services/integration.service';
import { pcAgentRegistry } from '../services/pc-agent-registry.service';
import { randomUUID } from 'crypto';

/**
 * XPrinter Network Printer Integration
 * Sends ESC/POS commands to network thermal printers (same as POS systems)
 */
export class XPrinterIntegration {
  // Reuse browser instance for better performance
  private browserInstance: Browser | null = null;
  private browserLaunchPromise: Promise<Browser> | null = null;
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

      // Use image-based printing for Arabic/Persian to avoid encoding issues
      // This renders the receipt as an image, which completely bypasses character encoding problems
      const useImagePrinting = printerConfig.language === 'ar' || printerConfig.language === 'both';

      if (useImagePrinting) {
        if (printerConfig.language === 'both') {
          // For both languages, use nameEn for English and nameAr for Arabic from database
          const englishData = { 
            ...requestData
          };
          const arabicData = { 
            ...requestData
          };
          const englishImage = await this.buildReceiptImage(printerConfig, englishData, 'en');
          const arabicImage = await this.buildReceiptImage(printerConfig, arabicData, 'ar');
          commands = [englishImage, arabicImage];
        } else {
          // For Arabic only, use nameAr from database
          const arabicData = { 
            ...requestData
          };
          const receiptImage = await this.buildReceiptImage(printerConfig, arabicData, 'ar');
          commands = [receiptImage];
        }
      } else {
        // For English only, use nameEn from database
        const englishData = { 
          ...requestData
        };
        const receiptCommands = this.buildReceiptCommands(printerConfig, englishData);
        commands = [receiptCommands];
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
  ): Buffer {
    const commands: number[] = [];

    // Initialize printer
    commands.push(0x1b, 0x40); // ESC @ - Initialize printer

    // Set character encoding - English only (Arabic uses image-based printing)
    commands.push(0x1b, 0x74, 0x00); // ESC t 0 - Select character code table 0 (ASCII)

    // Set larger font size for better readability (double height and width)
    commands.push(0x1b, 0x21, 0x30); // ESC ! 0x30 - Double height and width

    // Add top margin/padding
    commands.push(0x0a, 0x0a); // Two line feeds for top padding

    // Header (if enabled)
    if (config.printHeader) {
      // Center align
      commands.push(0x1b, 0x61, 0x01); // ESC a 1 - Center alignment

      if (data.restaurantName) {
        commands.push(...this.textToBytes(data.restaurantName.toUpperCase()));
        commands.push(0x0a, 0x0a);
      }

      if (data.restaurantAddress) {
        commands.push(...this.textToBytes(data.restaurantAddress));
        commands.push(0x0a, 0x0a);
      }

      if (data.restaurantPhone) {
        commands.push(...this.textToBytes(`Phone: ${data.restaurantPhone}`));
        commands.push(0x0a, 0x0a);
      }

      commands.push(0x1b, 0x61, 0x00);
      commands.push(0x0a);
      commands.push(...this.textToBytes('======================='));
      commands.push(0x0a, 0x0a);
    }

    commands.push(0x1b, 0x61, 0x01);
    commands.push(0x1b, 0x45, 0x01);
    commands.push(...this.textToBytes('*** NEW ORDER ***'));
    commands.push(0x1b, 0x45, 0x00);
    commands.push(0x0a, 0x0a, 0x0a);

    const timeStr = `${data.timestamp.getHours().toString().padStart(2, '0')}:${data.timestamp.getMinutes().toString().padStart(2, '0')}`;
    commands.push(0x1b, 0x61, 0x00);
    commands.push(...this.textToBytes(`Table: ${data.tableNumber}`));
    commands.push(0x09, 0x09);
    commands.push(0x1b, 0x21, 0x00);
    commands.push(...this.textToBytes(`Time: ${timeStr}`));
    commands.push(0x1b, 0x21, 0x30);
    commands.push(0x0a, 0x0a);

    commands.push(...this.textToBytes('======================='));
    commands.push(0x0a, 0x0a);

    commands.push(0x1b, 0x45, 0x01);
    commands.push(...this.textToBytes('REQUEST TYPE:'));
    commands.push(0x1b, 0x45, 0x00);
    commands.push(0x0a, 0x0a);
    commands.push(...this.textToBytes(`* ${data.requestTypeNameEn || data.requestType}`));
    commands.push(0x0a, 0x0a);

    if (data.customNote) {
      commands.push(0x1b, 0x45, 0x01);
      commands.push(...this.textToBytes('NOTE:'));
      commands.push(0x1b, 0x45, 0x00);
      commands.push(0x0a, 0x0a);
      commands.push(...this.textToBytes(data.customNote));
      commands.push(0x0a, 0x0a);
    }

    commands.push(0x0a);
    commands.push(...this.textToBytes('======================='));
    commands.push(0x0a, 0x0a);

    if (config.printFooter) {
      commands.push(0x1b, 0x61, 0x01);
      commands.push(0x1b, 0x45, 0x01);
      commands.push(...this.textToBytes('THANK YOU!'));
      commands.push(0x1b, 0x45, 0x00);
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
   * Build receipt as image using HTML rendering
   * This method creates an HTML receipt and uses puppeteer to render it to an image
   * HTML properly handles Arabic/Persian text with RTL support and proper font rendering
   * The image is then converted to ESC/POS bitmap printing commands
   */
  private async buildReceiptImage(
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
    // Calculate dimensions based on paper width
    // Use 70mm for Arabic to ensure text fits properly and is fully visible
    // For 70mm paper: 70mm = 2.75 inches, at 203 DPI = 559 pixels
    // Use 96 DPI for HTML rendering, then scale to printer DPI
    const paperWidthMm = language === 'ar' ? 70 : (config.paperWidth || 70);
    const htmlDpi = 96; // Use standard web DPI for HTML rendering
    const htmlWidth = Math.round((paperWidthMm / 25.4) * htmlDpi);
    
    // Generate HTML receipt
    const html = this.generateReceiptHTML(config, data, language, htmlWidth);
    
    // Render HTML to image using puppeteer
    const imageBuffer = await this.htmlToImage(html, htmlWidth);
    
    // Convert image to ESC/POS bitmap commands (printer uses 203 DPI)
    const printerDpi = 203;
    const printerWidth = Math.round((paperWidthMm / 25.4) * printerDpi);
    return this.imageToEscPos(imageBuffer, printerWidth);
  }

  /**
   * Generate HTML receipt template
   * Creates a properly formatted HTML receipt with RTL support for Arabic/Persian
   */
  private generateReceiptHTML(
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
    language: 'en' | 'ar',
    width: number,
  ): string {
    const isRTL = language === 'ar';
    const dir = isRTL ? 'rtl' : 'ltr';
    const textAlign = isRTL ? 'right' : 'left';
    
    const timeStr = `${data.timestamp.getHours().toString().padStart(2, '0')}:${data.timestamp.getMinutes().toString().padStart(2, '0')}`;
    const restaurantName = data.restaurantName 
      ? (language === 'ar' 
          ? (this.isArabicText(data.restaurantName) 
              ? data.restaurantName 
              : this.translateToArabic(data.restaurantName))
          : data.restaurantName.toUpperCase())
      : 'RESTAURANT';
    const restaurantAddress = data.restaurantAddress 
      ? (language === 'ar' 
          ? (this.isArabicText(data.restaurantAddress) 
              ? data.restaurantAddress 
              : this.translateToArabic(data.restaurantAddress))
          : data.restaurantAddress)
      : '';
    const phoneLabel = language === 'ar' ? 'الهاتف: ' : 'Phone: ';
    const orderHeader = language === 'ar' ? '*** طلب جديد ***' : '*** NEW ORDER ***';
    const tableLabel = language === 'ar' ? 'الطاولة: ' : 'Table: ';
    const timeLabel = language === 'ar' ? 'الوقت: ' : 'Time: ';
    const requestTypeLabel = language === 'ar' ? 'نوع الطلب:' : 'REQUEST TYPE:';
    // Use request type name directly from database (already in correct language)
    // The database has nameEn and nameAr, so requestTypeName should already be the correct language version
    const requestTypeName = language === 'en' ? (data.requestTypeNameEn || data.requestType) : (data.requestTypeNameAr || data.requestType);
    const noteLabel = language === 'ar' ? 'ملاحظة:' : 'NOTE:';
    const note = data.customNote 
      ? (language === 'ar' 
          ? (this.isArabicText(data.customNote) 
              ? data.customNote 
              : this.translateToArabic(data.customNote))
          : data.customNote)
      : '';
    const thankYou = language === 'ar' ? 'شكراً لك!' : 'THANK YOU!';
    
    return `<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: ${isRTL ? '"Arial Unicode MS", "DejaVu Sans", "Tahoma", "Segoe UI", Arial, sans-serif' : 'Arial, sans-serif'};
      width: ${width}px;
      max-width: ${width}px;
      min-width: ${width}px;
      background: white;
      color: black;
      padding: ${isRTL ? '8px 8px' : '10px 6px'};
      direction: ${dir};
      text-align: ${textAlign};
      line-height: ${isRTL ? '1.5' : '1.4'};
      font-feature-settings: normal;
      overflow-wrap: break-word;
      word-wrap: break-word;
      word-break: break-word;
      margin: 0;
      overflow-x: hidden;
    }
    .header {
      text-align: center;
      margin-bottom: ${isRTL ? '6px' : '8px'};
      width: 100%;
      box-sizing: border-box;
      padding: 0;
    }
    .header h1 {
      font-size: ${isRTL ? '28px' : '22px'};
      font-weight: bold;
      margin-bottom: ${isRTL ? '4px' : '5px'};
      line-height: 1.3;
      width: 100%;
      box-sizing: border-box;
      padding: 0;
      overflow-wrap: break-word;
      word-wrap: break-word;
    }
    .header p {
      font-size: ${isRTL ? '18px' : '14px'};
      margin: ${isRTL ? '2px 0' : '3px 0'};
      line-height: 1.4;
      width: 100%;
      box-sizing: border-box;
      padding: 0;
      overflow-wrap: break-word;
      word-wrap: break-word;
    }
    .separator {
      border-top: 1px solid black;
      margin: ${isRTL ? '5px 0' : '6px 0'};
    }
    .order-header {
      text-align: center;
      font-size: ${isRTL ? '26px' : '20px'};
      font-weight: bold;
      margin: ${isRTL ? '6px 0' : '8px 0'};
      line-height: 1.3;
      width: 100%;
      box-sizing: border-box;
      padding: 0;
      overflow-wrap: break-word;
      word-wrap: break-word;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin: ${isRTL ? '4px 0' : '5px 0'};
      font-size: ${isRTL ? '18px' : '14px'};
      direction: ${dir};
      line-height: 1.4;
      width: 100%;
      box-sizing: border-box;
      gap: 5px;
    }
    .info-row span {
      direction: ${dir};
      max-width: 48%;
      min-width: 0;
      flex: 1 1 auto;
      overflow-wrap: break-word;
      word-wrap: break-word;
      word-break: break-word;
      box-sizing: border-box;
    }
    .section-title {
      font-weight: bold;
      font-size: ${isRTL ? '20px' : '16px'};
      margin: ${isRTL ? '5px 0 3px 0' : '6px 0 4px 0'};
      line-height: 1.3;
      width: 100%;
      box-sizing: border-box;
      padding: 0;
      overflow-wrap: break-word;
      word-wrap: break-word;
    }
    .section-content {
      font-size: ${isRTL ? '18px' : '14px'};
      margin-${isRTL ? 'right' : 'left'}: ${isRTL ? '8px' : '10px'};
      margin-bottom: ${isRTL ? '4px' : '5px'};
      direction: ${dir};
      word-wrap: break-word;
      white-space: pre-wrap;
      line-height: 1.5;
      overflow-wrap: break-word;
      word-break: break-word;
      width: calc(100% - ${isRTL ? '8px' : '10px'});
      box-sizing: border-box;
      padding: 0;
    }
    .footer {
      text-align: center;
      margin-top: ${isRTL ? '6px' : '8px'};
      width: 100%;
      box-sizing: border-box;
      padding: 0;
    }
    .footer p {
      font-size: ${isRTL ? '18px' : '14px'};
      font-weight: bold;
      margin: ${isRTL ? '3px 0' : '4px 0'};
      line-height: 1.3;
      width: 100%;
      box-sizing: border-box;
      padding: 0;
      overflow-wrap: break-word;
      word-wrap: break-word;
    }
    .footer .timestamp {
      font-size: ${isRTL ? '14px' : '11px'};
      font-weight: normal;
      overflow-wrap: break-word;
      word-wrap: break-word;
    }
  </style>
</head>
<body>
  ${config.printHeader ? `
  <div class="header">
    <h1>${this.escapeHtml(restaurantName)}</h1>
    ${restaurantAddress ? `<p>${this.escapeHtml(restaurantAddress)}</p>` : ''}
    ${data.restaurantPhone ? `<p>${this.escapeHtml(phoneLabel)}${data.restaurantPhone}</p>` : ''}
  </div>
  <div class="separator"></div>
  ` : ''}
  
  <div class="order-header" dir="${dir}">${this.escapeHtml(orderHeader)}</div>
  
  <div class="info-row" dir="${dir}">
    <span dir="${dir}">${this.escapeHtml(tableLabel)}${data.tableNumber}</span>
    <span dir="${dir}">${this.escapeHtml(timeLabel)}${timeStr}</span>
  </div>
  
  <div class="separator"></div>
  
  <div class="section-title" dir="${dir}">${this.escapeHtml(requestTypeLabel)}</div>
  <div class="section-content" dir="${dir}">* ${this.escapeHtml(requestTypeName)}</div>
  
  ${data.customNote ? `
  <div class="section-title" dir="${dir}">${this.escapeHtml(noteLabel)}</div>
  <div class="section-content" dir="${dir}">${this.escapeHtml(note)}</div>
  ` : ''}
  
  <div class="separator"></div>
  
  ${config.printFooter ? `
  <div class="footer">
    <p>${this.escapeHtml(thankYou)}</p>
    <p class="timestamp">${data.timestamp.toLocaleString('en-US')}</p>
  </div>
  ` : ''}
</body>
</html>`;
  }

  /**
   * Escape HTML special characters to prevent XSS and rendering issues
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Get or create browser instance (reused for performance)
   */
  private async getBrowser(): Promise<Browser> {
    // If browser is already launching, wait for it
    if (this.browserLaunchPromise) {
      return this.browserLaunchPromise;
    }

    // If browser exists and is connected, return it
    if (this.browserInstance) {
      try {
        await this.browserInstance.pages();
        return this.browserInstance;
      } catch {
        // Browser was closed, reset it
        this.browserInstance = null;
      }
    }

    // Launch new browser
    this.browserLaunchPromise = this.launchBrowser();
    
    try {
      this.browserInstance = await this.browserLaunchPromise;
      return this.browserInstance;
    } finally {
      this.browserLaunchPromise = null;
    }
  }

  /**
   * Launch browser instance
   */
  private async launchBrowser(): Promise<Browser> {
    const possiblePaths = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean) as string[];

    let executablePath: string | undefined;
    for (const path of possiblePaths) {
      try {
        if (fs.existsSync(path)) {
          executablePath = path;
          break;
        }
      } catch {
        // Continue searching
      }
    }

    const launchOptions: LaunchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
      ],
    };

    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }

    return await puppeteer.launch(launchOptions);
  }

  /**
   * Convert HTML to image using puppeteer-core
   * Renders the HTML receipt to a PNG image with proper Arabic/Persian support
   * Optimized for performance by reusing browser instances
   */
  private async htmlToImage(html: string, width: number): Promise<Buffer> {
    let page;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      
      // Optimized viewport settings
      await page.setViewport({
        width: width,
        height: 200,
        deviceScaleFactor: 1, // Reduced from 2 for better performance
      });
      
      // Use domcontentloaded instead of networkidle0 for faster rendering
      await page.setContent(html, { 
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });
      
      // Reduced wait time - fonts should load quickly
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get the actual content height
      const contentHeight = await page.evaluate(() => {
        return Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.clientHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        );
      });
      
      // Take screenshot with exact content height
      const screenshot = await page.screenshot({
        type: 'png',
        clip: {
          x: 0,
          y: 0,
          width: width,
          height: Math.min(contentHeight, 2000),
        },
        omitBackground: false,
      });
      
      await page.close();
      
      return screenshot as Buffer;
    } catch (error) {
      logger.error('Error rendering HTML to image:', error);
      if (page) {
        try {
          await page.close();
        } catch (closeError) {
          logger.error('Error closing page:', closeError);
        }
      }
      throw error;
    }
  }

  /**
   * Convert image buffer to ESC/POS bitmap printing commands
   * This converts a PNG image to a 1-bit bitmap and sends it to the printer
   * Uses sharp library to process the image and convert it to ESC/POS format
   */
  private async imageToEscPos(imageBuffer: Buffer, width: number): Promise<Buffer> {
    const commands: number[] = [];
    
    commands.push(0x1b, 0x40);
    
    try {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      
      const targetWidth = width;
      const targetHeight = Math.round((metadata.height! * targetWidth) / metadata.width!);
      
      // Optimize image processing for speed
      const rawBuffer = await image
        .resize(targetWidth, targetHeight, { 
          fit: 'fill',
          kernel: 'nearest', // Faster than default lanczos3
        })
        .greyscale()
        .normalize()
        .raw()
        .toBuffer();
      
      const widthBytes = Math.ceil(targetWidth / 8);
      const height = targetHeight;
      const bitmapBuffer = Buffer.alloc(widthBytes * height);
      
      // Optimized bitmap conversion
      for (let y = 0; y < height; y++) {
        const rowStart = y * targetWidth;
        for (let x = 0; x < targetWidth; x++) {
          const pixelIndex = rowStart + x;
          const grayValue = rawBuffer[pixelIndex];
          const isBlack = grayValue < 128;
          
          if (isBlack) {
            const byteIndex = Math.floor(x / 8);
            const bitIndex = 7 - (x % 8);
            bitmapBuffer[y * widthBytes + byteIndex] |= (1 << bitIndex);
          }
        }
      }
      
      for (let y = 0; y < height; y++) {
        commands.push(0x1d, 0x76, 0x30, 0x00);
        commands.push(widthBytes & 0xff);
        commands.push((widthBytes >> 8) & 0xff);
        commands.push(0x01);
        commands.push(0x00);
        
        const lineStart = y * widthBytes;
        const lineData = bitmapBuffer.slice(lineStart, lineStart + widthBytes);
        commands.push(...Array.from(lineData));
      }
    } catch (error) {
      logger.error('Error converting image to ESC/POS format:', error);
      commands.push(0x0a, 0x0a);
    }
    
    commands.push(0x0a, 0x0a, 0x0a);
    commands.push(0x1d, 0x56, 0x41, 0x03);
    
    return Buffer.from(commands);
  }

  /**
   * Convert text to bytes using UTF-8 encoding
   * Used only for English text printing (Arabic uses image-based printing)
   */
  private textToBytes(text: string): number[] {
    return Array.from(Buffer.from(text, 'utf8'));
  }

  /**
   * Check if text contains Arabic/Persian characters
   * Used to determine if text from database is already in Arabic
   */
  private isArabicText(text: string): boolean {
    // Check for Arabic/Persian Unicode ranges
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return arabicPattern.test(text);
  }

  /**
   * Translate common English terms to Arabic
   * Used for HTML receipt generation when text is not already in Arabic
   */
  private translateToArabic(text: string): string {
    const translations: Record<string, string> = {
      // Request types
      'water': 'ماء',
      'menu': 'قائمة طعام',
      'bill': 'فاتورة',
      'help': 'مساعدة',
      'clean': 'تنظيف',
      'napkins': 'مناديل',
      'utensils': 'أدوات مائدة',
      'condiments': 'إضافات',
      'extra': 'إضافي',
      'check': 'فاتورة',
      'pay': 'دفع',
      'service': 'خدمة',
      'request': '(احضار المنيو)',
      // Common phrases
      'please': 'من فضلك',
      'thank you': 'شكراً',
      'sorry': 'عذراً',
      'waiter': 'نادل',
      'waitress': 'نادلة',
      'manager': 'مدير',
      'table': 'طاولة',
      'order': 'طلب',
      'food': 'طعام',
      'drink': 'مشروب',
      'ready': 'جاهز',
      'done': 'انتهى',
    };

    // Simple word-by-word translation
    const words = text.toLowerCase().split(/\s+/);
    const translatedWords = words.map(word => {
      // Remove punctuation for lookup
      const cleanWord = word.replace(/[^\w]/g, '');
      return translations[cleanWord] || word;
    });

    return translatedWords.join(' ');
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

