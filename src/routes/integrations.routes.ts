import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { IntegrationService } from '../services/integration.service';
import type { TenantRequest } from '../middleware/tenant';
import logger from '../utils/logger';
import { printerIntegration } from '../integrations/printer.integration';
import { speakerIntegration } from '../integrations/speaker.integration';

// Error messages
const ERROR_MESSAGES = {
  TENANT_NOT_FOUND: 'Tenant not found',
  FAILED_TO_GET_INTEGRATIONS: 'Failed to get integrations',
  FAILED_TO_UPDATE_INTEGRATIONS: 'Failed to update integrations',
  INVALID_PRINTER_DATA: 'Invalid printer configuration',
  INVALID_SPEAKER_DATA: 'Invalid speaker configuration',
  INVALID_WEBHOOK_DATA: 'Invalid webhook configuration',
} as const;

const router = Router();
const integrationService = new IntegrationService();

// All integration routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/integrations:
 *   get:
 *     summary: Get all integrations
 *     description: Get all integration settings for current tenant
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Integration settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: ERROR_MESSAGES.TENANT_NOT_FOUND,
        message: 'Please access via subdomain or provide tenant header',
      });
    }

    const integrations = await integrationService.getIntegrations(tenantId);
    logger.debug(`Retrieved integrations for tenant ${tenantId}`);

    res.json(integrations);
  } catch (error) {
    logger.error('Error getting integrations:', error);
    res.status(500).json({
      error: ERROR_MESSAGES.FAILED_TO_GET_INTEGRATIONS,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/integrations/printer:
 *   get:
 *     summary: Get printer integration
 *     description: Get printer integration settings
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Printer integration settings
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/printer', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: ERROR_MESSAGES.TENANT_NOT_FOUND,
        message: 'Please access via subdomain or provide tenant header',
      });
    }

    const printer = await integrationService.getPrinterIntegration(tenantId);
    res.json(printer);
  } catch (error) {
    logger.error('Error getting printer integration:', error);
    res.status(500).json({
      error: ERROR_MESSAGES.FAILED_TO_GET_INTEGRATIONS,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/integrations/printer:
 *   put:
 *     summary: Update printer integration
 *     description: Update printer integration settings (admin, superadmin only)
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *               printerName:
 *                 type: string
 *               paperWidth:
 *                 type: integer
 *                 enum: [58, 80]
 *               language:
 *                 type: string
 *                 enum: [en, ar, both]
 *     responses:
 *       200:
 *         description: Printer integration updated
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put('/printer', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: ERROR_MESSAGES.TENANT_NOT_FOUND,
        message: 'Please access via subdomain or provide tenant header',
      });
    }

    // Validate required fields if enabled
    const printerData = req.body;
    if (printerData.enabled) {
      // PC Agent is the ONLY method for printer communication
      // Validate PC Agent IP and Port (required)
      // PC Agent connects automatically via Socket.IO - no IP/Port configuration needed
      // Printer is configured in PC Agent's .env file (PRINTER_IP, PRINTER_PORT)

      // Validate paper width
      if (printerData.paperWidth && printerData.paperWidth !== 58 && printerData.paperWidth !== 80) {
        return res.status(400).json({
          error: ERROR_MESSAGES.INVALID_PRINTER_DATA,
          message: 'Paper width must be 58 or 80 (mm)',
        });
      }

      // Validate language
      if (printerData.language && !['en', 'ar', 'both'].includes(printerData.language)) {
        return res.status(400).json({
          error: ERROR_MESSAGES.INVALID_PRINTER_DATA,
          message: 'Language must be "en", "ar", or "both"',
        });
      }
    }

    // Filter allowed fields (PC Agent only)
    const allowedFields = [
      'enabled',
      'printerName',
      'paperWidth',
      'autoPrint',
      'printHeader',
      'printFooter',
      'language',
    ];

    const filteredData: Record<string, unknown> = {};
    allowedFields.forEach((field) => {
      if (printerData[field] !== undefined) {
        filteredData[field] = printerData[field];
      }
    });

    logger.debug(`Printer data received:`, { printerData, filteredData });

    const updatedPrinter = await integrationService.updatePrinterIntegration(tenantId, filteredData);
    logger.info(`Updated printer integration for tenant ${tenantId}`, { updatedPrinter });

    res.json(updatedPrinter);
  } catch (error) {
    logger.error('Error updating printer integration:', error);
    res.status(500).json({
      error: ERROR_MESSAGES.FAILED_TO_UPDATE_INTEGRATIONS,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/integrations/speaker:
 *   get:
 *     summary: Get speaker integration
 *     description: Get speaker integration settings
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Speaker integration settings
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/speaker', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: ERROR_MESSAGES.TENANT_NOT_FOUND,
        message: 'Please access via subdomain or provide tenant header',
      });
    }

    const speaker = await integrationService.getSpeakerIntegration(tenantId);
    res.json(speaker);
  } catch (error) {
    logger.error('Error getting speaker integration:', error);
    res.status(500).json({
      error: ERROR_MESSAGES.FAILED_TO_GET_INTEGRATIONS,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/integrations/speaker:
 *   put:
 *     summary: Update speaker integration
 *     description: Update speaker integration settings (admin, superadmin only)
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *               speakerIp:
 *                 type: string
 *               speakerPort:
 *                 type: integer
 *               volume:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *     responses:
 *       200:
 *         description: Speaker integration updated
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put('/speaker', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: ERROR_MESSAGES.TENANT_NOT_FOUND,
        message: 'Please access via subdomain or provide tenant header',
      });
    }

    // Validate required fields if enabled
    const speakerData = req.body;
    if (speakerData.enabled) {
      if (!speakerData.speakerIp || !speakerData.speakerPort) {
        return res.status(400).json({
          error: ERROR_MESSAGES.INVALID_SPEAKER_DATA,
          message: 'Speaker IP and Port are required when speaker is enabled',
        });
      }

      // Validate IP format
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(speakerData.speakerIp)) {
        return res.status(400).json({
          error: ERROR_MESSAGES.INVALID_SPEAKER_DATA,
          message: 'Invalid IP address format',
        });
      }

      // Validate port range
      const port = parseInt(speakerData.speakerPort, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        return res.status(400).json({
          error: ERROR_MESSAGES.INVALID_SPEAKER_DATA,
          message: 'Port must be between 1 and 65535',
        });
      }

      // Validate volume range
      if (speakerData.volume !== undefined) {
        const volume = parseInt(speakerData.volume, 10);
        if (isNaN(volume) || volume < 0 || volume > 100) {
          return res.status(400).json({
            error: ERROR_MESSAGES.INVALID_SPEAKER_DATA,
            message: 'Volume must be between 0 and 100',
          });
        }
      }

      // Validate duration range
      if (speakerData.duration !== undefined) {
        const duration = parseInt(speakerData.duration, 10);
        if (isNaN(duration) || duration < 1 || duration > 60) {
          return res.status(400).json({
            error: ERROR_MESSAGES.INVALID_SPEAKER_DATA,
            message: 'Duration must be between 1 and 60 seconds',
          });
        }
      }

      // Validate custom sound URL if sound type is custom
      if (speakerData.soundType === 'custom' && !speakerData.customSoundUrl) {
        return res.status(400).json({
          error: ERROR_MESSAGES.INVALID_SPEAKER_DATA,
          message: 'Custom sound URL is required when sound type is custom',
        });
      }
    }

    // Filter allowed fields
    const allowedFields = [
      'enabled',
      'speakerIp',
      'speakerPort',
      'volume',
      'duration',
      'soundType',
      'customSoundUrl',
    ];

    const filteredData: Record<string, unknown> = {};
    allowedFields.forEach((field) => {
      if (speakerData[field] !== undefined) {
        filteredData[field] = speakerData[field];
      }
    });

    const updatedSpeaker = await integrationService.updateSpeakerIntegration(tenantId, filteredData);
    logger.info(`Updated speaker integration for tenant ${tenantId}`);

    res.json(updatedSpeaker);
  } catch (error) {
    logger.error('Error updating speaker integration:', error);
    res.status(500).json({
      error: ERROR_MESSAGES.FAILED_TO_UPDATE_INTEGRATIONS,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/integrations/webhook:
 *   get:
 *     summary: Get webhook integration
 *     description: Get webhook integration settings
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Webhook integration settings
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/webhook', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: ERROR_MESSAGES.TENANT_NOT_FOUND,
        message: 'Please access via subdomain or provide tenant header',
      });
    }

    const webhook = await integrationService.getWebhookIntegration(tenantId);
    res.json(webhook);
  } catch (error) {
    logger.error('Error getting webhook integration:', error);
    res.status(500).json({
      error: ERROR_MESSAGES.FAILED_TO_GET_INTEGRATIONS,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/integrations/webhook:
 *   put:
 *     summary: Update webhook integration
 *     description: Update webhook integration settings (admin, superadmin only)
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *               webhookUrl:
 *                 type: string
 *                 format: uri
 *               secretKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: Webhook integration updated
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put('/webhook', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: ERROR_MESSAGES.TENANT_NOT_FOUND,
        message: 'Please access via subdomain or provide tenant header',
      });
    }

    // Validate required fields if enabled
    const webhookData = req.body;
    if (webhookData.enabled) {
      if (!webhookData.webhookUrl) {
        return res.status(400).json({
          error: ERROR_MESSAGES.INVALID_WEBHOOK_DATA,
          message: 'Webhook URL is required when webhook is enabled',
        });
      }

      // Validate URL format
      try {
        new URL(webhookData.webhookUrl);
      } catch {
        return res.status(400).json({
          error: ERROR_MESSAGES.INVALID_WEBHOOK_DATA,
          message: 'Invalid webhook URL format',
        });
      }

      // Validate retry attempts
      if (webhookData.retryAttempts !== undefined) {
        const retries = parseInt(webhookData.retryAttempts, 10);
        if (isNaN(retries) || retries < 0 || retries > 10) {
          return res.status(400).json({
            error: ERROR_MESSAGES.INVALID_WEBHOOK_DATA,
            message: 'Retry attempts must be between 0 and 10',
          });
        }
      }

      // Validate timeout
      if (webhookData.timeout !== undefined) {
        const timeout = parseInt(webhookData.timeout, 10);
        if (isNaN(timeout) || timeout < 1000 || timeout > 30000) {
          return res.status(400).json({
            error: ERROR_MESSAGES.INVALID_WEBHOOK_DATA,
            message: 'Timeout must be between 1000 and 30000 milliseconds',
          });
        }
      }
    }

    // Filter allowed fields
    const allowedFields = [
      'enabled',
      'webhookUrl',
      'secretKey',
      'events',
      'retryAttempts',
      'timeout',
    ];

    const filteredData: Record<string, unknown> = {};
    allowedFields.forEach((field) => {
      if (webhookData[field] !== undefined) {
        filteredData[field] = webhookData[field];
      }
    });

    const updatedWebhook = await integrationService.updateWebhookIntegration(tenantId, filteredData);
    logger.info(`Updated webhook integration for tenant ${tenantId}`);

    res.json(updatedWebhook);
  } catch (error) {
    logger.error('Error updating webhook integration:', error);
    res.status(500).json({
      error: ERROR_MESSAGES.FAILED_TO_UPDATE_INTEGRATIONS,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route POST /api/integrations/printer/test
 * @desc Test printer connection and print a test receipt
 * @access Authenticated users (admin/superadmin)
 */
router.post('/printer/test', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: ERROR_MESSAGES.TENANT_NOT_FOUND,
        message: 'Please access via subdomain or provide tenant header',
      });
    }

    const printer = await integrationService.getPrinterIntegration(tenantId);
    if (!printer || !printer.enabled) {
      return res.status(400).json({
        error: 'Printer not configured',
        message: 'Please configure and enable printer integration first',
      });
    }

    // Test print
    await printerIntegration.testPrint(printer, tenantId);

    res.json({
      success: true,
      message: 'Test print sent successfully',
    });
  } catch (error) {
    logger.error('Error testing printer:', error);
    res.status(500).json({
      error: 'Failed to test printer',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// PC Agent test endpoint removed - PC Agent connects automatically via Socket.IO
// Connection status can be checked via the PC Agent registry in the backend

/**
 * @route POST /api/integrations/speaker/test
 * @desc Test speaker connection and trigger a test alert
 * @access Authenticated users (admin/superadmin)
 */
router.post('/speaker/test', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        error: ERROR_MESSAGES.TENANT_NOT_FOUND,
        message: 'Please access via subdomain or provide tenant header',
      });
    }

    const speaker = await integrationService.getSpeakerIntegration(tenantId);
    if (!speaker || !speaker.enabled) {
      return res.status(400).json({
        error: 'Speaker not configured',
        message: 'Please configure and enable speaker integration first',
      });
    }

    // Test alert
    await speakerIntegration.testAlert(speaker);

    res.json({
      success: true,
      message: 'Test alert triggered successfully',
    });
  } catch (error) {
    logger.error('Error testing speaker:', error);
    res.status(500).json({
      error: 'Failed to test speaker',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

