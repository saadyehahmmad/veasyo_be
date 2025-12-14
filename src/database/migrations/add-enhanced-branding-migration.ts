import { db } from '../db';
import { sql } from 'drizzle-orm';
import logger from '../../utils/logger';

/**
 * Migration: Add enhanced branding fields to tenants table
 * This adds patterns, and gradient options for tenant branding
 */
async function addEnhancedBrandingColumns(): Promise<void> {
  try {
    logger.info('🔄 Starting enhanced branding columns migration...');

    // Add background and pattern columns
    await db.execute(sql`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS background_pattern VARCHAR(50),
      ADD COLUMN IF NOT EXISTS gradient_type VARCHAR(20) DEFAULT 'solid',
      ADD COLUMN IF NOT EXISTS gradient_start_color VARCHAR(7),
      ADD COLUMN IF NOT EXISTS gradient_end_color VARCHAR(7),
      ADD COLUMN IF NOT EXISTS gradient_direction VARCHAR(50) DEFAULT 'to right'
    `);

    logger.info('✅ Successfully added enhanced branding columns to tenants table');
  } catch (error) {
    logger.error('❌ Error adding enhanced branding columns:', error);
    throw error;
  }
}

// Run the migration
addEnhancedBrandingColumns()
  .then(() => {
    logger.info('🎉 Enhanced branding migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('💥 Enhanced branding migration failed:', error);
    process.exit(1);
  });