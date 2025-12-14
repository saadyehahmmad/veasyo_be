import { Router } from 'express';
import { TableController } from '../controllers/table.controller';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { extractTenant } from '../middleware/tenant';

const router = Router();
const tableController = new TableController();

// Apply tenant middleware to all routes
router.use(extractTenant);

/**
 * @route GET /api/tables
 * @desc Get all tables (tenant-scoped) - Public for customers, all for authenticated admins
 * @access Public (customers), Admin, Waiter, SuperAdmin
 */
router.get('/', optionalAuthenticate, tableController.getAllTables.bind(tableController));

/**
 * @route POST /api/tables/batch
 * @desc Get multiple tables by IDs - Public for customers, optimized for batch fetch
 * @access Public (customers), Admin, Waiter, SuperAdmin
 */
router.post('/batch', optionalAuthenticate, tableController.getTablesByIds.bind(tableController));

// QR Code routes (must be before /:id to prevent route collision)
// Apply authentication to QR operations
router.use('/qr-codes', authenticate);

/**
 * @route GET /api/tables/qr-codes
 * @desc Get QR code data for all tables
 * @access Admin, Manager, SuperAdmin
 */
router.get(
  '/qr-codes',
  requireRole(['admin', 'manager', 'superadmin']),
  tableController.getTableQRCodes.bind(tableController),
);

/**
 * @route POST /api/tables/qr-codes/update
 * @desc Update QR code URLs in database for table(s)
 * @access Admin, SuperAdmin
 */
router.post(
  '/qr-codes/update',
  requireRole(['admin', 'superadmin']),
  tableController.updateTableQRUrls.bind(tableController),
);

/**
 * @route GET /api/tables/qr-codes/stickers
 * @desc Get all QR codes as styled stickers (base64 for preview)
 * @access Admin, Manager, SuperAdmin
 */
router.get(
  '/qr-codes/stickers',
  requireRole(['admin', 'manager', 'superadmin']),
  tableController.getTableQRStickers.bind(tableController),
);

/**
 * @route GET /api/tables/qr-codes/download
 * @desc Download all QR codes as styled stickers in ZIP
 * @access Admin, Manager, SuperAdmin
 */
router.get(
  '/qr-codes/download',
  requireRole(['admin', 'manager', 'superadmin']),
  tableController.downloadQRStickers.bind(tableController),
);

/**
 * @route GET /api/tables/qr-codes/download-classic
 * @desc Download all classic QR codes in ZIP
 * @access Admin, Manager, SuperAdmin
 */
router.get(
  '/qr-codes/download-classic',
  requireRole(['admin', 'manager', 'superadmin']),
  tableController.downloadClassicQRCodes.bind(tableController),
);

/**
 * @route GET /api/tables/qr-codes/:tableId/download
 * @desc Download individual QR code (PNG or SVG)
 * @access Admin, Manager, SuperAdmin
 */
router.get(
  '/qr-codes/:tableId/download',
  requireRole(['admin', 'manager', 'superadmin']),
  tableController.downloadTableQRCode.bind(tableController),
);

/**
 * @route GET /api/tables/qr-codes/:tableId/sticker/download
 * @desc Download individual branded sticker
 * @access Admin, Manager, SuperAdmin
 */
router.get(
  '/qr-codes/:tableId/sticker/download',
  requireRole(['admin', 'manager', 'superadmin']),
  tableController.downloadTableSticker.bind(tableController),
);

/**
 * @route GET /api/tables/qr-codes/:tableId/print
 * @desc Get print view HTML for QR code or branded sticker
 * @access Admin, Manager, SuperAdmin
 */
router.get(
  '/qr-codes/:tableId/print',
  requireRole(['admin', 'manager', 'superadmin']),
  tableController.getPrintView.bind(tableController),
);

/**
 * @route GET /api/tables/:id
 * @desc Get table by ID - Public for customers
 * @access Public (customers), Admin, Waiter, SuperAdmin
 */
router.get('/:id', optionalAuthenticate, tableController.getTableById.bind(tableController));

// Apply authentication to protected table operations
router.use(authenticate);

/**
 * @route GET /api/tables/:id/qr-code
 * @desc Get QR code data for specific table
 * @access Admin, Manager, SuperAdmin
 */
router.get(
  '/:id/qr-code',
  requireRole(['admin', 'manager', 'superadmin']),
  tableController.getTableQRCode.bind(tableController),
);

/**
 * @route POST /api/tables
 * @desc Create new table
 * @access Admin, SuperAdmin
 */
router.post(
  '/',
  requireRole(['admin', 'superadmin']),
  tableController.createTable.bind(tableController),
);

/**
 * @route PUT /api/tables/:id
 * @desc Update table
 * @access Admin, SuperAdmin
 */
router.put(
  '/:id',
  requireRole(['admin', 'superadmin']),
  tableController.updateTable.bind(tableController),
);

/**
 * @route DELETE /api/tables/:id
 * @desc Delete table
 * @access Admin, SuperAdmin
 */
router.delete(
  '/:id',
  requireRole(['admin', 'superadmin']),
  tableController.deleteTable.bind(tableController),
);

export default router;
