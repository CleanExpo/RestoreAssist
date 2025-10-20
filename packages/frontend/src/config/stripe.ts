/**
 * Stripe Configuration - Frontend
 *
 * Centralized Stripe product and pricing configuration for RestoreAssist
 * Only includes public/safe configuration values
 */

export const STRIPE_CONFIG = {
  // Public Key (safe to expose)
  publishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '',

  // Product IDs (public)
  products: {
    freeTrial: import.meta.env.VITE_STRIPE_PRODUCT_FREE_TRIAL || 'prod_TGdTtgqCXY34na',
    monthly: import.meta.env.VITE_STRIPE_PRODUCT_MONTHLY || 'prod_TGdXM0eZiBxmfW',
    yearly: import.meta.env.VITE_STRIPE_PRODUCT_YEARLY || 'prod_TGdZP6UNZ8ONMh',
  },

  // Price IDs (public)
  prices: {
    freeTrial: import.meta.env.VITE_STRIPE_PRICE_FREE_TRIAL || 'price_1SK6CHBY5KEPMwxdjZxT8CKH',
    monthly: import.meta.env.VITE_STRIPE_PRICE_MONTHLY || 'price_1SK6GPBY5KEPMwxd43EBhwXx',
    yearly: import.meta.env.VITE_STRIPE_PRICE_YEARLY || 'price_1SK6I7BY5KEPMwxdC451vfBk',
  },

  // Pricing Details (for display)
  pricing: {
    freeTrial: {
      name: 'Free Trial',
      displayName: 'Free Trial',
      amount: 0,
      currency: 'AUD',
      reportLimit: 3,
      popular: false,
      features: [
        '3 free reports',
        'PDF export',
        'Basic support',
        'NCC 2022 compliant',
      ],
    },
    monthly: {
      name: 'Monthly Plan',
      displayName: 'Monthly',
      amount: 49.50,
      currency: 'AUD',
      interval: 'month',
      reportLimit: 'unlimited',
      popular: true,
      features: [
        'Unlimited reports',
        'PDF & Excel export',
        'Email support',
        'All integrations',
        'NCC 2022 compliant',
        'Priority processing',
      ],
    },
    yearly: {
      name: 'Yearly Plan',
      displayName: 'Yearly',
      amount: 528,
      currency: 'AUD',
      interval: 'year',
      reportLimit: 'unlimited',
      discount: '10%',
      monthlyEquivalent: 44,
      savings: 66,
      popular: false,
      badge: 'Best Value',
      features: [
        'Unlimited reports',
        'PDF & Excel export',
        'Priority support',
        'All integrations',
        'NCC 2022 compliant',
        'Priority processing',
        '10% discount - Save $66/year',
      ],
    },
  },
} as const;

// Type exports
export type StripePlan = 'freeTrial' | 'monthly' | 'yearly';

export interface StripePlanDetails {
  name: string;
  displayName: string;
  amount: number;
  currency: string;
  interval?: string;
  reportLimit: number | 'unlimited';
  popular: boolean;
  features: string[];
  discount?: string;
  monthlyEquivalent?: number;
  savings?: number;
  badge?: string;
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
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/**
 * Get all plans for pricing page
 */
export function getAllPlans(): StripePlanDetails[] {
  return [
    STRIPE_CONFIG.pricing.freeTrial,
    STRIPE_CONFIG.pricing.monthly,
    STRIPE_CONFIG.pricing.yearly,
  ];
}

/**
 * Validate Stripe configuration
 */
export function validateStripeConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!STRIPE_CONFIG.publishableKey) {
    errors.push('VITE_STRIPE_PUBLISHABLE_KEY is not configured');
  }

  if (!STRIPE_CONFIG.products.freeTrial) {
    errors.push('VITE_STRIPE_PRODUCT_FREE_TRIAL is not configured');
  }

  if (!STRIPE_CONFIG.products.monthly) {
    errors.push('VITE_STRIPE_PRODUCT_MONTHLY is not configured');
  }

  if (!STRIPE_CONFIG.products.yearly) {
    errors.push('VITE_STRIPE_PRODUCT_YEARLY is not configured');
  }

  if (!STRIPE_CONFIG.prices.freeTrial) {
    errors.push('VITE_STRIPE_PRICE_FREE_TRIAL is not configured');
  }

  if (!STRIPE_CONFIG.prices.monthly) {
    errors.push('VITE_STRIPE_PRICE_MONTHLY is not configured');
  }

  if (!STRIPE_CONFIG.prices.yearly) {
    errors.push('VITE_STRIPE_PRICE_YEARLY is not configured');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
