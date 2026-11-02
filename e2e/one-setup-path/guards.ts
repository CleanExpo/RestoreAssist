/**
 * This test buys things. These two checks are why it can only ever buy them on a
 * throwaway database with Stripe test mode: both run when the config loads, before a
 * server or a browser exists.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function assertDisposableDatabase(url: string | undefined): void {
  let parsed: URL;
  try {
    parsed = new URL(url ?? "");
  } catch {
    throw new Error("one-setup test refuses: DATABASE_URL is missing or unreadable");
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error("one-setup test refuses: DATABASE_URL is not a local database");
  }
  if (!parsed.pathname.includes("one_setup")) {
    throw new Error("one-setup test refuses: database name must contain one_setup");
  }
}

export function assertStripeTestKey(key: string | undefined): void {
  if (!key?.startsWith("sk_test_")) {
    throw new Error("one-setup test refuses: STRIPE_SECRET_KEY is not a Stripe test key");
  }
}
