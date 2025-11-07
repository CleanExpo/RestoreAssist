import Stripe from 'stripe';

// Validate Stripe secret key
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
}

// Validate it's not a placeholder
if (process.env.STRIPE_SECRET_KEY.includes('your-stripe-secret-key')) {
  throw new Error('STRIPE_SECRET_KEY is set to placeholder value. Please set a real Stripe key.');
}

// Initialize Stripe with proper configuration
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
  typescript: true,
  appInfo: {
    name: 'RestoreAssist',
    version: '1.0.0',
    url: 'https://restoreassist.app',
  },
});

// Export Stripe configuration
export const STRIPE_CONFIG = {
  publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  priceIds: {
    freeTrial: process.env.STRIPE_PRICE_FREE_TRIAL || 'price_1SK6CHBY5KEPMwxdjZxT8CKH',
    monthly: process.env.STRIPE_PRICE_MONTHLY || 'price_1SK6GPBY5KEPMwxd43EBhwXx',
    yearly: process.env.STRIPE_PRICE_YEARLY || 'price_1SK6I7BY5KEPMwxdC451vfBk',
  },
} as const;

// Helper function to format Stripe amount (cents to dollars)
export function formatStripeAmount(amount: number, currency: string = 'aud'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

// Helper function to validate webhook signature
export function validateWebhookSignature(
  payload: string | Buffer,
  signature: string,
): Stripe.Event {
  if (!STRIPE_CONFIG.webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  return stripe.webhooks.constructEvent(
    payload,
    signature,
    STRIPE_CONFIG.webhookSecret
  );
}
