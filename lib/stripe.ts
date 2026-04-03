import Stripe from "stripe";

// NOTE: rotate the old test key (pk_test_51SK3Z3BY5KE…) in the Stripe dashboard
// — it was previously hardcoded here and is now in git history.
export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY ?? "";

// Lazy singleton — avoids throwing at module evaluation time during `next build`.
// The error is deferred to the first actual Stripe API call (request time), which
// means routes that import this file but don't exercise Stripe won't break the build.
let _instance: Stripe | null = null;

function getInstance(): Stripe {
  if (_instance) return _instance;
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  _instance = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-10-29.clover",
    typescript: true,
  });
  return _instance;
}

// Transparent proxy — all existing `stripe.xxx` call-sites continue to work
// without modification. Accessing any property triggers lazy initialisation.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return getInstance()[prop as keyof Stripe];
  },
  apply(_target, _thisArg, args) {
    return (getInstance() as unknown as (...a: unknown[]) => unknown)(...args);
  },
});
