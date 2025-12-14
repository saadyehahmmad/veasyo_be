-- ============================================
-- FULL DATABASE MIGRATION
-- Waiter Call System - Complete Schema
-- Created: 2025-12-09
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TENANTS TABLE (Restaurants)
-- ============================================
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    subdomain VARCHAR(100) UNIQUE,
    plan VARCHAR(50) NOT NULL DEFAULT 'free',
    max_tables INTEGER DEFAULT 10,
    max_users INTEGER DEFAULT 5,
    active BOOLEAN NOT NULL DEFAULT true,
    settings JSONB NOT NULL DEFAULT '{}',
    
    -- Branding / Theme customization
    logo_url TEXT,
    favicon_url TEXT,
    primary_color VARCHAR(7) DEFAULT '#667eea',
    secondary_color VARCHAR(7) DEFAULT '#764ba2',
    accent_color VARCHAR(7) DEFAULT '#f093fb',
    background_color VARCHAR(7) DEFAULT '#ffffff',
    text_color VARCHAR(7) DEFAULT '#333333',
    custom_css TEXT,
    theme JSONB DEFAULT '{}',
    
    -- Social Media Links
    facebook_url TEXT,
    instagram_url TEXT,
    twitter_url TEXT,
    linkedin_url TEXT,
    
    -- Menu URL
    menu_url TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for tenants
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);
CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(active);

-- ============================================
-- USERS TABLE (Multi-Tenant + SuperAdmin)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL,
    is_super_admin BOOLEAN NOT NULL DEFAULT false,
    full_name VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraint: Unique username per tenant
    CONSTRAINT unique_tenant_username UNIQUE (tenant_id, username)
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_super_admin ON users(is_super_admin);

-- ============================================
-- TABLES TABLE (Multi-Tenant)
-- ============================================
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    table_number VARCHAR(50) NOT NULL,
    name VARCHAR(100),
    qr_code_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    zone VARCHAR(50),
    capacity INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraint: Unique table number per tenant
    CONSTRAINT unique_tenant_table_number UNIQUE (tenant_id, table_number)
);

-- Indexes for tables
CREATE INDEX IF NOT EXISTS idx_tables_tenant_id ON tables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tables_status ON tables(tenant_id, status);

-- ============================================
-- SERVICE REQUESTS TABLE (Multi-Tenant)
-- ============================================
CREATE TABLE IF NOT EXISTS service_requests (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    request_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    custom_note TEXT,
    timestamp_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    timestamp_acknowledged TIMESTAMPTZ,
    timestamp_completed TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for service_requests
CREATE INDEX IF NOT EXISTS idx_requests_tenant_id ON service_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_requests_table_id ON service_requests(table_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON service_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_created ON service_requests(tenant_id, timestamp_created);
CREATE INDEX IF NOT EXISTS idx_requests_acknowledged_by ON service_requests(acknowledged_by);
CREATE INDEX IF NOT EXISTS idx_requests_status_created ON service_requests(tenant_id, status, timestamp_created);

-- ============================================
-- SUBSCRIPTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
    plan VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_date TIMESTAMPTZ,
    last_payment_date TIMESTAMPTZ,
    next_payment_date TIMESTAMPTZ,
    amount INTEGER,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON subscriptions(end_date);

-- ============================================
-- PERMISSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for permissions
CREATE INDEX IF NOT EXISTS idx_permissions_name ON permissions(name);
CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category);

-- ============================================
-- ROLE PERMISSIONS TABLE (Junction)
-- ============================================
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role VARCHAR(20) NOT NULL,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraint: Unique role-permission combination
    CONSTRAINT unique_role_permission UNIQUE (role, permission_id)
);

-- Indexes for role_permissions
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- ============================================
-- REQUEST TYPES TABLE (Multi-Tenant)
-- ============================================
CREATE TABLE IF NOT EXISTS request_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name_en VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100) NOT NULL,
    icon VARCHAR(50) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for request_types
CREATE INDEX IF NOT EXISTS idx_request_types_tenant_id ON request_types(tenant_id);
CREATE INDEX IF NOT EXISTS idx_request_types_active ON request_types(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_request_types_order ON request_types(tenant_id, display_order);

-- ============================================
-- TOKEN BLACKLIST TABLE (For logout/invalidation)
-- ============================================
CREATE TABLE IF NOT EXISTS token_blacklist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_type VARCHAR(20) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    blacklisted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason VARCHAR(50) DEFAULT 'logout',
    ip_address VARCHAR(45),
    user_agent TEXT
);

-- Indexes for token_blacklist
CREATE INDEX IF NOT EXISTS idx_token_blacklist_token ON token_blacklist(token);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_user_id ON token_blacklist(user_id);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist(expires_at);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_token_type ON token_blacklist(token_type);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at column
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tables_updated_at
    BEFORE UPDATE ON tables
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_requests_updated_at
    BEFORE UPDATE ON service_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_request_types_updated_at
    BEFORE UPDATE ON request_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE tenants IS 'Multi-tenant restaurants with branding and configuration';
COMMENT ON TABLE users IS 'System users including superadmin, admin, and waiters';
COMMENT ON TABLE tables IS 'Restaurant tables with QR codes';
COMMENT ON TABLE service_requests IS 'Customer service requests from tables';
COMMENT ON TABLE subscriptions IS 'Tenant subscription and billing information';
COMMENT ON TABLE permissions IS 'System permissions for role-based access control';
COMMENT ON TABLE role_permissions IS 'Junction table mapping roles to permissions';
COMMENT ON TABLE request_types IS 'Customizable request types per tenant';
COMMENT ON TABLE audit_logs IS 'Audit trail for system actions';
COMMENT ON TABLE token_blacklist IS 'Blacklisted JWT tokens for logout and invalidation';

-- ============================================
-- INITIAL DATA SEEDING
-- ============================================

-- Insert default permissions
INSERT INTO permissions (name, description, category) VALUES
    ('manage_users', 'Create, update, and delete users', 'users'),
    ('view_users', 'View user list and details', 'users'),
    ('manage_tables', 'Create, update, and delete tables', 'tables'),
    ('view_tables', 'View table list and details', 'tables'),
    ('manage_requests', 'Acknowledge and complete service requests', 'requests'),
    ('view_requests', 'View service requests', 'requests'),
    ('manage_settings', 'Update tenant settings and branding', 'settings'),
    ('view_settings', 'View tenant settings', 'settings'),
    ('generate_qr', 'Generate QR codes for tables', 'system'),
    ('view_analytics', 'View analytics and reports', 'analytics'),
    ('manage_tenants', 'Create, update, and manage tenants (superadmin)', 'system'),
    ('manage_subscriptions', 'Manage tenant subscriptions (superadmin)', 'system'),
    ('view_audit_logs', 'View audit logs', 'system'),
    ('manage_request_types', 'Create and manage custom request types', 'requests')
ON CONFLICT (name) DO NOTHING;

-- Map permissions to roles
-- SuperAdmin gets all permissions
INSERT INTO role_permissions (role, permission_id)
SELECT 'superadmin', id FROM permissions
ON CONFLICT (role, permission_id) DO NOTHING;

-- Admin gets most permissions (except tenant/subscription management)
INSERT INTO role_permissions (role, permission_id)
SELECT 'admin', id FROM permissions
WHERE name IN (
    'manage_users', 'view_users',
    'manage_tables', 'view_tables',
    'manage_requests', 'view_requests',
    'manage_settings', 'view_settings',
    'generate_qr', 'view_analytics',
    'view_audit_logs', 'manage_request_types'
)
ON CONFLICT (role, permission_id) DO NOTHING;

-- Waiter gets limited permissions
INSERT INTO role_permissions (role, permission_id)
SELECT 'waiter', id FROM permissions
WHERE name IN (
    'view_users', 'view_tables',
    'manage_requests', 'view_requests',
    'view_settings'
)
ON CONFLICT (role, permission_id) DO NOTHING;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

-- Verify tables were created
SELECT 
    schemaname, 
    tablename, 
    tableowner 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'tenants', 'users', 'tables', 'service_requests', 
    'subscriptions', 'permissions', 'role_permissions', 
    'request_types', 'audit_logs', 'token_blacklist'
)
ORDER BY tablename;
