-- ============================================
-- SUBSCRIPTION SYSTEM REFACTOR MIGRATION
-- Created: 2025-12-26
-- ============================================
-- This migration refactors the subscription system:
-- 1. Removes plan, maxTables, maxUsers from tenants table
-- 2. Adds maxTables, maxUsers, tax to subscriptions table
-- 3. Removes calculation fields from subscriptions table
-- ============================================

-- Step 1: Add new columns to subscriptions table (before dropping old ones for data migration)
ALTER TABLE subscriptions 
  ADD COLUMN IF NOT EXISTS max_tables INTEGER,
  ADD COLUMN IF NOT EXISTS max_users INTEGER,
  ADD COLUMN IF NOT EXISTS tax INTEGER;

-- Step 2: Migrate data from old columns to new columns
-- For existing subscriptions, use custom_table_limit -> max_tables, custom_waiter_limit -> max_users
UPDATE subscriptions 
SET 
  max_tables = COALESCE(custom_table_limit, 10),
  max_users = COALESCE(custom_waiter_limit, 5),
  tax = 0
WHERE max_tables IS NULL OR max_users IS NULL;

-- Step 3: Set NOT NULL constraints after data migration
ALTER TABLE subscriptions 
  ALTER COLUMN max_tables SET NOT NULL,
  ALTER COLUMN max_users SET NOT NULL,
  ALTER COLUMN max_tables SET DEFAULT 10,
  ALTER COLUMN max_users SET DEFAULT 5;

-- Step 4: Remove old calculation columns from subscriptions
ALTER TABLE subscriptions 
  DROP COLUMN IF EXISTS custom_table_limit,
  DROP COLUMN IF EXISTS custom_waiter_limit,
  DROP COLUMN IF EXISTS additional_printers,
  DROP COLUMN IF EXISTS base_price,
  DROP COLUMN IF EXISTS addons_cost,
  DROP COLUMN IF EXISTS billing_cycle,
  DROP COLUMN IF EXISTS auto_renew;

-- Step 5: Remove plan, maxTables, maxUsers from tenants table
-- Note: We keep the columns for now but they will be removed in schema.ts
-- The application will stop using them, but we don't drop them to avoid breaking existing data
-- If you want to drop them, uncomment the following:
-- ALTER TABLE tenants 
--   DROP COLUMN IF EXISTS plan,
--   DROP COLUMN IF EXISTS max_tables,
--   DROP COLUMN IF EXISTS max_users;

-- Step 6: Add comments for documentation
COMMENT ON COLUMN subscriptions.max_tables IS 'Maximum tables allowed for this subscription';
COMMENT ON COLUMN subscriptions.max_users IS 'Maximum users allowed for this subscription';
COMMENT ON COLUMN subscriptions.tax IS 'Tax amount in cents (fixed amount)';

