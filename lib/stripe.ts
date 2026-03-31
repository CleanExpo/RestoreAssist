import Stripe from 'stripe';

let _instance: Stripe | null = null;

function getInstance(): Stripe {
  if (_instance) return _instance;
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
  _instance = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-10-29.clover',
    typescript: true,
  });
  return _instance;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return getInstance()[prop as keyof Stripe];
  },
});

export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY ?? '';
