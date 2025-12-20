import { db } from '../database/db';
import { users, User, tenants, tokenBlacklist } from '../database/schema';
import { eq, and, lt } from 'drizzle-orm';
import { comparePassword } from '../utils/password';
import { generateTokenPair, verifyToken, JWTPayload, TokenPair } from '../utils/jwt';

export class AuthService {
  /**
   * Login user with email/username and password
   */
  async login(
    identifier: string,
    password: string,
    tenantId?: string,
  ): Promise<{ user: Omit<User, 'passwordHash'>; tokens: TokenPair } | null> {
    // Find user by email or username
    const query = db.select().from(users).where(eq(users.email, identifier)).limit(1);

    let [user] = await query;

    // If not found by email, try username (with tenantId for tenant-scoped users)
    if (!user && tenantId) {
      [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.username, identifier), eq(users.tenantId, tenantId)))
        .limit(1);
    }

    if (!user) {
      return null;
    }

    // Check if user is active
    if (!user.active) {
      throw new Error('User account is inactive');
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return null;
    }

    // Update last login
    await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id));

    // Fetch tenant subdomain if user has a tenantId
    let tenantSubdomain: string | undefined;
    let tenantSlug: string | undefined;
    if (user.tenantId) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, user.tenantId))
        .limit(1);
      tenantSubdomain = tenant?.subdomain || undefined;
      tenantSlug = tenant?.slug || undefined;
    }

    // Generate tokens
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId || undefined,
      tenantSubdomain,
      tenantSlug,
      isSuperAdmin: user.isSuperAdmin,
    };

    const tokens = generateTokenPair(payload);

    // Remove password hash from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      tokens,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenPair | null> {
    try {
      const payload = verifyToken(refreshToken);

      // Verify user still exists and is active
      const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);

      if (!user?.active) {
        return null;
      }

      // Generate new token pair
      const newPayload: JWTPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId || undefined,
        isSuperAdmin: user.isSuperAdmin,
      };

      return generateTokenPair(newPayload);
    } catch {
      return null;
    }
  }

  /**
   * Validate token and return user info
   */
  async validateToken(token: string): Promise<JWTPayload | null> {
    try {
      // First check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(token);
      if (isBlacklisted) {
        return null;
      }

      const payload = verifyToken(token);

      // Verify user still exists and is active
      const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);

      if (!user?.active) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Get current user by ID
   */
  async getCurrentUser(userId: string) {
    const [user] = await db
      .select({
        id: users.id,
        tenantId: users.tenantId,
        username: users.username,
        email: users.email,
        role: users.role,
        isSuperAdmin: users.isSuperAdmin,
        fullName: users.fullName,
        active: users.active,
        lastLogin: users.lastLogin,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user || null;
  }

  /**
   * Logout user by blacklisting their tokens
   */
  async logout(
    accessToken: string,
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<boolean> {
    try {
      // Verify and decode tokens to get user info and expiration
      const accessPayload = verifyToken(accessToken);
      const refreshPayload = verifyToken(refreshToken);

      if (!accessPayload || !refreshPayload) {
        return false;
      }

      // Ensure both tokens belong to the same user
      if (accessPayload.userId !== refreshPayload.userId) {
        return false;
      }

      const userId = accessPayload.userId;

      // Calculate expiration times (tokens expire in 15min for access, 7 days for refresh)
      const accessExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Blacklist both tokens
      await db.insert(tokenBlacklist).values([
        {
          token: accessToken,
          userId,
          tokenType: 'access',
          expiresAt: accessExpiresAt,
          reason: 'logout',
          ipAddress,
          userAgent,
        },
        {
          token: refreshToken,
          userId,
          tokenType: 'refresh',
          expiresAt: refreshExpiresAt,
          reason: 'logout',
          ipAddress,
          userAgent,
        },
      ]);

      return true;
    } catch {
      // If token verification fails, we can't blacklist but logout is still successful
      // (tokens are already invalid)
      return true;
    }
  }

  /**
   * Check if a token is blacklisted
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const [blacklisted] = await db
        .select()
        .from(tokenBlacklist)
        .where(eq(tokenBlacklist.token, token))
        .limit(1);

      return !!blacklisted;
    } catch {
      return false;
    }
  }

  /**
   * Clean up expired blacklisted tokens (maintenance method)
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await db
        .delete(tokenBlacklist)
        .where(lt(tokenBlacklist.expiresAt, new Date()));

      return result.rowCount || 0;
    } catch {
      return 0;
    }
  }
}
