import Stripe from "stripe";

// Lazy singleton — the Stripe constructor throws on falsy keys, so we defer
// instantiation until the first actual call. This prevents Next.js build from
// failing during "Collecting page data" when STRIPE_SECRET_KEY is absent
// (env vars scoped RUN_TIME only on DO App Platform, not available at build).
// All 14 callers are server-side API routes, so the key is always present
// at runtime. Any missing-key errors surface as Stripe 401s, caught in
// each route's try/catch.
let _stripe: Stripe | null = null;

function getInstance(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, {
      apiVersion: "2025-10-29.clover" as const,
      typescript: true,
    });
  }
  return _stripe;
}

// Proxy preserves the `stripe.foo.bar(...)` call surface used by all callers
// without requiring any changes to the 14 importing files.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop: string | symbol) {
    return (getInstance() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const STRIPE_PUBLISHABLE_KEY =
  process.env.STRIPE_PUBLISHABLE_KEY ||
  "pk_test_51SK3Z3BY5KEPMwxd73NBxV7AFPamtEy8dbfwPs3ziBMmM4bfP0pQr3IDkaqbhIm5DJ66chBIVLWkwD6SiEAwt5lr007K6qZY7z";
