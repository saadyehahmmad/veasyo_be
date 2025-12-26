import logger from '../utils/logger';

/**
 * Subscription Plan Configuration
 * All prices in USD (US Dollar)
 * Currency: 1 USD = 100 cents (stored as integers)
 * NOTE: Pricing is now manually set by superadmin, these are reference values only
 */

export interface PlanConfig {
  id: string;
  name: string;
  price: number; // Monthly price in USD
  maxTables: number;
  maxWaiters: number; // Waiter users only (not including admin)
  features: string[];
  isCustom: boolean;
}

export interface PricingAddons {
  extraTablePrice: number; // Price per additional table (USD)
  extraWaiterPrice: number; // Price per additional waiter (USD)
  additionalPrinterPrice: number; // Price per additional printer (USD)
}

export interface CustomPlanCalculation {
  plan: 'custom';
  basePlan: string; // Which plan it's based on
  basePrice: number;
  tables: number;
  waiters: number;
  printers: number;
  extraTables: number;
  extraWaiters: number;
  extraTablesCost: number;
  extraWaitersCost: number;
  printersCost: number;
  totalAddonsCost: number;
  totalPrice: number;
  breakdown: string[];
}

export interface PlanValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestedPlan?: string;
}

/**
 * Pricing Service
 * Handles all subscription pricing logic and calculations
 */
export class PricingService {
  // Standard plan configurations (Reference only - prices are manually set by superadmin)
  private static readonly PLANS: Record<string, PlanConfig> = {
    free: {
      id: 'free',
      name: 'Free Trial',
      price: 0,
      maxTables: 5,
      maxWaiters: 1,
      features: [
        'Up to 5 tables',
        '1 waiter user',
        'Basic features',
        '30-day trial',
        'Community support',
      ],
      isCustom: false,
    },
    basic: {
      id: 'basic',
      name: 'Basic',
      price: 49, // $49/month (reference only)
      maxTables: 10,
      maxWaiters: 1,
      features: [
        'Up to 10 tables',
        '1 waiter user',
        'QR code generation',
        'Real-time notifications',
        'Basic analytics',
        'Email support',
      ],
      isCustom: false,
    },
    standard: {
      id: 'standard',
      name: 'Standard',
      price: 79, // $79/month (reference only)
      maxTables: 20,
      maxWaiters: 2,
      features: [
        'Up to 20 tables',
        '2 waiter users',
        'All Basic features',
        'Advanced analytics',
        'Custom branding',
        'Priority support',
      ],
      isCustom: false,
    },
    premium: {
      id: 'premium',
      name: 'Premium',
      price: 99, // $99/month (reference only)
      maxTables: 30,
      maxWaiters: 3,
      features: [
        'Up to 30 tables',
        '3 waiter users',
        'All Standard features',
        'Unlimited service requests',
        'API access',
        'Dedicated support',
        '1 printer included',
      ],
      isCustom: false,
    },
    custom: {
      id: 'custom',
      name: 'Custom',
      price: 0, // Manually set by superadmin
      maxTables: 999,
      maxWaiters: 999,
      features: [
        'Custom table limits',
        'Custom waiter limits',
        'Multiple printers support',
        'All Premium features',
        'Dedicated account manager',
        'Custom integrations',
      ],
      isCustom: true,
    },
  };

  // Add-on pricing (Reference only - for invoice calculation purposes)
  private static readonly ADDONS: PricingAddons = {
    extraTablePrice: 3, // $3 per table above plan limit (reference)
    extraWaiterPrice: 3, // $3 per waiter above plan limit (reference)
    additionalPrinterPrice: 20, // $20 per additional printer (reference)
  };

  /**
   * Get all available plans
   */
  static getAllPlans(): PlanConfig[] {
    return Object.values(this.PLANS);
  }

  /**
   * Get a specific plan by ID
   */
  static getPlan(planId: string): PlanConfig | null {
    return this.PLANS[planId] || null;
  }

  /**
   * Get add-on pricing
   */
  static getAddonPricing(): PricingAddons {
    return { ...this.ADDONS };
  }

  /**
   * Calculate custom plan pricing
   */
  static calculateCustomPlan(
    tables: number,
    waiters: number,
    printers: number = 0
  ): CustomPlanCalculation {
    // Determine base plan based on requirements
    let basePlan = 'premium';
    let basePrice = this.PLANS.premium.price;
    let baseMaxTables = this.PLANS.premium.maxTables;
    let baseMaxWaiters = this.PLANS.premium.maxWaiters;

    // Check if requirements fit within premium plan
    if (tables <= this.PLANS.premium.maxTables && waiters <= this.PLANS.premium.maxWaiters) {
      basePlan = 'premium';
      basePrice = this.PLANS.premium.price;
      baseMaxTables = this.PLANS.premium.maxTables;
      baseMaxWaiters = this.PLANS.premium.maxWaiters;
    }

    // Calculate extra resources
    const extraTables = Math.max(0, tables - baseMaxTables);
    const extraWaiters = Math.max(0, waiters - baseMaxWaiters);

    // Calculate costs
    const extraTablesCost = extraTables * this.ADDONS.extraTablePrice;
    const extraWaitersCost = extraWaiters * this.ADDONS.extraWaiterPrice;
    const printersCost = printers * this.ADDONS.additionalPrinterPrice;

    const totalAddonsCost = extraTablesCost + extraWaitersCost + printersCost;
    const totalPrice = basePrice + totalAddonsCost;

    // Build breakdown (for invoice calculation reference only)
    const breakdown: string[] = [
      `Base ${basePlan} plan: $${basePrice}`,
    ];

    if (extraTables > 0) {
      breakdown.push(`${extraTables} extra tables × $${this.ADDONS.extraTablePrice} = $${extraTablesCost}`);
    }

    if (extraWaiters > 0) {
      breakdown.push(`${extraWaiters} extra waiters × $${this.ADDONS.extraWaiterPrice} = $${extraWaitersCost}`);
    }

    if (printers > 0) {
      breakdown.push(`${printers} additional printers × $${this.ADDONS.additionalPrinterPrice} = $${printersCost}`);
    }

    breakdown.push(`Total: $${totalPrice}/month (Reference - manually set by admin)`);

    return {
      plan: 'custom',
      basePlan,
      basePrice,
      tables,
      waiters,
      printers,
      extraTables,
      extraWaiters,
      extraTablesCost,
      extraWaitersCost,
      printersCost,
      totalAddonsCost,
      totalPrice,
      breakdown,
    };
  }

  /**
   * Validate if tenant's usage fits within their plan
   */
  static validatePlanUsage(
    planId: string,
    currentTables: number,
    currentWaiters: number,
    customTableLimit?: number,
    customWaiterLimit?: number
  ): PlanValidation {
    const plan = this.getPlan(planId);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!plan) {
      return {
        isValid: false,
        errors: ['Invalid plan'],
        warnings: [],
      };
    }

    // For custom plans, use custom limits
    const maxTables = planId === 'custom' && customTableLimit ? customTableLimit : plan.maxTables;
    const maxWaiters = planId === 'custom' && customWaiterLimit ? customWaiterLimit : plan.maxWaiters;

    // Check table limit
    if (currentTables > maxTables) {
      errors.push(`Table limit exceeded: ${currentTables}/${maxTables}`);
    } else if (currentTables >= maxTables * 0.9) {
      warnings.push(`Approaching table limit: ${currentTables}/${maxTables}`);
    }

    // Check waiter limit
    if (currentWaiters > maxWaiters) {
      errors.push(`Waiter limit exceeded: ${currentWaiters}/${maxWaiters}`);
    } else if (currentWaiters >= maxWaiters) {
      warnings.push(`At waiter limit: ${currentWaiters}/${maxWaiters}`);
    }

    // Suggest upgrade if limits exceeded
    let suggestedPlan: string | undefined;
    if (errors.length > 0) {
      if (planId === 'basic' && currentTables <= 20 && currentWaiters <= 2) {
        suggestedPlan = 'standard';
      } else if ((planId === 'basic' || planId === 'standard') && currentTables <= 30 && currentWaiters <= 3) {
        suggestedPlan = 'premium';
      } else {
        suggestedPlan = 'custom';
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestedPlan,
    };
  }

  /**
   * Suggest best plan based on requirements
   */
  static suggestPlan(tables: number, waiters: number): PlanConfig {
    // Check each plan from lowest to highest
    if (tables <= this.PLANS.basic.maxTables && waiters <= this.PLANS.basic.maxWaiters) {
      return this.PLANS.basic;
    }

    if (tables <= this.PLANS.standard.maxTables && waiters <= this.PLANS.standard.maxWaiters) {
      return this.PLANS.standard;
    }

    if (tables <= this.PLANS.premium.maxTables && waiters <= this.PLANS.premium.maxWaiters) {
      return this.PLANS.premium;
    }

    // Requires custom plan
    return this.PLANS.custom;
  }

  /**
   * Convert USD to cents (for database storage)
   * 1 USD = 100 cents
   */
  static usdToCents(usd: number): number {
    return Math.round(usd * 100);
  }

  /**
   * Convert cents to USD (for display)
   */
  static centsToUsd(cents: number): number {
    return cents / 100;
  }

  /**
   * Format price for display
   */
  static formatPrice(usd: number, currency: string = 'USD'): string {
    return `$${usd.toFixed(2)}`;
  }

  /**
   * Calculate prorated amount for plan change
   * Returns amount in cents
   */
  static calculateProration(
    oldPlanPrice: number, // in USD
    newPlanPrice: number, // in USD
    daysRemaining: number,
    daysInMonth: number = 30
  ): number {
    const dailyOldRate = oldPlanPrice / daysInMonth;
    const dailyNewRate = newPlanPrice / daysInMonth;
    const unusedCredit = dailyOldRate * daysRemaining;
    const newCharge = dailyNewRate * daysRemaining;
    const proratedAmount = newCharge - unusedCredit;

    return this.usdToCents(Math.max(0, proratedAmount));
  }

  /**
   * Log pricing calculation for audit
   */
  static logPricingCalculation(
    tenantId: string,
    calculation: CustomPlanCalculation | any,
    action: string
  ): void {
    logger.info(`Pricing calculation for tenant ${tenantId}`, {
      tenantId,
      action,
      calculation,
      timestamp: new Date().toISOString(),
    });
  }
}

