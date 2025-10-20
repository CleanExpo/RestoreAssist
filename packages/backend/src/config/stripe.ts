/**
 * Stripe Configuration
 *
 * Centralized Stripe product and pricing configuration for RestoreAssist
 */

export const STRIPE_CONFIG = {
  // API Keys
  secretKey: process.env.STRIPE_SECRET_KEY || '',
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',

  // Product IDs
  products: {
    freeTrial: process.env.STRIPE_PRODUCT_FREE_TRIAL || 'prod_TGdTtgqCXY34na',
    monthly: process.env.STRIPE_PRODUCT_MONTHLY || 'prod_TGdXM0eZiBxmfW',
    yearly: process.env.STRIPE_PRODUCT_YEARLY || 'prod_TGdZP6UNZ8ONMh',
  },

  // Price IDs
  prices: {
    freeTrial: process.env.STRIPE_PRICE_FREE_TRIAL || 'price_1SK6CHBY5KEPMwxdjZxT8CKH',
    monthly: process.env.STRIPE_PRICE_MONTHLY || 'price_1SK6GPBY5KEPMwxd43EBhwXx',
    yearly: process.env.STRIPE_PRICE_YEARLY || 'price_1SK6I7BY5KEPMwxdC451vfBk',
  },

  // Pricing Details (for reference and display)
  pricing: {
    freeTrial: {
      name: 'Free Trial',
      amount: 0,
      currency: 'AUD',
      reportLimit: 3,
      features: [
        '3 free reports',
        'PDF export',
        'Basic support',
      ],
    },
    monthly: {
      name: 'Monthly Plan',
      amount: 49.50,
      currency: 'AUD',
      interval: 'month',
      reportLimit: 'unlimited',
      features: [
        'Unlimited reports',
        'PDF & Excel export',
        'Email support',
        'All integrations',
      ],
    },
    yearly: {
      name: 'Yearly Plan',
      amount: 528,
      currency: 'AUD',
      interval: 'year',
      reportLimit: 'unlimited',
      discount: '10%',
      monthlyEquivalent: 44,
      features: [
        'Unlimited reports',
        'PDF & Excel export',
        'Priority support',
        'All integrations',
        '10% discount (save $66/year)',
      ],
    },
  },
} as const;

// Type exports
export type StripePlan = 'freeTrial' | 'monthly' | 'yearly';

export interface StripePlanDetails {
  name: string;
  amount: number;
  currency: string;
  interval?: string;
  reportLimit: number | 'unlimited';
  features: string[];
  discount?: string;
  monthlyEquivalent?: number;
}

/**
 * Get plan details by plan type
 */
export function getPlanDetails(plan: StripePlan): StripePlanDetails {
  return STRIPE_CONFIG.pricing[plan];
}

/**
 * Get price ID by plan type
 */
export function getPriceId(plan: StripePlan): string {
  return STRIPE_CONFIG.prices[plan];
}

/**
 * Get product ID by plan type
 */
export function getProductId(plan: StripePlan): string {
  return STRIPE_CONFIG.products[plan];
}

/**
 * Validate Stripe configuration
 */
export function validateStripeConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!STRIPE_CONFIG.secretKey) {
    errors.push('STRIPE_SECRET_KEY is not configured');
  }

  if (!STRIPE_CONFIG.products.freeTrial) {
    errors.push('STRIPE_PRODUCT_FREE_TRIAL is not configured');
  }

  if (!STRIPE_CONFIG.products.monthly) {
    errors.push('STRIPE_PRODUCT_MONTHLY is not configured');
  }

  if (!STRIPE_CONFIG.products.yearly) {
    errors.push('STRIPE_PRODUCT_YEARLY is not configured');
  }

  if (!STRIPE_CONFIG.prices.freeTrial) {
    errors.push('STRIPE_PRICE_FREE_TRIAL is not configured');
  }

  if (!STRIPE_CONFIG.prices.monthly) {
    errors.push('STRIPE_PRICE_MONTHLY is not configured');
  }

  if (!STRIPE_CONFIG.prices.yearly) {
    errors.push('STRIPE_PRICE_YEARLY is not configured');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
