import { db } from '../db';
import { sql } from 'drizzle-orm';
import logger from '../../utils/logger';

/**
 * Migration: Add languageColor field to tenants table
 * This adds the languageColor column for branding customization
 */
async function addLanguageColorColumn(): Promise<void> {
  try {
    logger.info('🔄 Starting languageColor column migration...');

    // Add languageColor column to tenants table
    await db.execute(sql`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS language_color VARCHAR(7) DEFAULT '#333333'
    `);

    logger.info('✅ Successfully added languageColor column to tenants table');
  } catch (error) {
    logger.error('❌ Error adding languageColor column:', error);
    throw error;
  }
}

// Run the migration
addLanguageColorColumn()
  .then(() => {
    logger.info('🎉 LanguageColor migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('💥 LanguageColor migration failed:', error);
    process.exit(1);
  });