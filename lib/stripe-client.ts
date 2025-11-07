import { loadStripe } from '@stripe/stripe-js';

const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

if (!STRIPE_PUBLISHABLE_KEY) {
  console.error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured');
  throw new Error('Stripe publishable key is required');
}

console.log('Stripe publishable key:', STRIPE_PUBLISHABLE_KEY ? 'Configured' : 'Not configured');

export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
