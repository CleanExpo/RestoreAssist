import { loadStripe } from '@stripe/stripe-js';

// Get Stripe publishable key from environment variables
const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY;

// Validate that Stripe key is configured
if (!STRIPE_PUBLISHABLE_KEY) {
  console.error('STRIPE_PUBLISHABLE_KEY is not configured in environment variables');
  throw new Error('Stripe publishable key is required');
}

// Validate that it's a valid Stripe key format
if (!STRIPE_PUBLISHABLE_KEY.startsWith('pk_')) {
  console.error('Invalid Stripe publishable key format');
  throw new Error('Invalid Stripe publishable key format');
}

export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
