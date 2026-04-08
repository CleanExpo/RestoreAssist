import Stripe from 'stripe';

// Use empty-string fallback so this module doesn't throw at import time during
// Next.js build (SSG "Collecting page data" phase). All callers are server-side
// API routes — at runtime STRIPE_SECRET_KEY is always present via env vars.
// Stripe's constructor accepts an empty string; auth errors only surface on
// actual API calls, which are caught in each route's try/catch.
const key = process.env.STRIPE_SECRET_KEY ?? '';

export const stripe = new Stripe(key, {
  apiVersion: '2025-09-30.clover' as const,
  typescript: true,
});

export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_51SK3Z3BY5KEPMwxd73NBxV7AFPamtEy8dbfwPs3ziBMmM4bfP0pQr3IDkaqbhIm5DJ66chBIVLWkwD6SiEAwt5lr007K6qZY7z';
