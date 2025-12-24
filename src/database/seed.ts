import { db } from '../database/db';
import {
  tenants,
  users,
  tables,
  subscriptions,
  permissions,
  rolePermissions,
  requestTypes,
  serviceRequests,
  auditLogs,
} from '../database/schema';
import { eq, and } from 'drizzle-orm';
import logger from '../utils/logger';
import { hashPassword } from '../utils/password';

async function seed() {
  logger.info('🌱 Starting comprehensive database seed...');
  logger.info('This will create: Superadmin, Tenants, Users, Tables, Subscriptions, Permissions, Request Types, and Sample Data');

  try {
    // ============================================
    // 1. CREATE SUPERADMIN USER
    // ============================================
    logger.info('\n📌 Creating superadmin user...');
    const existingSuperAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, 'superadmin@pointwaiterservice.com'))
      .limit(1);

    if (existingSuperAdmin.length === 0) {
      const hashedPassword = await hashPassword('SuperAdmin123!');

      await db
        .insert(users)
        .values({
          username: 'superadmin',
          email: 'superadmin@pointwaiterservice.com',
          passwordHash: hashedPassword,
          role: 'superadmin',
          isSuperAdmin: true,
          fullName: 'Super Administrator',
          active: true,
          tenantId: null, // Superadmin is not tied to any tenant
        })
        .returning();

      logger.info('✅ Created superadmin user');
      logger.info('   Email: superadmin@pointwaiterservice.com');
      logger.info('   Password: SuperAdmin123!');
    } else {
      logger.info('✅ Superadmin user already exists');
    }

    // ============================================
    // 2. CREATE SAMPLE TENANTS
    // ============================================
    logger.info('\n📌 Creating sample tenants...');

    const tenantsData = [
      {
        name: "McDonald's",
        slug: 'mcdonalds',
        subdomain: 'mcdonalds',
        plan: 'premium',
        maxTables: 50,
        maxUsers: 20,
        active: true,
        logoUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/McDonald%27s_Golden_Arches.svg/200px-McDonald%27s_Golden_Arches.svg.png',
        primaryColor: '#FFC72C',
        secondaryColor: '#DA291C',
        accentColor: '#27251F',
        textColor: '#27251F',
        facebookUrl: 'https://facebook.com/mcdonalds',
        instagramUrl: 'https://instagram.com/mcdonalds',
        twitterUrl: 'https://twitter.com/mcdonalds',
        linkedinUrl: 'https://linkedin.com/company/mcdonald-s-corporation',
      },
      {
        name: 'Starbucks Coffee',
        slug: 'starbucks',
        subdomain: 'starbucks',
        plan: 'basic',
        maxTables: 20,
        maxUsers: 10,
        active: true,
        logoUrl:
          'https://upload.wikimedia.org/wikipedia/en/thumb/d/d3/Starbucks_Corporation_Logo_2011.svg/200px-Starbucks_Corporation_Logo_2011.svg.png',
        primaryColor: '#00704A',
        secondaryColor: '#1E3932',
        accentColor: '#00A862',
        textColor: '#1E3932',
        facebookUrl: 'https://facebook.com/starbucks',
        instagramUrl: 'https://instagram.com/starbucks',
        twitterUrl: 'https://twitter.com/starbucks',
        linkedinUrl: 'https://linkedin.com/company/starbucks',
      },
      {
        name: 'Pizza Hut',
        slug: 'pizzahut',
        subdomain: 'pizzahut',
        plan: 'free',
        maxTables: 10,
        maxUsers: 5,
        active: true,
        logoUrl:
          'https://upload.wikimedia.org/wikipedia/en/thumb/d/d2/Pizza_Hut_logo.svg/200px-Pizza_Hut_logo.svg.png',
        primaryColor: '#EE3124',
        secondaryColor: '#00A878',
        accentColor: '#FFC72C',
        textColor: '#333333',
        facebookUrl: 'https://facebook.com/pizzahut',
        instagramUrl: 'https://instagram.com/pizzahut',
        twitterUrl: 'https://twitter.com/pizzahut',
        linkedinUrl: 'https://linkedin.com/company/pizza-hut',
      },
      {
        name: 'Oula Lounge',
        slug: 'oula-lounge',
        subdomain: 'oula-lounge',
        plan: 'premium',
        maxTables: 25,
        maxUsers: 15,
        active: true,
        logoUrl: 'https://images.deliveryhero.io/image/talabat/restaurants/logo_10638754881924874977.jpg?width=180',
        primaryColor: '#004d40',
        secondaryColor: '#00695c',
        accentColor: '#00bfa5',
        textColor: '#ffffff',
        facebookUrl: null,
        instagramUrl: null,
        twitterUrl: null,
        linkedinUrl: null,
      },
    ];

    const createdTenants = [];

    for (const tenantData of tenantsData) {
      const existing = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, tenantData.slug))
        .limit(1);

      if (existing.length === 0) {
        const [tenant] = await db.insert(tenants).values(tenantData).returning();

        createdTenants.push(tenant);
        logger.info(`✅ Created tenant: ${tenant.name}`);
      } else {
        createdTenants.push(existing[0]);
        logger.info(`✅ Tenant already exists: ${existing[0].name}`);
      }
    }

    // ============================================
    // 3. CREATE SUBSCRIPTIONS FOR TENANTS
    // ============================================
    logger.info('\n📌 Creating subscriptions...');

    for (const tenant of createdTenants) {
      const existingSub = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, tenant.id))
        .limit(1);

      if (existingSub.length === 0) {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + (tenant.plan === 'free' ? 1 : 12));

        await db.insert(subscriptions).values({
          tenantId: tenant.id,
          plan: tenant.plan,
          status: 'active',
          startDate: new Date(),
          endDate: endDate,
          amount: tenant.plan === 'premium' ? 9900 : tenant.plan === 'basic' ? 4900 : 0,
          currency: 'USD',
          paymentMethod: tenant.plan !== 'free' ? 'credit_card' : null,
        });

        logger.info(`✅ Created subscription for ${tenant.name}`);
      } else {
        logger.info(`✅ Subscription already exists for ${tenant.name}`);
      }
    }

    // ============================================
    // 4. CREATE USERS FOR EACH TENANT
    // ============================================
    logger.info('\n📌 Creating tenant users...');

    for (const tenant of createdTenants) {
      // Create admin user
      const adminEmail = `admin@${tenant.slug}.com`;
      const existingAdmin = await db
        .select()
        .from(users)
        .where(eq(users.email, adminEmail))
        .limit(1);

      if (existingAdmin.length === 0) {
        const hashedPassword = await hashPassword('Admin123!');

        await db.insert(users).values({
          tenantId: tenant.id,
          username: 'admin',
          email: adminEmail,
          passwordHash: hashedPassword,
          role: 'admin',
          isSuperAdmin: false,
          fullName: `${tenant.name} Admin`,
          active: true,
        });

        logger.info(`✅ Created admin for ${tenant.name}`);
        logger.info(`   Email: ${adminEmail}`);
        logger.info(`   Password: Admin123!`);
      }

      // Create waiter users
      for (let i = 1; i <= 3; i++) {
        const waiterEmail = `waiter${i}@${tenant.slug}.com`;
        const existingWaiter = await db
          .select()
          .from(users)
          .where(eq(users.email, waiterEmail))
          .limit(1);

        if (existingWaiter.length === 0) {
          const hashedPassword = await hashPassword('Waiter123!');

          await db.insert(users).values({
            tenantId: tenant.id,
            username: `waiter${i}`,
            email: waiterEmail,
            passwordHash: hashedPassword,
            role: 'waiter',
            isSuperAdmin: false,
            fullName: `Waiter ${i}`,
            active: true,
          });

          logger.info(`✅ Created waiter${i} for ${tenant.name}`);
        }
      }
    }

    // ============================================
    // 5. CREATE TABLES FOR EACH TENANT
    // ============================================
    logger.info('\n📌 Creating tables...');

    for (const tenant of createdTenants) {
      const existingTables = await db
        .select()
        .from(tables)
        .where(eq(tables.tenantId, tenant.id))
        .limit(1);

      if (existingTables.length === 0) {
        const tablesToCreate = [];
        const numTables = tenant.plan === 'premium' ? 15 : tenant.plan === 'basic' ? 10 : 5;

        for (let i = 1; i <= numTables; i++) {
          // Format table numbers with leading zeros for better sorting (T-01, T-02, etc.)
          const tableNum = i.toString().padStart(2, '0');
          tablesToCreate.push({
            tenantId: tenant.id,
            tableNumber: `T-${tableNum}`,
            name: `Table ${i}`, // Optional friendly name
            status: 'active' as const,
            zone: i <= Math.ceil(numTables / 2) ? 'Indoor' : 'Outdoor',
            capacity: i % 3 === 0 ? 6 : i % 2 === 0 ? 4 : 2,
          });
        }

        await db.insert(tables).values(tablesToCreate);
        logger.info(`✅ Created ${numTables} tables for ${tenant.name}`);
      } else {
        logger.info(`✅ Tables already exist for ${tenant.name}`);
      }
    }

    // ============================================
    // 6. CREATE PERMISSIONS
    // ============================================
    logger.info('\n📌 Creating permissions...');

    const permissionsData = [
      { name: 'manage_users', description: 'Create, update, and delete users', category: 'users' },
      { name: 'view_users', description: 'View user list and details', category: 'users' },
      { name: 'manage_tables', description: 'Create, update, and delete tables', category: 'tables' },
      { name: 'view_tables', description: 'View table list and details', category: 'tables' },
      { name: 'generate_qr', description: 'Generate QR codes for tables', category: 'system' },
      { name: 'view_analytics', description: 'View analytics and reports', category: 'analytics' },
      { name: 'manage_settings', description: 'Update tenant settings and branding', category: 'settings' },
      { name: 'view_settings', description: 'View tenant settings', category: 'settings' },
      { name: 'view_requests', description: 'View service requests', category: 'requests' },
      { name: 'manage_requests', description: 'Acknowledge and complete service requests', category: 'requests' },
      { name: 'manage_tenants', description: 'Create, update, and manage tenants (superadmin)', category: 'system' },
      { name: 'manage_subscriptions', description: 'Manage tenant subscriptions (superadmin)', category: 'system' },
      { name: 'view_audit_logs', description: 'View audit logs', category: 'system' },
      { name: 'manage_request_types', description: 'Create and manage custom request types', category: 'requests' },
    ];

    const createdPermissions = [];

    for (const permData of permissionsData) {
      const existing = await db
        .select()
        .from(permissions)
        .where(eq(permissions.name, permData.name))
        .limit(1);

      if (existing.length === 0) {
        const [perm] = await db.insert(permissions).values(permData).returning();

        createdPermissions.push(perm);
        logger.info(`✅ Created permission: ${perm.name}`);
      } else {
        createdPermissions.push(existing[0]);
      }
    }

    // ============================================
    // 7. ASSIGN PERMISSIONS TO ROLES
    // ============================================
    logger.info('\n📌 Assigning permissions to roles...');

    const rolePermissionsData = [
      // Superadmin - All permissions
      {
        role: 'superadmin',
        permissions: [
          'manage_users',
          'view_users',
          'manage_tables',
          'view_tables',
          'generate_qr',
          'view_analytics',
          'manage_settings',
          'view_settings',
          'view_requests',
          'manage_requests',
          'manage_tenants',
          'manage_subscriptions',
          'view_audit_logs',
          'manage_request_types',
        ],
      },
      // Admin - Most permissions except tenant/subscription management
      {
        role: 'admin',
        permissions: [
          'manage_users',
          'view_users',
          'manage_tables',
          'view_tables',
          'generate_qr',
          'view_analytics',
          'manage_settings',
          'view_settings',
          'view_requests',
          'manage_requests',
          'view_audit_logs',
          'manage_request_types',
        ],
      },
      // Waiter - Limited permissions
      {
        role: 'waiter',
        permissions: ['view_users', 'view_tables', 'view_requests', 'manage_requests', 'view_settings'],
      },
    ];

    for (const rolePermData of rolePermissionsData) {
      for (const permName of rolePermData.permissions) {
        const permission = createdPermissions.find((p) => p.name === permName);
        if (!permission) continue;

        // Check if this specific role-permission combination already exists
        const existing = await db
          .select()
          .from(rolePermissions)
          .where(
            and(
              eq(rolePermissions.role, rolePermData.role),
              eq(rolePermissions.permissionId, permission.id),
            ),
          )
          .limit(1);

        // Only insert if it doesn't exist
        if (existing.length === 0) {
          await db.insert(rolePermissions).values({
            role: rolePermData.role,
            permissionId: permission.id,
          });
        }
      }
      logger.info(`✅ Assigned permissions to ${rolePermData.role}`);
    }

    // ============================================
    // 8. CREATE REQUEST TYPES FOR EACH TENANT
    // ============================================
    logger.info('\n📌 Creating request types for each tenant...');

    const defaultRequestTypes = [
      {
        nameEn: 'Call Waiter',
        nameAr: 'استدعاء النادل',
        icon: 'notifications',
        displayOrder: 1,
        active: true,
      },
      {
        nameEn: 'Request Bill',
        nameAr: 'طلب الفاتورة',
        icon: 'receipt',
        displayOrder: 2,
        active: true,
      },
      {
        nameEn: 'Assistance',
        nameAr: 'مساعدة',
        icon: 'help',
        displayOrder: 3,
        active: true,
      },
      {
        nameEn: 'Refill Drinks',
        nameAr: 'إعادة ملء المشروبات',
        icon: 'local_drink',
        displayOrder: 4,
        active: true,
      },
      {
        nameEn: 'Clean Table',
        nameAr: 'تنظيف الطاولة',
        icon: 'cleaning_services',
        displayOrder: 5,
        active: true,
      },
      {
        nameEn: 'Menu Request',
        nameAr: 'طلب القائمة',
        icon: 'menu_book',
        displayOrder: 6,
        active: true,
      },
    ];

    let totalRequestTypesCreated = 0;

    for (const tenant of createdTenants) {
      for (const requestType of defaultRequestTypes) {
        const existing = await db
          .select()
          .from(requestTypes)
          .where(
            and(
              eq(requestTypes.tenantId, tenant.id),
              eq(requestTypes.displayOrder, requestType.displayOrder),
            ),
          )
          .limit(1);

        if (existing.length === 0) {
          await db.insert(requestTypes).values({
            tenantId: tenant.id,
            nameEn: requestType.nameEn,
            nameAr: requestType.nameAr,
            icon: requestType.icon,
            displayOrder: requestType.displayOrder,
            active: requestType.active,
          });
          totalRequestTypesCreated++;
        }
      }
      logger.info(`✅ Created ${defaultRequestTypes.length} request types for ${tenant.name}`);
    }

    // ============================================
    // 9. CREATE SAMPLE SERVICE REQUESTS
    // ============================================
    logger.info('\n📌 Creating sample service requests...');

    let totalRequestsCreated = 0;

    for (const tenant of createdTenants) {
      // Get tenant's tables and request types
      const tenantTables = await db
        .select()
        .from(tables)
        .where(eq(tables.tenantId, tenant.id))
        .limit(5); // Just first 5 tables

      const tenantRequestTypes = await db
        .select()
        .from(requestTypes)
        .where(eq(requestTypes.tenantId, tenant.id))
        .limit(3); // First 3 request types

      const tenantWaiters = await db
        .select()
        .from(users)
        .where(and(eq(users.tenantId, tenant.id), eq(users.role, 'waiter')))
        .limit(2); // First 2 waiters

      if (tenantTables.length > 0 && tenantRequestTypes.length > 0) {
        // Create 5 sample requests: 2 pending, 2 acknowledged, 1 completed
        for (let i = 0; i < 5; i++) {
          const table = tenantTables[i % tenantTables.length];
          const requestType = tenantRequestTypes[i % tenantRequestTypes.length];
          const now = new Date();
          const timestamp = new Date(now.getTime() - (i + 1) * 3600000); // Each request 1 hour apart

          let status: 'pending' | 'acknowledged' | 'completed';
          let acknowledgedBy = null;
          let timestampAcknowledged = null;
          let timestampCompleted = null;
          let durationSeconds = null;

          if (i < 2) {
            status = 'pending';
          } else if (i < 4) {
            status = 'acknowledged';
            acknowledgedBy = tenantWaiters[i % tenantWaiters.length]?.id || null;
            timestampAcknowledged = new Date(timestamp.getTime() + 120000); // 2 minutes later
          } else {
            status = 'completed';
            acknowledgedBy = tenantWaiters[i % tenantWaiters.length]?.id || null;
            timestampAcknowledged = new Date(timestamp.getTime() + 120000); // 2 minutes later
            timestampCompleted = new Date(timestamp.getTime() + 420000); // 7 minutes after creation
            durationSeconds = 300; // 5 minutes to complete
          }

          const requestId = `REQ-${tenant.slug.toUpperCase()}-${Date.now()}-${i}`;

          const existing = await db
            .select()
            .from(serviceRequests)
            .where(eq(serviceRequests.id, requestId))
            .limit(1);

          if (existing.length === 0) {
            await db.insert(serviceRequests).values({
              id: requestId,
              tenantId: tenant.id,
              tableId: table.id,
              requestType: requestType.id as string, // UUID as string (max 50 chars in schema)
              status,
              customNote: i % 2 === 0 ? `Sample note for request ${i + 1}` : null,
              timestampCreated: timestamp,
              timestampAcknowledged,
              timestampCompleted,
              acknowledgedBy,
              durationSeconds,
            });
            totalRequestsCreated++;
          }
        }
        logger.info(`✅ Created 5 sample service requests for ${tenant.name}`);
      }
    }

    // ============================================
    // 10. CREATE SAMPLE AUDIT LOGS
    // ============================================
    logger.info('\n📌 Creating sample audit logs...');

    const superAdmin = await db
      .select()
      .from(users)
      .where(eq(users.isSuperAdmin, true))
      .limit(1);

    let totalAuditLogsCreated = 0;

    if (superAdmin.length > 0) {
      for (const tenant of createdTenants) {
        // Log tenant creation
        await db.insert(auditLogs).values({
          userId: superAdmin[0].id,
          tenantId: tenant.id,
          action: 'tenant_created',
          entityType: 'tenant',
          entityId: tenant.id,
          changes: {
            before: null,
            after: { name: tenant.name, slug: tenant.slug, plan: tenant.plan },
          },
          ipAddress: '127.0.0.1',
          userAgent: 'Seed Script',
        });
        totalAuditLogsCreated++;

        // Log subscription creation
        await db.insert(auditLogs).values({
          userId: superAdmin[0].id,
          tenantId: tenant.id,
          action: 'subscription_created',
          entityType: 'subscription',
          entityId: tenant.id,
          changes: {
            before: null,
            after: { plan: tenant.plan, status: 'active' },
          },
          ipAddress: '127.0.0.1',
          userAgent: 'Seed Script',
        });
        totalAuditLogsCreated++;
      }
      logger.info(`✅ Created ${totalAuditLogsCreated} audit log entries`);
    }

    // ============================================
    // SUMMARY
    // ============================================
    logger.info('\n🎉 Database seed completed successfully!');
    logger.info('\n📊 Summary:');
    logger.info(`   ✓ Superadmin: 1`);
    logger.info(`   ✓ Tenants: ${createdTenants.length}`);
    logger.info(`   ✓ Users: ${createdTenants.length * 4 + 1} (1 superadmin + ${createdTenants.length} admins + ${createdTenants.length * 3} waiters)`);
    logger.info(`   ✓ Subscriptions: ${createdTenants.length}`);
    logger.info(`   ✓ Permissions: ${createdPermissions.length}`);
    logger.info(`   ✓ Request Types: ${totalRequestTypesCreated}`);
    logger.info(`   ✓ Service Requests: ${totalRequestsCreated} (sample data)`);
    logger.info(`   ✓ Audit Logs: ${totalAuditLogsCreated}`);
    
    logger.info('\n🔑 Login Credentials:');
    logger.info('\n   🔐 Superadmin:');
    logger.info('      Email: superadmin@pointwaiterservice.com');
    logger.info('      Password: SuperAdmin123!');
    
    logger.info('\n   👨‍💼 Tenant Admins:');
    for (const tenant of createdTenants) {
      logger.info(`      ${tenant.name}:`);
      logger.info(`         Email: admin@${tenant.slug}.com`);
      logger.info(`         Password: Admin123!`);
    }
    
    logger.info('\n   👔 Waiters (for each tenant):');
    logger.info('      Email: waiter1@{tenant}.com, waiter2@{tenant}.com, waiter3@{tenant}.com');
    logger.info('      Password: Waiter123!');
    
    logger.info('\n🌐 Tenant Access:');
    for (const tenant of createdTenants) {
      logger.info(`   ${tenant.name}: http://${tenant.subdomain}.localhost:3000`);
    }
    
    logger.info('\n📱 Features Seeded:');
    logger.info('   ✓ Multi-tenant architecture with isolation');
    logger.info('   ✓ Role-based access control (RBAC)');
    logger.info('   ✓ Custom request types per tenant');
    logger.info('   ✓ Sample service requests with different statuses');
    logger.info('   ✓ Subscription management');
    logger.info('   ✓ Audit logging');
    logger.info('   ✓ Tenant branding & customization');
  } catch (error) {
    logger.error('❌ Seed failed:', error);
    throw error;
  }
}

// Run seed
seed()
  .then(() => {
    logger.info('\n✅ Seed script finished');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('\n❌ Seed script failed:', error);
    process.exit(1);
  });
