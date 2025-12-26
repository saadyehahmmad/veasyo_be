import { Response } from 'express';
import { TenantRequest } from '../middleware/tenant';
import { SubscriptionService } from '../services/subscription.service';
import logger from '../utils/logger';

export class InvoiceController {
  private _subscriptionService: SubscriptionService;

  constructor() {
    this._subscriptionService = new SubscriptionService();
  }

  /**
   * Get invoices for current tenant
   * GET /api/invoices
   */
  async getMyInvoices(req: TenantRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: 'Bad Request', message: 'Tenant ID is required' });
      }

      const invoices = await this._subscriptionService.getTenantInvoices(tenantId);

      res.json({
        invoices,
        count: invoices.length,
      });
    } catch (error) {
      logger.error('Get invoices error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve invoices',
      });
    }
  }

  /**
   * Get payment history for current tenant
   * GET /api/invoices/payments
   */
  async getMyPayments(req: TenantRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: 'Bad Request', message: 'Tenant ID is required' });
      }

      const payments = await this._subscriptionService.getTenantPayments(tenantId);

      res.json({
        payments,
        count: payments.length,
      });
    } catch (error) {
      logger.error('Get payments error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve payment history',
      });
    }
  }

  /**
   * Download invoice PDF
   * GET /api/invoices/:invoiceId/download
   */
  async downloadInvoice(req: TenantRequest, res: Response) {
    try {
      const { invoiceId } = req.params;
      const tenantId = req.tenantId;

      if (!tenantId) {
        return res.status(400).json({ error: 'Bad Request', message: 'Tenant ID is required' });
      }

      // TODO: Implement PDF generation
      // For now, return invoice data
      const invoice = await this._subscriptionService.getInvoiceById(invoiceId, tenantId);

      if (!invoice) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Invoice not found',
        });
      }

      res.json({
        message: 'Invoice download endpoint - PDF generation not yet implemented',
        invoice,
      });
    } catch (error) {
      logger.error('Download invoice error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to download invoice',
      });
    }
  }
}

