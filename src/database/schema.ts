import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================
// TENANTS TABLE (Restaurants)
// ============================================
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    subdomain: varchar('subdomain', { length: 100 }).unique(),
    active: boolean('active').default(true).notNull(),
    licenseEnabled: boolean('license_enabled').default(true).notNull(), // Per-tenant license control
    settings: jsonb('settings').default({}).notNull(),
    // Branding / Theme customization
    logoUrl: text('logo_url'),
    faviconUrl: text('favicon_url'),
    primaryColor: varchar('primary_color', { length: 7 }).default('#667eea'), // Hex color
    secondaryColor: varchar('secondary_color', { length: 7 }).default('#764ba2'),
    accentColor: varchar('accent_color', { length: 7 }).default('#f093fb'),
    textColor: varchar('text_color', { length: 7 }).default('#333333'),
    languageColor: varchar('language_color', { length: 7 }).default('#333333'),
    // Background & Patterns
    backgroundPattern: varchar('background_pattern', { length: 50 }),
    gradientStartColor: varchar('gradient_start_color', { length: 7 }),
    gradientEndColor: varchar('gradient_end_color', { length: 7 }),
    gradientDirection: varchar('gradient_direction', { length: 50 }).default('to right'),
    customCss: text('custom_css'), // Optional custom CSS
    theme: jsonb('theme').default({}), // Additional theme settings (fonts, etc.)
    // Social Media Links
    facebookUrl: text('facebook_url'),
    instagramUrl: text('instagram_url'),
    twitterUrl: text('twitter_url'),
    linkedinUrl: text('linkedin_url'),
    // Menu URL - Global setting for all restaurants
    menuUrl: text('menu_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index('idx_tenants_slug').on(table.slug),
    subdomainIdx: index('idx_tenants_subdomain').on(table.subdomain),
    activeIdx: index('idx_tenants_active').on(table.active),
  }),
);

// ============================================
// USERS TABLE (Multi-Tenant + SuperAdmin)
// ============================================
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }), // Nullable for superadmin
    username: varchar('username', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: varchar('role', { length: 20 }).notNull(), // 'superadmin', 'admin', 'waiter'
    isSuperAdmin: boolean('is_super_admin').default(false).notNull(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    active: boolean('active').default(true).notNull(),
    lastLogin: timestamp('last_login', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('idx_users_tenant_id').on(table.tenantId),
    emailIdx: index('idx_users_email').on(table.email),
    roleIdx: index('idx_users_role').on(table.role),
    superAdminIdx: index('idx_users_super_admin').on(table.isSuperAdmin),
    uniqueUsername: unique('unique_tenant_username').on(table.tenantId, table.username),
  }),
);

// ============================================
// TABLES TABLE (Multi-Tenant)
// ============================================
export const tables = pgTable(
  'tables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tableNumber: varchar('table_number', { length: 50 }).notNull(), // Display name like "T-01", "Table 5"
    name: varchar('name', { length: 100 }), // Optional friendly name
    qrCodeUrl: text('qr_code_url'),
    status: varchar('status', { length: 20 }).default('active').notNull(), // 'active', 'inactive'
    zone: varchar('zone', { length: 50 }),
    capacity: integer('capacity'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('idx_tables_tenant_id').on(table.tenantId),
    statusIdx: index('idx_tables_status').on(table.tenantId, table.status),
    uniqueTableNumber: unique('unique_tenant_table_number').on(table.tenantId, table.tableNumber),
  }),
);

// ============================================
// SERVICE REQUESTS TABLE (Multi-Tenant)
// ============================================
export const serviceRequests = pgTable(
  'service_requests',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'cascade' }),
    requestType: varchar('request_type', { length: 50 }).notNull(), // Legacy: 'call_waiter', 'bill', etc. | New: UUID reference to request_types
    status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending', 'acknowledged', 'completed', 'cancelled'
    customNote: text('custom_note'),
    timestampCreated: timestamp('timestamp_created', { withTimezone: true }).defaultNow().notNull(),
    timestampAcknowledged: timestamp('timestamp_acknowledged', { withTimezone: true }),
    timestampCompleted: timestamp('timestamp_completed', { withTimezone: true }),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id, { onDelete: 'set null' }),
    completedBy: varchar('completed_by', { length: 50 }), // 'waiter' or 'customer'
    durationSeconds: integer('duration_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('idx_requests_tenant_id').on(table.tenantId),
    tableIdIdx: index('idx_requests_table_id').on(table.tableId),
    statusIdx: index('idx_requests_status').on(table.tenantId, table.status),
    createdIdx: index('idx_requests_created').on(table.tenantId, table.timestampCreated),
    acknowledgedByIdx: index('idx_requests_acknowledged_by').on(table.acknowledgedBy),
    statusCreatedIdx: index('idx_requests_status_created').on(
      table.tenantId,
      table.status,
      table.timestampCreated,
    ),
  }),
);

// ============================================
// SUBSCRIPTIONS TABLE
// ============================================
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' })
      .unique(),
    plan: varchar('plan', { length: 50 }).notNull(), // 'free', 'basic', 'standard', 'premium', 'custom' - just a label
    status: varchar('status', { length: 20 }).default('active').notNull(), // 'active', 'expired', 'cancelled', 'suspended'
    startDate: timestamp('start_date', { withTimezone: true }).defaultNow().notNull(),
    endDate: timestamp('end_date', { withTimezone: true }),
    lastPaymentDate: timestamp('last_payment_date', { withTimezone: true }),
    nextPaymentDate: timestamp('next_payment_date', { withTimezone: true }),
    amount: integer('amount'), // Amount in cents (1 USD = 100 cents)
    tax: integer('tax'), // Tax amount in cents (fixed amount)
    currency: varchar('currency', { length: 3 }).default('USD'),
    paymentMethod: varchar('payment_method', { length: 50 }),
    maxTables: integer('max_tables').default(10).notNull(), // Maximum tables allowed
    maxUsers: integer('max_users').default(5).notNull(), // Maximum users allowed
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('idx_subscriptions_tenant_id').on(table.tenantId),
    statusIdx: index('idx_subscriptions_status').on(table.status),
    endDateIdx: index('idx_subscriptions_end_date').on(table.endDate),
    planIdx: index('idx_subscriptions_plan').on(table.plan),
  }),
);

// ============================================
// PERMISSIONS TABLE
// ============================================
export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull().unique(), // e.g., 'manage_users', 'view_analytics', 'generate_qr'
    description: text('description'),
    category: varchar('category', { length: 50 }), // e.g., 'users', 'tables', 'analytics', 'system'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: index('idx_permissions_name').on(table.name),
    categoryIdx: index('idx_permissions_category').on(table.category),
  }),
);

// ============================================
// ROLE PERMISSIONS TABLE (Junction)
// ============================================
export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    role: varchar('role', { length: 20 }).notNull(), // 'superadmin', 'admin', 'waiter'
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    roleIdx: index('idx_role_permissions_role').on(table.role),
    permissionIdIdx: index('idx_role_permissions_permission_id').on(table.permissionId),
    uniqueRolePermission: unique('unique_role_permission').on(table.role, table.permissionId),
  }),
);

// ============================================
// REQUEST TYPES TABLE (Multi-Tenant)
// ============================================
export const requestTypes = pgTable(
  'request_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    nameEn: varchar('name_en', { length: 100 }).notNull(),
    nameAr: varchar('name_ar', { length: 100 }).notNull(),
    icon: varchar('icon', { length: 50 }).notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('idx_request_types_tenant_id').on(table.tenantId),
    activeIdx: index('idx_request_types_active').on(table.tenantId, table.active),
    orderIdx: index('idx_request_types_order').on(table.tenantId, table.displayOrder),
  }),
);

// ============================================
// AUDIT LOGS TABLE
// ============================================
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }), // Nullable for platform-wide actions
    action: varchar('action', { length: 100 }).notNull(), // e.g., 'tenant_created', 'tenant_blocked', 'subscription_updated'
    entityType: varchar('entity_type', { length: 50 }), // e.g., 'tenant', 'user', 'subscription'
    entityId: uuid('entity_id'),
    changes: jsonb('changes'), // Store before/after values
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('idx_audit_logs_user_id').on(table.userId),
    tenantIdIdx: index('idx_audit_logs_tenant_id').on(table.tenantId),
    actionIdx: index('idx_audit_logs_action').on(table.action),
    createdIdx: index('idx_audit_logs_created').on(table.createdAt),
    entityIdx: index('idx_audit_logs_entity').on(table.entityType, table.entityId),
  }),
);

// ============================================
// TOKEN BLACKLIST TABLE (For logout/invalidation)
// ============================================
export const tokenBlacklist = pgTable(
  'token_blacklist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull().unique(), // The actual JWT token
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenType: varchar('token_type', { length: 20 }).notNull(), // 'access' or 'refresh'
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // When the token would naturally expire
    blacklistedAt: timestamp('blacklisted_at', { withTimezone: true }).defaultNow().notNull(),
    reason: varchar('reason', { length: 50 }).default('logout'), // 'logout', 'password_change', 'session_expired', etc.
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
  },
  (table) => ({
    tokenIdx: index('idx_token_blacklist_token').on(table.token),
    userIdIdx: index('idx_token_blacklist_user_id').on(table.userId),
    expiresAtIdx: index('idx_token_blacklist_expires_at').on(table.expiresAt),
    tokenTypeIdx: index('idx_token_blacklist_token_type').on(table.tokenType),
  }),
);

// ============================================
// RELATIONS
// ============================================
export const tenantsRelations = relations(tenants, ({ many, one }) => ({
  users: many(users),
  tables: many(tables),
  serviceRequests: many(serviceRequests),
  requestTypes: many(requestTypes),
  subscription: one(subscriptions, {
    fields: [tenants.id],
    references: [subscriptions.tenantId],
  }),
  auditLogs: many(auditLogs),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  acknowledgedRequests: many(serviceRequests),
  auditLogs: many(auditLogs),
}));

export const tablesRelations = relations(tables, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [tables.tenantId],
    references: [tenants.id],
  }),
  serviceRequests: many(serviceRequests),
}));

export const serviceRequestsRelations = relations(serviceRequests, ({ one }) => ({
  tenant: one(tenants, {
    fields: [serviceRequests.tenantId],
    references: [tenants.id],
  }),
  table: one(tables, {
    fields: [serviceRequests.tableId],
    references: [tables.id],
  }),
  acknowledgedByUser: one(users, {
    fields: [serviceRequests.acknowledgedBy],
    references: [users.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  tenant: one(tenants, {
    fields: [subscriptions.tenantId],
    references: [tenants.id],
  }),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const requestTypesRelations = relations(requestTypes, ({ one }) => ({
  tenant: one(tenants, {
    fields: [requestTypes.tenantId],
    references: [tenants.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [auditLogs.tenantId],
    references: [tenants.id],
  }),
}));

export const tokenBlacklistRelations = relations(tokenBlacklist, ({ one }) => ({
  user: one(users, {
    fields: [tokenBlacklist.userId],
    references: [users.id],
  }),
}));

// ============================================
// TYPE EXPORTS
// ============================================
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Table = typeof tables.$inferSelect;
export type NewTable = typeof tables.$inferInsert;

export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type NewServiceRequest = typeof serviceRequests.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;

export type RequestType = typeof requestTypes.$inferSelect;
export type NewRequestType = typeof requestTypes.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type TokenBlacklist = typeof tokenBlacklist.$inferSelect;
export type NewTokenBlacklist = typeof tokenBlacklist.$inferInsert;

// ============================================
// FEEDBACK TABLE (Customer Feedback)
// ============================================
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'cascade' }),
    requestId: varchar('request_id', { length: 50 }).references(() => serviceRequests.id, { onDelete: 'set null' }),
    rating: integer('rating').notNull(), // 1-5 stars
    comments: text('comments'),
    customerName: varchar('customer_name', { length: 255 }),
    customerPhone: varchar('customer_phone', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdIdx: index('idx_feedback_tenant_id').on(table.tenantId),
    tableIdIdx: index('idx_feedback_table_id').on(table.tableId),
    requestIdIdx: index('idx_feedback_request_id').on(table.requestId),
    ratingIdx: index('idx_feedback_rating').on(table.rating),
    createdAtIdx: index('idx_feedback_created_at').on(table.createdAt),
  }),
);

export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;
