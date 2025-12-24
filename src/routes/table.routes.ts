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
 * @swagger
 * /api/tables:
 *   get:
 *     summary: Get all tables
 *     description: Get all tables for the tenant (public access for customers, full access for authenticated users)
 *     tags: [Tables]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of tables
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   tableNumber:
 *                     type: string
 *                   status:
 *                     type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/', optionalAuthenticate, tableController.getAllTables.bind(tableController));

/**
 * @swagger
 * /api/tables/batch:
 *   post:
 *     summary: Get multiple tables by IDs
 *     description: Batch fetch multiple tables by their IDs (public access for customers)
 *     tags: [Tables]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tableIds
 *             properties:
 *               tableIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of table IDs to fetch
 *     responses:
 *       200:
 *         description: List of requested tables
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/batch', optionalAuthenticate, tableController.getTablesByIds.bind(tableController));

// QR Code routes (must be before /:id to prevent route collision)
// Apply authentication to QR operations
router.use('/qr-codes', authenticate);

/**
 * @swagger
 * /api/tables/qr-codes:
 *   get:
 *     summary: Get QR codes for all tables
 *     description: Get QR code data for all tables in the tenant (admin, manager, superadmin only)
 *     tags: [Tables]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: QR code data for all tables
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get(
  '/qr-codes',
  requireRole(['admin', 'manager', 'superadmin']),
  tableController.getTableQRCodes.bind(tableController),
);

/**
 * @swagger
 * /api/tables/qr-codes/update:
 *   post:
 *     summary: Update QR code URLs
 *     description: Update QR code URLs in database for table(s) (admin, superadmin only)
 *     tags: [Tables]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tableIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of table IDs to update (empty array updates all)
 *     responses:
 *       200:
 *         description: QR code URLs updated successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
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
 * @swagger
 * /api/tables/{id}:
 *   get:
 *     summary: Get table by ID
 *     description: Get a specific table by ID (public access for customers)
 *     tags: [Tables]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Table ID
 *     responses:
 *       200:
 *         description: Table details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id', optionalAuthenticate, tableController.getTableById.bind(tableController));

// Apply authentication to protected table operations
router.use(authenticate);

/**
 * @swagger
 * /api/tables/{id}/qr-code:
 *   get:
 *     summary: Get QR code for specific table
 *     description: Get QR code data for a specific table (admin, manager, superadmin only)
 *     tags: [Tables]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Table ID
 *     responses:
 *       200:
 *         description: QR code data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get(
  '/:id/qr-code',
  requireRole(['admin', 'manager', 'superadmin']),
  tableController.getTableQRCode.bind(tableController),
);

/**
 * @swagger
 * /api/tables:
 *   post:
 *     summary: Create new table
 *     description: Create a new table in the tenant (admin, superadmin only)
 *     tags: [Tables]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tableNumber
 *             properties:
 *               tableNumber:
 *                 type: string
 *                 example: "T-01"
 *               capacity:
 *                 type: number
 *               status:
 *                 type: string
 *                 enum: [available, occupied, reserved, maintenance]
 *     responses:
 *       201:
 *         description: Table created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  '/',
  requireRole(['admin', 'superadmin']),
  tableController.createTable.bind(tableController),
);

/**
 * @swagger
 * /api/tables/{id}:
 *   put:
 *     summary: Update table
 *     description: Update table information (admin, superadmin only)
 *     tags: [Tables]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Table ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tableNumber:
 *                 type: string
 *               capacity:
 *                 type: number
 *               status:
 *                 type: string
 *                 enum: [available, occupied, reserved, maintenance]
 *     responses:
 *       200:
 *         description: Table updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put(
  '/:id',
  requireRole(['admin', 'superadmin']),
  tableController.updateTable.bind(tableController),
);

/**
 * @swagger
 * /api/tables/{id}:
 *   delete:
 *     summary: Delete table
 *     description: Delete a table (admin, superadmin only)
 *     tags: [Tables]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Table ID
 *     responses:
 *       204:
 *         description: Table deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete(
  '/:id',
  requireRole(['admin', 'superadmin']),
  tableController.deleteTable.bind(tableController),
);

export default router;
