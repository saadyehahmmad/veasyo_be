-- ============================================
-- MIGRATION: Add language field to printer integration settings
-- Date: 2025-12-13
-- Description: Adds language field to existing printer integration settings
-- ============================================

-- Update existing tenant settings to include language field in printer integration
UPDATE tenants
SET settings = jsonb_set(
    jsonb_set(
        settings,
        '{integrations,printer,language}',
        '"both"'::jsonb,
        true
    ),
    '{integrations}',
    COALESCE(settings->'integrations', '{}'::jsonb),
    true
)
WHERE settings->'integrations'->'printer' IS NOT NULL;

-- For tenants that don't have printer integration settings yet, ensure the structure exists
UPDATE tenants
SET settings = jsonb_set(
    settings,
    '{integrations}',
    COALESCE(settings->'integrations', '{}'::jsonb),
    true
)
WHERE settings->'integrations' IS NULL;

COMMIT;