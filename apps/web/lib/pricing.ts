export const PRICING_CONFIG = {
  // Stripe Price IDs - Use environment variables or fallback to dynamic creation
  prices: {
    monthly: process.env.STRIPE_PRICE_MONTHLY || 'MONTHLY_PLAN',
    yearly: process.env.STRIPE_PRICE_YEARLY || 'YEARLY_PLAN',
  },

  // Pricing Details (for display)
  pricing: {
    monthly: {
      name: 'Monthly Plan',
      displayName: 'Monthly',
      amount: 99.00,
      currency: 'AUD',
      interval: 'month',
      reportLimit: 50,
      popular: true,
      signupBonus: 10, // Additional 10 reports on first month signup
      features: [
        '50 inspection reports per month',
        'First month signup bonus: +10 reports',
        'PDF & Excel export',
        'Email support',
        'All integrations',
        'IICRC S500 compliant',
        'Priority processing',
      ],
    },
    yearly: {
      name: 'Yearly Plan',
      displayName: 'Yearly',
      amount: 1188.00,
      currency: 'AUD',
      interval: 'year',
      reportLimit: 70, // Reports per month
      monthlyEquivalent: 99,
      popular: false,
      badge: 'Best Value',
      signupBonus: 10, // Additional 10 reports on first month signup
      features: [
        '70 inspection reports per month',
        'First month signup bonus: +10 reports',
        'PDF & Excel export',
        'Priority support',
        'All integrations',
        'IICRC S500 compliant',
        'Priority processing',
        'Best value - More reports per month',
      ],
    },
  },

  // Add-ons for additional reports
  addons: {
    pack8: {
      name: '8 Additional Reports',
      displayName: '8 Reports Pack',
      amount: 20.00,
      currency: 'AUD',
      reportLimit: 8,
      description: 'Add 8 additional reports to your monthly limit',
    },
    pack25: {
      name: '25 Additional Reports',
      displayName: '25 Reports Pack',
      amount: 50.00,
      currency: 'AUD',
      reportLimit: 25,
      description: 'Add 25 additional reports to your monthly limit',
      popular: true,
    },
    pack60: {
      name: '60 Additional Reports',
      displayName: '60 Reports Pack',
      amount: 100.00,
      currency: 'AUD',
      reportLimit: 60,
      description: 'Add 60 additional reports to your monthly limit',
      badge: 'Best Value',
    },
  },
} as const;

export type PricingPlan = keyof typeof PRICING_CONFIG.pricing;
export type PricingDetails = typeof PRICING_CONFIG.pricing[PricingPlan];
export type AddonPack = keyof typeof PRICING_CONFIG.addons;
export type AddonDetails = typeof PRICING_CONFIG.addons[AddonPack];
