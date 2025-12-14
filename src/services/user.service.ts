import { db } from '../database/db';
import { users, tenants, NewUser } from '../database/schema';
import { eq, desc, and, or, ilike, sql, SQL } from 'drizzle-orm';
import { hashPassword } from '../utils/password';

export class UserService {
  /**
   * Get all users with tenant information (legacy - non-paginated)
   */
  async getAllUsers() {
    return await db
      .select({
        id: users.id,
        tenantId: users.tenantId,
        username: users.username,
        email: users.email,
        role: users.role,
        fullName: users.fullName,
        active: users.active,
        lastLogin: users.lastLogin,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        tenantName: tenants.name,
        tenantSubdomain: tenants.subdomain,
        tenantSlug: tenants.slug,
      })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .orderBy(desc(users.createdAt));
  }

  /**
   * Get all users with pagination and filters
   */
  async getAllUsersPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    tenantId?: string;
    role?: string;
    active?: boolean;
  }) {
    const { page, limit, search, tenantId, role, active } = options;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions: SQL[] = [];

    if (search) {
      const searchPattern = `%${search}%`;
      const searchCondition = or(
        ilike(users.username, searchPattern),
        ilike(users.email, searchPattern),
        ilike(users.fullName, searchPattern),
        ilike(tenants.name, searchPattern),
      );
      // Only add condition if it's not null
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    if (tenantId) {
      conditions.push(eq(users.tenantId, tenantId));
    }

    if (role) {
      conditions.push(eq(users.role, role));
    }

    if (active !== undefined) {
      conditions.push(eq(users.active, active));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(whereClause);

    const total = countResult?.count || 0;

    // Get paginated data
    const data = await db
      .select({
        id: users.id,
        tenantId: users.tenantId,
        username: users.username,
        email: users.email,
        role: users.role,
        fullName: users.fullName,
        active: users.active,
        lastLogin: users.lastLogin,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        tenantName: tenants.name,
        tenantSubdomain: tenants.subdomain,
        tenantSlug: tenants.slug,
      })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      users: data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get users by tenant ID
   */
  async getUsersByTenant(tenantId: string) {
    return await db
      .select({
        id: users.id,
        tenantId: users.tenantId,
        username: users.username,
        email: users.email,
        role: users.role,
        fullName: users.fullName,
        active: users.active,
        lastLogin: users.lastLogin,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        tenantName: tenants.name,
        tenantSubdomain: tenants.subdomain,
        tenantSlug: tenants.slug,
      })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(eq(users.tenantId, tenantId))
      .orderBy(desc(users.createdAt));
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);

    return user || null;
  }

  /**
   * Get user by username and tenant
   */
  async getUserByUsername(username: string, tenantId: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.username, username), eq(users.tenantId, tenantId)))
      .limit(1);

    return user || null;
  }

  /**
   * Create new user
   */
  async createUser(
    userData: Omit<NewUser, 'id' | 'createdAt' | 'updatedAt' | 'lastLogin'> & { password?: string },
  ) {
    // Hash password if provided
    const { password, ...userDataWithoutPassword } = userData;
    let passwordHash = userData.passwordHash;
    if (password) {
      passwordHash = await hashPassword(password);
    }

    const newUser: NewUser = {
      ...userDataWithoutPassword,
      passwordHash: passwordHash || (await hashPassword('DefaultPassword123!')),
      role: userData.role || 'waiter',
      active: userData.active !== undefined ? userData.active : true,
    };

    const result = await db.insert(users).values(newUser).returning();

    return result[0];
  }

  /**
   * Update user
   */
  async updateUser(id: string, updates: Partial<NewUser> & { password?: string }) {
    const updateData = { ...updates };

    // Hash password if provided
    if (updateData.password) {
      updateData.passwordHash = await hashPassword(updateData.password);
      delete updateData.password;
    }

    const result = await db
      .update(users)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return result[0] || null;
  }

  /**
   * Update last login
   */
  async updateLastLogin(id: string) {
    await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, id));
  }

  /**
   * Delete user
   */
  async deleteUser(id: string) {
    const result = await db.delete(users).where(eq(users.id, id));

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Check if user exists and is active
   */
  async isUserActive(id: string) {
    const user = await this.getUserById(id);
    return user?.active;
  }

  /**
   * Get user count by tenant
   */
  async getUserCountByTenant(tenantId: string) {
    const result = await db
      .select({ count: users.id })
      .from(users)
      .where(eq(users.tenantId, tenantId));

    return result.length;
  }
}
