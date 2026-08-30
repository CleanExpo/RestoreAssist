/**
 * D3-revenue-reconciliation producer: reconciles live Stripe subscription
 * events against the `SubscriptionEvent` rows the webhook wrote, over a
 * 7-day window.
 *
 * WHY IT IS SHAPED THIS WAY
 * -------------------------
 * `docs/evidence/release-gate/1.0.0/D3-revenue-reconciliation.md` already did
 * the hard thinking, including the trap that matters most:
 *
 *   "A legitimate outcome right now is 0 events on both sides. That
 *    reconciles, but it does NOT prove the pipeline works; it only proves
 *    nothing happened."
 *
 * Two empty queries agreeing is the same defect as A3's query that named a
 * project which did not exist: an absent measurement wearing the shape of a
 * passing one. So `stripeEventCount` is reported and the verifier requires it
 * to be positive. A quiet week cannot buy release points.
 *
 * MATCHING SETS, NOT COUNTS
 * -------------------------
 * The evidence file reconciles totals by hand -- "Stripe count" against "DB
 * count" per type. Equal totals are weak: five events on each side can be five
 * DIFFERENT events, which is precisely what a partially-failing webhook
 * produces. `SubscriptionEvent.stripeEventId` is `@unique`, so the id is
 * already stored and the stronger check is free. This compares the SETS and
 * reports how many Stripe events have no row.
 *
 * The window is defined once, on the Stripe side, and the database is then
 * queried by event id rather than by `createdAt`. That removes the boundary
 * skew a two-sided time window creates -- an event Stripe timestamps just
 * inside the window and the webhook writes just outside it would otherwise
 * look like a discrepancy, and tolerating those is where a real shortfall
 * would hide.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_... DATABASE_URL=... \
 *     npx tsx scripts/ci/producers/d3-revenue-reconciliation.ts --json
 *
 * The JSON it prints is the `--measurements` argument for
 * scripts/ci/sign-release-receipt.ts. This script never signs.
 */

/** The four Stripe types the criterion reconciles, per the evidence file. */
export const D3_EVENT_TYPES = [
  "customer.subscription.created",
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "invoice.payment_failed",
] as const;

export const D3_WINDOW_DAYS = 7;

export interface StripeEventRef {
  id: string;
  type: string;
}

export interface DbEventRef {
  stripeEventId: string | null;
}

export interface D3Inputs {
  /** Every Stripe event of the scanned types inside the window. */
  stripeEvents: StripeEventRef[];
  /** Rows whose stripeEventId is one of the above. */
  dbRows: DbEventRef[];
  /**
   * Rows in the window with NO stripeEventId. The evidence file: anything
   * Stripe-originated should carry one, so a non-zero count means something
   * other than the webhook is writing revenue events.
   */
  dbEventsWithoutStripeId: number;
  /**
   * Failed webhook deliveries in the window, from Stripe. The file calls this
   * "the most likely explanation for a shortfall on the DB side".
   */
  failedWebhookDeliveries: number;
  /** Whether the key in use is a live key. Read from the key, not declared. */
  liveMode: boolean;
  /** End of the window, ISO-8601. */
  windowEndsAt: string;
}

export interface D3Measurements {
  source: string;
  mode: string;
  windowDays: number;
  windowEndsAt: string;
  eventTypesScanned: string;
  stripeEventCount: number;
  matchedInDb: number;
  missingInDb: number;
  duplicateStripeIds: number;
  dbEventsWithoutStripeId: number;
  failedWebhookDeliveries: number;
  missingIds: string;
}

/**
 * Reconcile the two sides.
 *
 * Pure, because this is where a false pass would be born and it should not
 * need a Stripe account and a database to exercise.
 */
export function reconcileD3(inputs: D3Inputs): D3Measurements {
  const seen = new Map<string, number>();
  for (const row of inputs.dbRows) {
    if (row.stripeEventId === null) continue;
    seen.set(row.stripeEventId, (seen.get(row.stripeEventId) ?? 0) + 1);
  }
  // The @unique constraint should make this structurally impossible; counting
  // it anyway is the positive control that the constraint is doing its job,
  // exactly as the evidence file's Q4 intends.
  const duplicateStripeIds = [...seen.values()].filter((n) => n > 1).length;

  const missing = inputs.stripeEvents
    .filter((event) => !seen.has(event.id))
    .map((event) => event.id)
    .sort();

  return {
    source: "stripe+prisma",
    mode: inputs.liveMode ? "live" : "test",
    windowDays: D3_WINDOW_DAYS,
    windowEndsAt: inputs.windowEndsAt,
    eventTypesScanned: [...D3_EVENT_TYPES].join(","),
    stripeEventCount: inputs.stripeEvents.length,
    matchedInDb: inputs.stripeEvents.length - missing.length,
    missingInDb: missing.length,
    duplicateStripeIds,
    dbEventsWithoutStripeId: inputs.dbEventsWithoutStripeId,
    failedWebhookDeliveries: inputs.failedWebhookDeliveries,
    // Bounded: the receipt is a measurement, not an incident report. The full
    // list belongs in the run log, where it is not signed into a receipt.
    missingIds: missing.slice(0, 20).join(","),
  };
}

/** Window bounds as Unix seconds, which is what Stripe's `created` filter takes. */
export function d3Window(now: Date): { gte: number; lte: number } {
  const lte = Math.floor(now.getTime() / 1000);
  return { gte: lte - D3_WINDOW_DAYS * 86_400, lte };
}

export interface StripeEventPage {
  data: StripeEventRef[];
  has_more: boolean;
}

/**
 * Walk every page of Stripe events.
 *
 * As with the A3 producer, pagination is a correctness control rather than an
 * optimisation: a truncated list under-reports `stripeEventCount` and, worse,
 * silently drops events that may have no database row -- turning a real
 * shortfall into a clean reconciliation.
 */
export async function fetchAllStripeEvents(
  fetchPage: (startingAfter: string | null) => Promise<StripeEventPage>,
  maxPages = 100,
): Promise<StripeEventRef[]> {
  const events: StripeEventRef[] = [];
  let startingAfter: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(startingAfter);
    events.push(...result.data);
    if (!result.has_more) return events;
    const last = result.data[result.data.length - 1];
    if (!last) {
      throw new Error(
        "Stripe reported more pages but returned an empty one; refusing to " +
          "report a possibly truncated reconciliation",
      );
    }
    startingAfter = last.id;
  }
  throw new Error(
    `Stopped after ${maxPages} pages; refusing to report a truncated reconciliation`,
  );
}

/**
 * Take the measurement. Exported so `sign-release-receipt.ts` can invoke it
 * directly rather than accepting numbers on the command line — see that file
 * for why hand-supplied measurements made a signed receipt meaningless.
 */
export async function produceD3Measurements(): Promise<D3Measurements> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return reconcile(key);
}

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set.");
    process.exit(2);
  }
  const measurements = await reconcile(key);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(measurements));
    return;
  }
  console.log(
    `Stripe ${measurements.stripeEventCount} events (${measurements.mode} mode), ` +
      `${measurements.matchedInDb} matched, ${measurements.missingInDb} missing from the database.`,
  );
  if (measurements.missingInDb > 0) {
    console.log(`Missing: ${measurements.missingIds}`);
  }
}

/** The Stripe + Prisma round trip, shared by the CLI and the signer. */
async function reconcile(key: string): Promise<D3Measurements> {
  const [{ stripe }, { prisma }] = await Promise.all([
    import("../../../lib/stripe"),
    import("../../../lib/prisma"),
  ]);

  const now = new Date();
  const window = d3Window(now);
  const events = await fetchAllStripeEvents(async (startingAfter) => {
    const page = await stripe.events.list({
      created: { gte: window.gte, lte: window.lte },
      types: [...D3_EVENT_TYPES],
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    return { data: page.data, has_more: page.has_more };
  });

  const ids = events.map((event) => event.id);
  const [dbRows, dbEventsWithoutStripeId] = await Promise.all([
    ids.length
      ? prisma.subscriptionEvent.findMany({
          where: { stripeEventId: { in: ids } },
          select: { stripeEventId: true },
        })
      : Promise.resolve([]),
    prisma.subscriptionEvent.count({
      where: {
        stripeEventId: null,
        createdAt: { gte: new Date(window.gte * 1000) },
      },
    }),
  ]);

  return reconcileD3({
    stripeEvents: events,
    dbRows,
    dbEventsWithoutStripeId,
    // Stripe exposes delivery attempts per endpoint rather than a simple
    // window count, so this is supplied by the caller until that query exists.
    // Defaulting it to 0 would silently satisfy the one check the evidence
    // file names as the likeliest cause of a shortfall.
    failedWebhookDeliveries: Number(
      process.env.D3_FAILED_WEBHOOK_DELIVERIES ?? "-1",
    ),
    liveMode: key.startsWith("sk_live"),
    windowEndsAt: new Date(window.lte * 1000).toISOString(),
  });
}

if (process.argv[1]?.endsWith("d3-revenue-reconciliation.ts")) {
  main().catch((error) => {
    console.error(String(error));
    process.exit(1);
  });
}
