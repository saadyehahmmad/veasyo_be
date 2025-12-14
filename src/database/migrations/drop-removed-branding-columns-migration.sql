-- Drop removed branding columns
ALTER TABLE tenants DROP COLUMN IF EXISTS background_color;
ALTER TABLE tenants DROP COLUMN IF EXISTS font_family;
ALTER TABLE tenants DROP COLUMN IF EXISTS font_size;
ALTER TABLE tenants DROP COLUMN IF EXISTS font_weight;
ALTER TABLE tenants DROP COLUMN IF EXISTS gradient_type;