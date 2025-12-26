-- Migration: Enhance subscriptions table for comprehensive plan management
-- Description: Adds fields for custom plans, add-ons pricing, and billing management
-- Date: 2025-12-26

-- Add new columns to subscriptions table
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS custom_table_limit INTEGER,
ADD COLUMN IF NOT EXISTS custom_waiter_limit INTEGER,
ADD COLUMN IF NOT EXISTS additional_printers INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS base_price INTEGER,
ADD COLUMN IF NOT EXISTS addons_cost INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly',
ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT true;

-- Update currency default to JOD
ALTER TABLE subscriptions ALTER COLUMN currency SET DEFAULT 'JOD';

-- Create index for plan lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan);

-- Add comments
COMMENT ON COLUMN subscriptions.custom_table_limit IS 'Custom table limit for custom plans';
COMMENT ON COLUMN subscriptions.custom_waiter_limit IS 'Custom waiter limit for custom plans';
COMMENT ON COLUMN subscriptions.additional_printers IS 'Number of additional printers (20 JOD each)';
COMMENT ON COLUMN subscriptions.base_price IS 'Base plan price before add-ons (in fils: 1 JOD = 1000 fils)';
COMMENT ON COLUMN subscriptions.addons_cost IS 'Cost of add-ons: extra tables, waiters, printers (in fils)';
COMMENT ON COLUMN subscriptions.billing_cycle IS 'Billing cycle: monthly or yearly';
COMMENT ON COLUMN subscriptions.auto_renew IS 'Whether subscription auto-renews';

-- Update existing subscriptions to have base_price equal to amount
UPDATE subscriptions 
SET base_price = amount, addons_cost = 0
WHERE base_price IS NULL;

