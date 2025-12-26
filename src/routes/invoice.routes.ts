import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller';
import { authenticate } from '../middleware/auth';
import { requireTenantAdmin } from '../middleware/rbac';
import { extractTenant } from '../middleware/tenant';

const router = Router();
const invoiceController = new InvoiceController();

// All routes require authentication and tenant extraction
router.use(authenticate);
router.use(extractTenant);

/**
 * Get current tenant's invoices
 * GET /api/invoices
 */
router.get(
  '/',
  requireTenantAdmin(),
  invoiceController.getMyInvoices.bind(invoiceController)
);

/**
 * Get current tenant's payment history
 * GET /api/invoices/payments
 */
router.get(
  '/payments',
  requireTenantAdmin(),
  invoiceController.getMyPayments.bind(invoiceController)
);

/**
 * Download invoice
 * GET /api/invoices/:invoiceId/download
 */
router.get(
  '/:invoiceId/download',
  requireTenantAdmin(),
  invoiceController.downloadInvoice.bind(invoiceController)
);

export default router;

