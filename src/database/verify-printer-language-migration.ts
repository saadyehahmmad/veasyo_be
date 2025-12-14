import { pool } from './db';
import logger from '../utils/logger';

/**
 * Verify that the printer language migration was applied correctly
 */
async function verifyPrinterLanguageMigration() {
  const client = await pool.connect();

  try {
    logger.info('Verifying printer language migration...');

    // Check if tenants table exists
    const tableResult = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'tenants'
      ) as table_exists;
    `);

    if (!tableResult.rows[0].table_exists) {
      logger.error('❌ Tenants table does not exist');
      return;
    }

    logger.info('✅ Tenants table exists');

    // Check tenants with printer integration settings
    const printerResult = await client.query(`
      SELECT
        COUNT(*) as total_tenants,
        COUNT(CASE WHEN settings->'integrations'->'printer' IS NOT NULL THEN 1 END) as tenants_with_printer,
        COUNT(CASE WHEN settings->'integrations'->'printer'->>'language' = 'both' THEN 1 END) as tenants_with_language
      FROM tenants;
    `);

    const stats = printerResult.rows[0];
    logger.info(`📊 Migration Stats:`, {
      totalTenants: parseInt(stats.total_tenants),
      tenantsWithPrinter: parseInt(stats.tenants_with_printer),
      tenantsWithLanguage: parseInt(stats.tenants_with_language)
    });

    // Show sample of tenant settings
    const sampleResult = await client.query(`
      SELECT id, name, settings->'integrations'->'printer' as printer_settings
      FROM tenants
      WHERE settings->'integrations'->'printer' IS NOT NULL
      LIMIT 3;
    `);

    if (sampleResult.rows.length > 0) {
      logger.info('📋 Sample printer configurations:');
      sampleResult.rows.forEach((row, index) => {
        logger.info(`Tenant ${index + 1} (${row.name}):`, row.printer_settings);
      });
    } else {
      logger.info('ℹ️  No tenants have printer integration configured yet');
    }

    logger.info('✅ Printer language migration verification completed');

  } catch (error) {
    logger.error('❌ Verification failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run verification if this script is executed directly
if (require.main === module) {
  verifyPrinterLanguageMigration()
    .then(() => {
      logger.info('Verification completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Verification failed:', error);
      process.exit(1);
    });
}

export { verifyPrinterLanguageMigration };