-- Migration: Add license_enabled field to tenants table
-- Description: Adds per-tenant license control to allow enabling/disabling specific tenants via Telegram
-- Date: 2025-12-26

-- Add license_enabled column to tenants table
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS license_enabled BOOLEAN NOT NULL DEFAULT true;

-- Create index for faster queries on license_enabled
CREATE INDEX IF NOT EXISTS idx_tenants_license_enabled ON tenants(license_enabled);

-- Add comment to explain the column
COMMENT ON COLUMN tenants.license_enabled IS 'Per-tenant license control - can be toggled via Telegram bot';

