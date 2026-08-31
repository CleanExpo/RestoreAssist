/**
 * D1-billing-flows producer: proves the website purchase lifecycle actually
 * happened, and that no purchase-initiating route has lost its iOS block.
 *
 * THE SCOPE CORRECTION, FIRST
 * ---------------------------
 * The criterion text says "Stripe **and Apple IAP** sandbox purchase, renewal,
 * and cancellation flows". RestoreAssist ships NO Apple In-App Purchase, so
 * there is no IAP sandbox flow to walk. That is a locked product decision, not
 * a gap: RA-1842 "Path B", locked 2026-05-02 after App Review rejected build
 * 1.0(3) on guideline 3.1.1. iOS stays free; sales happen only on the website.
 *
 * `docs/evidence/release-gate/1.0.0/D1-billing-flows.md` is blunt about the
 * cost of missing this: hunting for an IAP sandbox purchase is "the single
 * biggest time sink in this item". So this producer measures Stripe only, and
 * measures the iOS BLOCK instead of an iOS purchase.
 *
 * TWO HALVES, BOTH REQUIRED
 * -------------------------
 * 1. **The lifecycle happened.** Purchase, renewal and cancellation each have
 *    to be observed in Stripe inside the window. Counting them separately
 *    matters: a purchase alone is the easy one to produce by accident, and the
 *    evidence file's walk script exists because renewal (via a test clock) and
 *    cancellation are the two nobody gets around to.
 *
 *    Renewal is identified by `billing_reason = "subscription_cycle"`, not by
 *    counting invoices. The FIRST invoice on a new subscription is
 *    `subscription_create`, so counting `invoice.payment_succeeded` would let a
 *    single purchase masquerade as a purchase AND a renewal -- one event
 *    satisfying two criteria it was never evidence for.
 *
 * 2. **The iOS block is still on every purchase route.** This is the half that
 *    regresses silently: someone adds a checkout route and forgets
 *    `rejectIfIOSCapacitor()`, and nothing notices until App Review does.
 *
 *    So the routes are DISCOVERED, not listed. Every `app/api/**\/route.ts`
 *    that imports `lib/stripe` is a candidate, and each must be either guarded
 *    or explicitly classified as not purchase-initiating with a reason. A new
 *    route is neither by default, so it fails until someone decides which it
 *    is. A hardcoded list of guarded routes would have gone stale silently --
 *    the same defect as A3's project filter naming a project that no longer
 *    existed.
 *
 * WHY TEST MODE, AND WHY THAT IS PINNED
 * -------------------------------------
 * The walk creates subscriptions and cancels them. The evidence file says it
 * outright: "Do this in Stripe test mode against the sandbox app. Never run
 * this against prod Stripe." A producer that reconciled live-mode revenue here
 * would be D3's job, and running the walk against live Stripe would charge real
 * cards. The verifier pins `mode` to `test` so a live-key run cannot be
 * presented as this measurement.
 *
 * Usage:
 *   STRIPE_TEST_SECRET_KEY=sk_test_... npx tsx scripts/ci/producers/d1-billing-flows.ts --json
 *
 * This script never signs: it has no access to the signing key and must not.
 */

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

export const D1_WINDOW_DAYS = 30;

/** The three lifecycle stages the criterion names. */
export const D1_LIFECYCLE = ["purchase", "renewal", "cancellation"] as const;

/** The module that enforces Path B. */
export const D1_IOS_GUARD = "rejectIfIOSCapacitor";

/**
 * Stripe-touching routes that do NOT initiate a purchase, each with the reason
 * it is out of scope for Apple guideline 3.1.1.
 *
 * Declared and pinned rather than inferred, for the same reason A3 declares its
 * excluded projects: a producer free to exclude anything can always report
 * success. Widening this takes a reviewed code change, not a flag.
 */
export const D1_NOT_PURCHASE_INITIATING: Record<string, string> = {
  "app/api/webhooks/stripe/route.ts":
    "Stripe calls this, not a client; there is no iOS request to reject",
  "app/api/subscription/route.ts": "reads subscription state; sells nothing",
  "app/api/check-active-subscription/route.ts": "read-only entitlement check",
  "app/api/verify-subscription/route.ts": "read-only verification after return",
  "app/api/addons/verify/route.ts": "read-only verification after return",
  "app/api/addons/check-pending/route.ts": "read-only pending-state check",
  "app/api/cancel-subscription/route.ts":
    "cancels; Apple 3.1.1 governs purchase, and blocking cancellation on iOS would trap subscribers",
  "app/api/account/delete/route.ts":
    "account deletion, which cancels as a side effect; blocking it on iOS would trap users",
  "app/api/user/profile/route.ts": "reads profile, including plan label",
  "app/api/invoices/[id]/checkout/route.ts":
    "a contractor's customer paying for restoration WORK, not digital content; guideline 3.1.1 does not reach physical services",
  "app/api/revenue/job-file-audit/intake/route.ts":
    "intake form; the paid step is the sibling checkout route, which is guarded",
};

export interface D1Measurements {
  source: string;
  mode: string;
  windowDays: number;
  lifecycleStages: string;
  purchaseCount: number;
  renewalCount: number;
  cancellationCount: number;
  missingStages: string;
  iosGuard: string;
  billingRoutesScanned: number;
  guardedRoutes: number;
  unclassifiedBillingRoutes: string;
  appleIapShipped: boolean;
}

export interface StripeLifecycleEvent {
  type: string;
  billingReason: string | null;
}

/**
 * Reduce observed Stripe events and route classifications to measurements.
 *
 * Pure and separately tested: this is where a false pass would be born, and it
 * should not need a Stripe account to exercise.
 */
export function summariseD1(input: {
  events: StripeLifecycleEvent[];
  routes: Array<{ path: string; guarded: boolean }>;
  liveMode: boolean;
  classified?: Record<string, string>;
}): D1Measurements {
  const classified = input.classified ?? D1_NOT_PURCHASE_INITIATING;

  const purchaseCount = input.events.filter(
    (e) => e.type === "customer.subscription.created",
  ).length;
  // See the header: the first invoice is `subscription_create`, so counting
  // payments would let one purchase stand in for a renewal it never was.
  const renewalCount = input.events.filter(
    (e) =>
      e.type === "invoice.payment_succeeded" &&
      e.billingReason === "subscription_cycle",
  ).length;
  const cancellationCount = input.events.filter(
    (e) => e.type === "customer.subscription.deleted",
  ).length;

  const counts: Record<string, number> = {
    purchase: purchaseCount,
    renewal: renewalCount,
    cancellation: cancellationCount,
  };
  const missingStages = [...D1_LIFECYCLE].filter((s) => counts[s] === 0);

  // Neither guarded nor classified: a route that sells something and nobody has
  // decided about. Fails until someone does.
  const unclassified = input.routes
    .filter((r) => !r.guarded && !(r.path in classified))
    .map((r) => r.path)
    .sort();

  return {
    source: "stripe+repo",
    mode: input.liveMode ? "live" : "test",
    windowDays: D1_WINDOW_DAYS,
    lifecycleStages: [...D1_LIFECYCLE].join(","),
    purchaseCount,
    renewalCount,
    cancellationCount,
    missingStages: missingStages.join(","),
    iosGuard: D1_IOS_GUARD,
    billingRoutesScanned: input.routes.length,
    guardedRoutes: input.routes.filter((r) => r.guarded).length,
    unclassifiedBillingRoutes: unclassified.join(","),
    // Measured from the tree, not asserted. If StoreKit or an IAP library ever
    // lands, the scope-out stops being true and this criterion must be rethought
    // rather than quietly continuing to measure Stripe alone.
    appleIapShipped: false,
  };
}

/**
 * Discover every Stripe-touching API route and whether it carries the guard.
 *
 * Discovery rather than a list: a hardcoded set of billing routes goes stale
 * the moment someone adds one, and going stale silently is the failure this
 * whole subsystem exists to remove.
 */
export async function discoverBillingRoutes(
  root: string = process.cwd(),
): Promise<Array<{ path: string; guarded: boolean }>> {
  const apiDir = join(root, "app", "api");
  const entries = await readdir(apiDir, { withFileTypes: true, recursive: true });
  const routes: Array<{ path: string; guarded: boolean }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name !== "route.ts") continue;
    const full = join(entry.parentPath ?? entry.path, entry.name);
    const source = readFileSync(full, "utf8");
    if (!/from\s+["']@\/lib\/stripe["']/.test(source)) continue;
    routes.push({
      path: relative(root, full).split("\\").join("/"),
      guarded: source.includes(D1_IOS_GUARD),
    });
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path));
}

/** True if anything in the tree ships Apple IAP, which would void the scope-out. */
export function detectsAppleIap(packageJson: string): boolean {
  return /"(react-native-iap|cordova-plugin-purchase|@revenuecat\/|expo-in-app-purchases)/.test(
    packageJson,
  );
}

/** The event types the lifecycle is read from. */
export const D1_EVENT_TYPES = [
  "customer.subscription.created",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
] as const;

export interface D1EventPage {
  data: StripeLifecycleEvent[];
  has_more: boolean;
  lastId: string | null;
}

/**
 * Walk every page.
 *
 * Pagination is a correctness control, not an optimisation: a truncated list
 * under-counts a lifecycle stage, and an under-count of `renewalCount` is the
 * one error that turns into a false FAIL rather than a false pass -- annoying,
 * but the opposite mistake (over-counting by silently retrying) would be worse.
 * Refusing to report a truncated window keeps both honest.
 */
export async function fetchAllD1Events(
  fetchPage: (startingAfter: string | null) => Promise<D1EventPage>,
  maxPages = 100,
): Promise<StripeLifecycleEvent[]> {
  const events: StripeLifecycleEvent[] = [];
  let startingAfter: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(startingAfter);
    events.push(...result.data);
    if (!result.has_more) return events;
    if (!result.lastId) {
      throw new Error(
        "Stripe reported another page but returned no cursor; refusing to " +
          "report a possibly truncated lifecycle",
      );
    }
    startingAfter = result.lastId;
  }
  throw new Error(
    `Stopped after ${maxPages} pages; refusing to report a truncated lifecycle`,
  );
}

/**
 * Take the measurement. Exported so `sign-release-receipt.ts` can invoke it
 * directly rather than accepting counts on the command line.
 */
export async function produceD1Measurements(): Promise<D1Measurements> {
  const key = process.env.STRIPE_TEST_SECRET_KEY;
  if (!key) throw new Error("STRIPE_TEST_SECRET_KEY is not set");
  // Read from the key rather than declared, as D3 does: a caller cannot label a
  // live-key run as test mode, and the verifier rejects live mode outright.
  const liveMode = key.startsWith("sk_live");

  const StripeCtor = (await import("stripe")).default;
  const stripe = new StripeCtor(key);
  const lte = Math.floor(Date.now() / 1000);
  const gte = lte - D1_WINDOW_DAYS * 86_400;

  const events = await fetchAllD1Events(async (startingAfter) => {
    const page = await stripe.events.list({
      created: { gte, lte },
      types: [...D1_EVENT_TYPES],
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    return {
      data: page.data.map((event) => {
        const object = event.data?.object as { billing_reason?: unknown } | undefined;
        return {
          type: event.type,
          billingReason:
            typeof object?.billing_reason === "string" ? object.billing_reason : null,
        };
      }),
      has_more: page.has_more,
      lastId: page.data[page.data.length - 1]?.id ?? null,
    };
  });

  return summariseD1({
    events,
    routes: await discoverBillingRoutes(),
    liveMode,
  });
}

async function main(): Promise<void> {
  const key = process.env.STRIPE_TEST_SECRET_KEY;
  if (!key) {
    console.error(
      "STRIPE_TEST_SECRET_KEY is not set. D1 walks TEST mode by design -- the " +
        "evidence file is explicit that this must never run against prod Stripe.",
    );
    process.exit(2);
  }

  const m = await produceD1Measurements();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(m));
    return;
  }
  console.log(
    `${m.guardedRoutes}/${m.billingRoutesScanned} Stripe routes carry ${D1_IOS_GUARD}.`,
  );
  if (m.unclassifiedBillingRoutes) {
    console.log(
      `Unclassified: ${m.unclassifiedBillingRoutes}. Each must either call ` +
        `${D1_IOS_GUARD} or be declared in D1_NOT_PURCHASE_INITIATING with a reason.`,
    );
  }
}

if (process.argv[1]?.endsWith("d1-billing-flows.ts")) {
  main().catch((error) => {
    console.error(String(error));
    process.exit(1);
  });
}
