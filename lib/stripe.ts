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

    // RA Shipit guard: in production the secret MUST be a live key, and a live
    // key MUST NOT be used outside production. "production" = Vercel prod env,
    // or (no Vercel) NODE_ENV=production. Vercel *preview* runs with
    // NODE_ENV=production but VERCEL_ENV=preview, so we key off VERCEL_ENV first
    // to avoid forcing sk_live on preview branches. Runs lazily at first call,
    // never at build time (see file header).
    const isProd =
      process.env.VERCEL_ENV === "production" ||
      (process.env.VERCEL_ENV === undefined &&
        process.env.NODE_ENV === "production");
    if (isProd && !key.startsWith("sk_live")) {
      throw new Error(
        "STRIPE_SECRET_KEY must be a live key (sk_live_…) in production",
      );
    }
    if (!isProd && key.startsWith("sk_live")) {
      console.warn(
        "[stripe] live secret key (sk_live_…) detected outside production — refusing to charge real cards is your responsibility",
      );
    }
    const pk =
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
      process.env.STRIPE_PUBLISHABLE_KEY;
    if (isProd && pk && !pk.startsWith("pk_live")) {
      throw new Error(
        "Stripe publishable key must be a live key (pk_live_…) in production",
      );
    }

    _stripe = new Stripe(key, {
      apiVersion: "2026-05-27.dahlia",
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
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  process.env.STRIPE_PUBLISHABLE_KEY;
