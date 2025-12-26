import { db } from './db';
import { sql } from 'drizzle-orm';
import logger from '../utils/logger';

/**
 * Run migration to add license_enabled field to tenants table
 */
async function runTenantLicenseMigration() {
  try {
    logger.info('🔄 Starting tenant license migration...');

    // Add license_enabled column
    await db.execute(sql`
      ALTER TABLE tenants 
      ADD COLUMN IF NOT EXISTS license_enabled BOOLEAN NOT NULL DEFAULT true;
    `);
    logger.info('✅ Added license_enabled column');

    // Create index
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_tenants_license_enabled ON tenants(license_enabled);
    `);
    logger.info('✅ Created index on license_enabled');

    // Add comment
    await db.execute(sql`
      COMMENT ON COLUMN tenants.license_enabled IS 'Per-tenant license control - can be toggled via Telegram bot';
    `);
    logger.info('✅ Added column comment');

    logger.info('✅ Tenant license migration completed successfully');
  } catch (error) {
    logger.error('❌ Error running tenant license migration:', error);
    throw error;
  }
}

// Run migration if executed directly
if (require.main === module) {
  runTenantLicenseMigration()
    .then(() => {
      logger.info('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration failed:', error);
      process.exit(1);
    });
}

export { runTenantLicenseMigration };

