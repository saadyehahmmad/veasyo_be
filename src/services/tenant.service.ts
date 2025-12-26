import { db } from '../database/db';
import { tenants, NewTenant } from '../database/schema';
import { eq, desc } from 'drizzle-orm';
import { SubscriptionService } from './subscription.service';

export class TenantService {
  private subscriptionService: SubscriptionService;

  constructor() {
    this.subscriptionService = new SubscriptionService();
  }

  /**
   * Get all tenants
   */
  async getAllTenants() {
    return await db.select().from(tenants).orderBy(desc(tenants.createdAt));
  }

  /**
   * Get tenant by ID
   */
  async getTenantById(id: string) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);

    return tenant || null;
  }

  /**
   * Get tenant by slug or subdomain
   */
  async getTenantByIdentifier(identifier: string) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, identifier)).limit(1);

    if (tenant) return tenant;

    const [tenantBySubdomain] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.subdomain, identifier))
      .limit(1);

    return tenantBySubdomain || null;
  }

  /**
   * Create new tenant (without plan/limits - those come from subscription)
   */
  async createTenant(tenantData: Omit<NewTenant, 'id' | 'createdAt' | 'updatedAt'>) {
    const newTenant: NewTenant = {
      ...tenantData,
      active: tenantData.active !== undefined ? tenantData.active : false, // Default to false - requires subscription
      settings: tenantData.settings || {},
    };

    const result = await db.insert(tenants).values(newTenant).returning();

    return result[0];
  }

  /**
   * Update tenant
   */
  async updateTenant(id: string, updates: Partial<NewTenant>) {
    const result = await db
      .update(tenants)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, id))
      .returning();

    return result[0] || null;
  }

  /**
   * Delete tenant
   */
  async deleteTenant(id: string) {
    const result = await db.delete(tenants).where(eq(tenants.id, id));

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Check if tenant exists and is active (both active flag AND valid subscription)
   */
  async isTenantActive(id: string) {
    const tenant = await this.getTenantById(id);
    if (!tenant || !tenant.active) {
      return false;
    }

    // Check if tenant has valid subscription
    const hasValidSubscription = await this.subscriptionService.isTenantValid(id);
    return hasValidSubscription;
  }

  /**
   * Ensure tenant has valid subscription, throw error if not
   */
  async ensureTenantHasValidSubscription(tenantId: string): Promise<void> {
    const hasValidSubscription = await this.subscriptionService.isTenantValid(tenantId);
    if (!hasValidSubscription) {
      throw new Error('Tenant does not have a valid subscription');
    }
  }

  /**
   * Update tenant branding/theme
   */
  async updateTenantBranding(
    id: string,
    brandingData: {
      logoUrl?: string;
      faviconUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      textColor?: string;
      languageColor?: string;
      backgroundPattern?: string;
      gradientStartColor?: string;
      gradientEndColor?: string;
      gradientDirection?: string;
      customCss?: string;
      theme?: Record<string, unknown>;
      facebookUrl?: string;
      instagramUrl?: string;
      twitterUrl?: string;
      linkedinUrl?: string;
      menuUrl?: string | null;
      settings?: Record<string, unknown>;
    },
  ) {
    // Get current tenant to merge settings
    const currentTenant = await this.getTenantById(id);
    const currentSettings = currentTenant?.settings || {};
    
    // Merge settings if provided
    const updatedSettings = brandingData.settings 
      ? { ...currentSettings, ...brandingData.settings }
      : currentSettings;
    
    // Remove settings from brandingData before update
    const { ...brandingFields } = brandingData;
    
    const result = await db
      .update(tenants)
      .set({
        ...brandingFields,
        settings: updatedSettings,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, id))
      .returning();

    return result[0] || null;
  }

  /**
   * Get tenant branding by subdomain (public access)
   */
  async getTenantBrandingBySubdomain(subdomain: string) {
    const [tenant] = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        subdomain: tenants.subdomain,
        logoUrl: tenants.logoUrl,
        faviconUrl: tenants.faviconUrl,
        primaryColor: tenants.primaryColor,
        secondaryColor: tenants.secondaryColor,
        accentColor: tenants.accentColor,
        textColor: tenants.textColor,
        languageColor: tenants.languageColor,
        backgroundPattern: tenants.backgroundPattern,
        gradientStartColor: tenants.gradientStartColor,
        gradientEndColor: tenants.gradientEndColor,
        gradientDirection: tenants.gradientDirection,
        customCss: tenants.customCss,
        theme: tenants.theme,
        facebookUrl: tenants.facebookUrl,
        instagramUrl: tenants.instagramUrl,
        twitterUrl: tenants.twitterUrl,
        linkedinUrl: tenants.linkedinUrl,
        menuUrl: tenants.menuUrl,
        settings: tenants.settings,
      })
      .from(tenants)
      .where(eq(tenants.subdomain, subdomain))
      .limit(1);

    return tenant || null;
  }
}
