import { db } from './db';
import { sql } from 'drizzle-orm';
import logger from '../utils/logger';

/**
 * Run migration to enhance subscriptions table
 */
async function runSubscriptionMigration() {
  try {
    logger.info('🔄 Starting subscription enhancement migration...');

    // Add new columns
    await db.execute(sql`
      ALTER TABLE subscriptions 
      ADD COLUMN IF NOT EXISTS custom_table_limit INTEGER,
      ADD COLUMN IF NOT EXISTS custom_waiter_limit INTEGER,
      ADD COLUMN IF NOT EXISTS additional_printers INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS base_price INTEGER,
      ADD COLUMN IF NOT EXISTS addons_cost INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly',
      ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT true;
    `);
    logger.info('✅ Added new columns to subscriptions table');

    // Update currency default
    await db.execute(sql`
      ALTER TABLE subscriptions ALTER COLUMN currency SET DEFAULT 'JOD';
    `);
    logger.info('✅ Updated currency default to JOD');

    // Create index
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan);
    `);
    logger.info('✅ Created index on plan column');

    // Add comments
    await db.execute(sql`
      COMMENT ON COLUMN subscriptions.custom_table_limit IS 'Custom table limit for custom plans';
    `);
    await db.execute(sql`
      COMMENT ON COLUMN subscriptions.custom_waiter_limit IS 'Custom waiter limit for custom plans';
    `);
    await db.execute(sql`
      COMMENT ON COLUMN subscriptions.additional_printers IS 'Number of additional printers (20 JOD each)';
    `);
    await db.execute(sql`
      COMMENT ON COLUMN subscriptions.base_price IS 'Base plan price before add-ons (in fils: 1 JOD = 1000 fils)';
    `);
    await db.execute(sql`
      COMMENT ON COLUMN subscriptions.addons_cost IS 'Cost of add-ons: extra tables, waiters, printers (in fils)';
    `);
    await db.execute(sql`
      COMMENT ON COLUMN subscriptions.billing_cycle IS 'Billing cycle: monthly or yearly';
    `);
    await db.execute(sql`
      COMMENT ON COLUMN subscriptions.auto_renew IS 'Whether subscription auto-renews';
    `);
    logger.info('✅ Added column comments');

    // Update existing subscriptions
    await db.execute(sql`
      UPDATE subscriptions 
      SET base_price = amount, addons_cost = 0
      WHERE base_price IS NULL;
    `);
    logger.info('✅ Updated existing subscriptions with base_price');

    logger.info('✅ Subscription enhancement migration completed successfully');
  } catch (error) {
    logger.error('❌ Error running subscription migration:', error);
    throw error;
  }
}

// Run migration if executed directly
if (require.main === module) {
  runSubscriptionMigration()
    .then(() => {
      logger.info('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration failed:', error);
      process.exit(1);
    });
}

export { runSubscriptionMigration };

