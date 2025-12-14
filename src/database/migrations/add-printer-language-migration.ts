import { db } from '../db';
import { tenants } from '../schema';
import { eq } from 'drizzle-orm';
import logger from '../../utils/logger';

/**
 * Migration: Add language field to existing printer configurations
 * This ensures all tenants have the language field set in their printer settings
 */
async function migratePrinterLanguage(): Promise<void> {
  try {
    logger.info('🔄 Starting printer language migration...');

    // Get all tenants
    const allTenants = await db.select({ id: tenants.id, settings: tenants.settings }).from(tenants);

    let updatedCount = 0;

    for (const tenant of allTenants) {
      const settings = tenant.settings as Record<string, unknown> | null;
      const integrations = (settings?.integrations as Record<string, unknown>) || {};

      // Check if printer integration exists
      if (integrations.printer) {
        const printer = integrations.printer as Record<string, unknown>;

        // Check if language field is missing
        if (!printer.language) {
          logger.info(`📝 Adding language field to tenant ${tenant.id}`);

          // Add language field with default value 'both'
          printer.language = 'both';

          // Update the tenant settings
          const updatedSettings = {
            ...settings,
            integrations: {
              ...integrations,
              printer,
            },
          };

          await db
            .update(tenants)
            .set({
              settings: updatedSettings,
              updatedAt: new Date(),
            })
            .where(eq(tenants.id, tenant.id));

          updatedCount++;
        }
      }
    }

    logger.info(`✅ Printer language migration completed. Updated ${updatedCount} tenants.`);
  } catch (error) {
    logger.error('❌ Error during printer language migration:', error);
    throw error;
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  migratePrinterLanguage()
    .then(() => {
      logger.info('🎉 Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

export { migratePrinterLanguage };