export const PRICING_CONFIG = {
  // Stripe Price IDs - Use environment variables or fallback to dynamic creation
  prices: {
    freeTrial: process.env.STRIPE_PRICE_FREE_TRIAL || 'FREE_TRIAL',
    monthly: process.env.STRIPE_PRICE_MONTHLY || 'MONTHLY_PLAN',
    yearly: process.env.STRIPE_PRICE_YEARLY || 'YEARLY_PLAN',
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

export type PricingPlan = keyof typeof PRICING_CONFIG.pricing;
export type PricingDetails = typeof PRICING_CONFIG.pricing[PricingPlan];
