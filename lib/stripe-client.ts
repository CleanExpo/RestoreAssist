import { loadStripe } from '@stripe/stripe-js';

const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_51SK3Z3BY5KEPMwxd73NBxV7AFPamtEy8dbfwPs3ziBMmM4bfP0pQr3IDkaqbhIm5DJ66chBIVLWkwD6SiEAwt5lr007K6qZY7z';

console.log('Stripe publishable key:', STRIPE_PUBLISHABLE_KEY ? 'Found' : 'Not found');

export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
