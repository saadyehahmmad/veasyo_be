import { Response } from 'express';
import { TableService } from '../services/table.service';
import { TenantRequest } from '../middleware/tenant';
import { AuthRequest } from '../middleware/auth';
import { Tenant } from '../database/schema';
import logger from '../utils/logger';
import * as QRCode from 'qrcode';
import { createCanvas, loadImage, CanvasRenderingContext2D } from 'canvas';
import JSZip from 'jszip';
import { status } from "http-status";

// Error messages
const ERROR_MESSAGES = {
  TENANT_ID_REQUIRED: 'Tenant ID is required',
  TABLE_NOT_FOUND: 'Table not found',
  TABLE_INVALID: 'Table is invalid',
  TABLE_NUMBER_REQUIRED: 'Table number is required',
  FAILED_TO_GET_TABLES: 'Failed to get tables',
  FAILED_TO_GET_TABLE: 'Failed to get table',
  FAILED_TO_CREATE_TABLE: 'Failed to create table',
  FAILED_TO_UPDATE_TABLE: 'Failed to update table',
  FAILED_TO_DELETE_TABLE: 'Failed to delete table',
  FAILED_TO_GENERATE_QR: 'Failed to generate QR codes',
  TENANT_SUBDOMAIN_REQUIRED: 'Tenant subdomain is required'
} as const;

const tableService = new TableService();

export class TableController {
  /**
   * Get all tables for the tenant
   */
  async getAllTables(req: TenantRequest, res: Response) {
    try {
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      const user = (req as AuthRequest).user;

      let tables = await tableService.getTablesByTenant(tenantId);

      // If user is not admin/superadmin, filter out inactive tables
      if (!user || !['admin', 'superadmin'].includes(user.role)) {
        tables = tables.filter((table) => table.status === 'active');
      }

      res.json(tables);
    } catch (error) {
      logger.error('Error getting tables:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GET_TABLES });
    }
  }

  /**
   * Get table by ID
   */
  async getTableById(req: TenantRequest, res: Response) {
    try {
      const id = req.params.id;
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;

      // First check if the table belongs to the tenant
      const table = await tableService.getTableById(id);

      if (table?.tenantId !== tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TABLE_NOT_FOUND });
      }

      // If table is inactive, return invalid
      if (table.status !== 'active') {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TABLE_INVALID });
      }

      res.json(table);
    } catch (error) {
      logger.error('Error getting table:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GET_TABLE });
    }
  }

  /**
   * Get multiple tables by IDs (batch fetch)
   * POST /api/tables/batch with body: { ids: ["id1", "id2", ...] }
   */
  async getTablesByIds(req: TenantRequest, res: Response) {
    try {
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      const { ids } = req.body;

      if (!Array.isArray(ids) || !ids.length) {
        return res.status(status.BAD_REQUEST).json({ error: 'Table IDs array is required' });
      }

      const tables = await tableService.getTablesByIds(ids, tenantId);
      res.json(tables);
    } catch (error) {
      logger.error('Error getting tables by IDs:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GET_TABLES });
    }
  }

  /**
   * Create new table
   */
  async createTable(req: TenantRequest, res: Response) {
    try {
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      const tableData = req.body;

      if (!tableData.tableNumber) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TABLE_NUMBER_REQUIRED });
      }

      const table = await tableService.createTable({
        ...tableData,
        tenantId,
      });
      res.status(status.CREATED).json(table);
    } catch (error) {
      logger.error('Error creating table:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_CREATE_TABLE });
    }
  }

  /**
   * Update table
   */
  async updateTable(req: TenantRequest, res: Response) {
    try {
      const id = req.params.id;
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      const updates = req.body;

      // First check if the table belongs to the tenant
      const existingTable = await tableService.getTableById(id);
      if (existingTable?.tenantId !== tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TABLE_NOT_FOUND });
      }

      const table = await tableService.updateTable(id, updates);

      if (!table) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TABLE_NOT_FOUND });
      }

      res.json(table);
    } catch (error) {
      logger.error('Error updating table:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_UPDATE_TABLE });
    }
  }

  /**
   * Delete table
   */
  async deleteTable(req: TenantRequest, res: Response) {
    try {
      const id = req.params.id;
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;

      // First check if the table belongs to the tenant
      const existingTable = await tableService.getTableById(id);
      if (existingTable?.tenantId !== tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TABLE_NOT_FOUND });
      }

      const deleted = await tableService.deleteTable(id);

      if (!deleted) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TABLE_NOT_FOUND });
      }

      res.status(status.NO_CONTENT).send();
    } catch (error) {
      logger.error('Error deleting table:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_DELETE_TABLE });
    }
  }

  /**
   * Generate QR code data for all tables
   * GET /api/tables/qr-codes
   */
  async getTableQRCodes(req: TenantRequest & AuthRequest, res: Response) {
    try {
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      
      // Get tenant subdomain from extracted tenant
      if (!req.tenant?.subdomain && !req.tenant?.slug) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_SUBDOMAIN_REQUIRED });
      }

      const tenantSubdomain = req.tenant.subdomain || req.tenant.slug;
      const tables = await tableService.getTablesByTenant(tenantId);
      
      // Generate QR data for each table
      const qrPromises = tables.map(async (table) => {
        const qrUrl = this._generateQRUrl(tenantSubdomain, table.id);
        const qrImage = await QRCode.toDataURL(qrUrl, { width: 300, margin: 0, errorCorrectionLevel: 'M' });
        
        return {
          tableId: table.id,
          tableNumber: table.tableNumber,
          name: table.name,
          qrUrl,
          qrImage,
          zone: table.zone,
          capacity: table.capacity,
          status: table.status,
        };
      });

      const qrData = await Promise.all(qrPromises);

      res.json(qrData);
    } catch (error) {
      logger.error('Error generating QR codes:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GENERATE_QR });
    }
  }

  /**
   * Generate QR code data for specific table
   * GET /api/tables/:id/qr-code
   */
  async getTableQRCode(req: TenantRequest & AuthRequest, res: Response) {
    try {
      const id = req.params.id;
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;

      // Get tenant subdomain from extracted tenant
      if (!req.tenant?.subdomain && !req.tenant?.slug) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_SUBDOMAIN_REQUIRED });
      }

      const tenantSubdomain = req.tenant.subdomain || req.tenant.slug;

      // Check if the table belongs to the tenant
      const table = await tableService.getTableById(id);
      if (!table || table.tenantId !== tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TABLE_NOT_FOUND });
      }

      const qrUrl = this._generateQRUrl(tenantSubdomain, table.id);
      const qrImage = await QRCode.toDataURL(qrUrl, { width: 300, margin: 0, errorCorrectionLevel: 'M' });

      const qrData = {
        tableId: table.id,
        tableNumber: table.tableNumber,
        name: table.name,
        qrUrl,
        qrImage,
        zone: table.zone,
        capacity: table.capacity,
        status: table.status,
      };

      res.json(qrData);
    } catch (error) {
      logger.error('Error generating QR code:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GENERATE_QR });
    }
  }

  /**
   * Update QR code URL in database for table(s)
   * POST /api/tables/qr-codes/update
   */
  async updateTableQRUrls(req: TenantRequest & AuthRequest, res: Response) {
    try {
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      const { tableIds } = req.body; // Optional: specific table IDs, or update all if not provided

      // Get tenant subdomain from user
      const user = (req as AuthRequest).user;
      if (!user?.tenantSubdomain && !user?.tenantSlug) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_SUBDOMAIN_REQUIRED });
      }

      let tables;
      if (tableIds && Array.isArray(tableIds) && tableIds.length > 0) {
        tables = await tableService.getTablesByIds(tableIds, tenantId);
      } else {
        tables = await tableService.getTablesByTenant(tenantId);
      }

      // Update QR code URLs for each table
      const updatePromises = tables.map((table) => {
        const qrUrl = this._generateQRUrl(user.tenantSubdomain || user.tenantSlug!, table.id);
        return tableService.updateTable(table.id, { qrCodeUrl: qrUrl });
      });

      const updatedTables = await Promise.all(updatePromises);

      res.json({
        message: `Updated QR codes for ${updatedTables.length} table(s)`,
        tables: updatedTables,
      });
    } catch (error) {
      logger.error('Error updating QR code URLs:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GENERATE_QR });
    }
  }

  /**
   * Get all QR codes as styled stickers (base64 images for preview)
   * GET /api/tables/qr-codes/stickers
   */
  async getTableQRStickers(req: TenantRequest & AuthRequest, res: Response) {
    try {
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      
      // Get tenant subdomain from extracted tenant
      if (!req.tenant?.subdomain && !req.tenant?.slug) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_SUBDOMAIN_REQUIRED });
      }

      const tenantSubdomain = req.tenant.subdomain || req.tenant.slug;
      const tenant = req.tenant;
      const tables = await tableService.getTablesByTenant(tenantId);
      
      // Generate styled stickers for each table
      const stickers = await Promise.all(
        tables.map(async (table) => {
          const qrUrl = this._generateQRUrl(tenantSubdomain, table.id);
          const stickerBuffer = await this._generateQRSticker(
            qrUrl,
            table.name || table.tableNumber,
            tenant
          );
          
          return {
            tableId: table.id,
            tableNumber: table.tableNumber,
            name: table.name,
            stickerImage: `data:image/png;base64,${stickerBuffer.toString('base64')}`,
          };
        })
      );

      res.json(stickers);
    } catch (error) {
      logger.error('Error generating QR stickers:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GENERATE_QR });
    }
  }

  /**
   * Download all QR codes as styled stickers in ZIP
   * GET /api/tables/qr-codes/download
   */
  async downloadQRStickers(req: TenantRequest & AuthRequest, res: Response) {
    try {
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      
      // Get tenant subdomain from extracted tenant
      if (!req.tenant?.subdomain && !req.tenant?.slug) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_SUBDOMAIN_REQUIRED });
      }

      const tenantSubdomain = req.tenant.subdomain || req.tenant.slug;
      const tenant = req.tenant;
      const tables = await tableService.getTablesByTenant(tenantId);
      
      const zip = new JSZip();
      
      // Generate styled stickers for each table
      for (const table of tables) {
        const qrUrl = this._generateQRUrl(tenantSubdomain, table.id);
        const stickerBuffer = await this._generateQRSticker(
          qrUrl,
          table.name || table.tableNumber,
          tenant
        );
        
        const filename = `table-${table.name || table.tableNumber}-qr-sticker.png`;
        zip.file(filename, stickerBuffer);
      }

      // Generate ZIP buffer
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Send ZIP file
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="qr-stickers-${tenantSubdomain}.zip"`);
      res.send(zipBuffer);
    } catch (error) {
      logger.error('Error generating QR stickers ZIP:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GENERATE_QR });
    }
  }

  /**
   * Download all classic QR codes in ZIP
   * GET /api/tables/qr-codes/download-classic
   */
  async downloadClassicQRCodes(req: TenantRequest & AuthRequest, res: Response) {
    try {
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      
      // Get tenant subdomain from extracted tenant
      if (!req.tenant?.subdomain && !req.tenant?.slug) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_SUBDOMAIN_REQUIRED });
      }

      const tenantSubdomain = req.tenant.subdomain || req.tenant.slug;
      const tables = await tableService.getTablesByTenant(tenantId);
      
      const zip = new JSZip();
      
      // Generate classic QR codes for each table
      for (const table of tables) {
        const qrUrl = this._generateQRUrl(tenantSubdomain, table.id);
        const qrBuffer = await QRCode.toBuffer(qrUrl, {
          width: 300,
          margin: 0,
          errorCorrectionLevel: 'M',
          type: 'png'
        });
        
        const filename = `table-${table.name || table.tableNumber}-qr.png`;
        zip.file(filename, qrBuffer);
      }

      // Generate ZIP buffer
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Send ZIP file
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="qr-classic-${tenantSubdomain}.zip"`);
      res.send(zipBuffer);
    } catch (error) {
      logger.error('Error generating classic QR codes ZIP:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GENERATE_QR });
    }
  }

  /**
   * Download individual QR code (classic)
   * GET /api/tables/qr-codes/:tableId/download?format=png
   */
  async downloadTableQRCode(req: TenantRequest & AuthRequest, res: Response) {
    try {
      const tableId = req.params.tableId;
      const format = (req.query.format as string) || 'png';
      
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      
      // Get tenant subdomain from extracted tenant
      if (!req.tenant?.subdomain && !req.tenant?.slug) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_SUBDOMAIN_REQUIRED });
      }

      const tenantSubdomain = req.tenant.subdomain || req.tenant.slug;

      // Check if the table belongs to the tenant
      const table = await tableService.getTableById(tableId);
      if (!table || table.tenantId !== tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TABLE_NOT_FOUND });
      }

      const qrUrl = this._generateQRUrl(tenantSubdomain, table.id);

      if (format === 'svg') {
        const qrSvg = await QRCode.toString(qrUrl, {
          type: 'svg',
          width: 300,
          margin: 0,
          errorCorrectionLevel: 'M'
        });
        
        const filename = `table-${table.name || table.tableNumber}-qr.svg`;
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(qrSvg);
      } else {
        const qrBuffer = await QRCode.toBuffer(qrUrl, {
          width: 300,
          margin: 0,
          errorCorrectionLevel: 'M',
          type: 'png'
        });
        
        const filename = `table-${table.name || table.tableNumber}-qr.png`;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(qrBuffer);
      }
    } catch (error) {
      logger.error('Error downloading QR code:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GENERATE_QR });
    }
  }

  /**
   * Download individual branded sticker
   * GET /api/tables/qr-codes/:tableId/sticker/download
   */
  async downloadTableSticker(req: TenantRequest & AuthRequest, res: Response) {
    try {
      const tableId = req.params.tableId;
      
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      
      // Get tenant subdomain from extracted tenant
      if (!req.tenant?.subdomain && !req.tenant?.slug) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_SUBDOMAIN_REQUIRED });
      }

      const tenantSubdomain = req.tenant.subdomain || req.tenant.slug;
      const tenant = req.tenant;

      // Check if the table belongs to the tenant
      const table = await tableService.getTableById(tableId);
      if (!table || table.tenantId !== tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TABLE_NOT_FOUND });
      }

      const qrUrl = this._generateQRUrl(tenantSubdomain, table.id);
      const stickerBuffer = await this._generateQRSticker(
        qrUrl,
        table.name || table.tableNumber,
        tenant
      );
      
      const filename = `table-${table.name || table.tableNumber}-branded-sticker.png`;
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(stickerBuffer);
    } catch (error) {
      logger.error('Error downloading branded sticker:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GENERATE_QR });
    }
  }

  /**
   * Get print view HTML for QR code or branded sticker
   * GET /api/tables/qr-codes/:tableId/print?mode=classic|branded
   */
  async getPrintView(req: TenantRequest & AuthRequest, res: Response) {
    try {
      const tableId = req.params.tableId;
      const mode = (req.query.mode as string) || 'classic';
      
      if (!req.tenantId) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_ID_REQUIRED });
      }
      const tenantId = req.tenantId;
      
      // Get tenant subdomain from extracted tenant
      if (!req.tenant?.subdomain && !req.tenant?.slug) {
        return res.status(status.BAD_REQUEST).json({ error: ERROR_MESSAGES.TENANT_SUBDOMAIN_REQUIRED });
      }

      const tenantSubdomain = req.tenant.subdomain || req.tenant.slug;
      const tenant = req.tenant;

      // Check if the table belongs to the tenant
      const table = await tableService.getTableById(tableId);
      if (!table || table.tenantId !== tenantId) {
        return res.status(status.NOT_FOUND).json({ error: ERROR_MESSAGES.TABLE_NOT_FOUND });
      }

      const qrUrl = this._generateQRUrl(tenantSubdomain, table.id);
      let imageSource: string;
      let imageWidth: string;
      let imageHeight: string;
      let title: string;

      if (mode === 'branded') {
        const stickerBuffer = await this._generateQRSticker(
          qrUrl,
          table.name || table.tableNumber,
          tenant
        );
        imageSource = `data:image/png;base64,${stickerBuffer.toString('base64')}`;
        imageWidth = '400';
        imageHeight = 'auto';
        title = '';
      } else {
        const qrBuffer = await QRCode.toBuffer(qrUrl, {
          width: 300,
          margin: 0,
          errorCorrectionLevel: 'M',
          type: 'png'
        });
        imageSource = `data:image/png;base64,${qrBuffer.toString('base64')}`;
        imageWidth = '300';
        imageHeight = '300';
        title = `<h1>${table.name || table.tableNumber}</h1>`;
      }

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Table ${table.name || table.tableNumber} ${mode === 'branded' ? 'Branded Sticker' : 'QR Code'}</title>
            <style>
              body {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                padding: 20px;
                font-family: Arial, sans-serif;
              }
              .qr-container {
                text-align: center;
                page-break-inside: avoid;
              }
              h1 {
                margin-bottom: 20px;
                font-size: 24px;
              }
              .qr-code {
                margin: 20px 0;
              }
              .qr-code img {
                max-width: 100%;
                height: auto;
              }
              @media print {
                body {
                  margin: 0;
                }
              }
            </style>
          </head>
          <body>
            <div class="qr-container">
              ${title}
              <div class="qr-code">
                <img src="${imageSource}" alt="${mode === 'branded' ? 'Branded QR Sticker' : 'QR Code'}" width="${imageWidth}" height="${imageHeight}" />
              </div>
            </div>
            <script>
              window.onload = function() {
                window.print();
                window.onafterprint = function() {
                  window.close();
                };
              };
            </script>
          </body>
        </html>
      `;

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      logger.error('Error generating print view:', error);
      res.status(status.INTERNAL_SERVER_ERROR).json({ error: ERROR_MESSAGES.FAILED_TO_GENERATE_QR });
    }
  }

  /**
   * Generate a styled QR code sticker with branding
   */
  private async _generateQRSticker(
    qrUrl: string,
    tableName: string,
    tenant: Tenant
  ): Promise<Buffer> {
    const width = 600;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Unable to get canvas context');
    }

    // Extract colors with fallbacks
    const primaryColor = tenant.primaryColor || '#667eea';
    const secondaryColor = tenant.secondaryColor || '#764ba2';
    const backgroundColor = tenant.backgroundColor || '#ffffff';
    const textColor = tenant.textColor || '#333333';

    // Draw gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, primaryColor);
    gradient.addColorStop(1, secondaryColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw white rounded container
    const padding = 40;
    const containerX = padding;
    const containerY = padding;
    const containerWidth = width - padding * 2;
    const containerHeight = height - padding * 2;
    const borderRadius = 20;

    ctx.fillStyle = backgroundColor;
    this._roundRect(ctx, containerX, containerY, containerWidth, containerHeight, borderRadius);
    ctx.fill();

    // Draw logo if available
    let logoY = containerY + 30;
    if (tenant.logoUrl) {
      try {
        const logo = await loadImage(tenant.logoUrl);
        const logoSize = 80;
        const logoX = (width - logoSize) / 2;
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
        logoY += logoSize + 20;
      } catch (error) {
        logger.warn('Failed to load tenant logo:', error);
      }
    }

    // Draw table name
    ctx.fillStyle = textColor;
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(tableName, width / 2, logoY + 40);

    // Generate QR code
    const qrSize = 350;
    const qrX = (width - qrSize) / 2;
    const qrY = logoY + 80;
    
    const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, {
      width: qrSize,
      margin: 0,
      errorCorrectionLevel: 'H',
      color: {
        dark: textColor,
        light: backgroundColor
      }
    });
    
    const qrImage = await loadImage(qrCodeDataUrl);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    // Draw "Scan to Order" text
    ctx.font = '28px Arial';
    ctx.fillStyle = textColor;
    ctx.fillText('Scan to Order', width / 2, qrY + qrSize + 40);

    // Draw decorative elements
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(containerX + 80, qrY + qrSize + 70);
    ctx.lineTo(width - containerX - 80, qrY + qrSize + 70);
    ctx.stroke();

    return canvas.toBuffer('image/png');
  }

  /**
   * Helper method to draw rounded rectangle
   */
  private _roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Helper method to generate QR code URL
   */
  private _generateQRUrl(tenantSubdomain: string, tableId: string): string {
    const domain = process.env.DOMAIN_URL || 'localhost';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const port = process.env.NODE_ENV === 'production' ? '' : ':4200';
    
    // Always include tenant subdomain
    if (domain === 'localhost') {
      return `${protocol}://${tenantSubdomain}.${domain}${port}/table/${tableId}`;
    }
    
    return `${protocol}://${tenantSubdomain}.${domain}/table/${tableId}`;
  }
}
