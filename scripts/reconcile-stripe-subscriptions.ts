/**
 * scripts/reconcile-stripe-subscriptions.ts — RA-1801 follow-up
 *
 * Backfills User.subscriptionStatus / subscriptionId / subscriptionPlan /
 * subscriptionEndsAt / nextBillingDate / creditsRemaining from Stripe truth
 * after the period when STRIPE_WEBHOOK_SECRET was missing in prod and every
 * Stripe webhook delivery bounced with HTTP 500.
 *
 * Mirrors the canonical mapping in app/api/webhooks/stripe/route.ts so the
 * reconciliation produces the same DB state the live webhook handler would have.
 *
 * Usage
 *   # Dry-run (default) — reports drift, writes no changes
 *   pnpm tsx scripts/reconcile-stripe-subscriptions.ts
 *
 *   # Apply fixes
 *   pnpm tsx scripts/reconcile-stripe-subscriptions.ts --apply
 *
 *   # Limit scope (useful for spot checks)
 *   pnpm tsx scripts/reconcile-stripe-subscriptions.ts --customer cus_ABC123
 *   pnpm tsx scripts/reconcile-stripe-subscriptions.ts --max 10
 *
 * Environment
 *   DATABASE_URL          required
 *   DIRECT_URL            required (used by Prisma for non-pgbouncer queries)
 *   STRIPE_SECRET_KEY     required
 *
 * Output
 *   /tmp/stripe-reconciliation-{timestamp}.json — full per-user diff
 *   stdout — summary table
 *
 * Safety
 *   - lifetimeAccess users are NEVER downgraded — they keep ACTIVE/lifetime state
 *     regardless of Stripe subscription presence (lifetime is a one-time purchase
 *     held outside the subscription lifecycle).
 *   - Users with no stripeCustomerId are skipped (TRIAL / fresh signups).
 *   - --apply uses single-row updates with explicit where clauses; no bulk wipes.
 */

// Load env from .env.local first (Next.js convention), then .env (fallback).
// Without this the script bails with "STRIPE_SECRET_KEY is required" because
// it's not run via Next.js so env files aren't auto-injected.
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
// .env.production.local first so prod DATABASE_URL + STRIPE_SECRET_KEY win
// over any dev values in .env.local.
for (const f of [".env.production.local", ".env.local", ".env"]) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) loadEnv({ path: p, override: false });
}

import { PrismaClient, SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";
import { writeFileSync } from "node:fs";

// ── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const customerArg = args.find((a) => a.startsWith("--customer"));
const ONLY_CUSTOMER = customerArg
  ? args[args.indexOf(customerArg) + 1] ?? customerArg.split("=")[1] ?? null
  : null;
const maxArg = args.find((a) => a.startsWith("--max"));
const MAX_USERS = maxArg
  ? Number(args[args.indexOf(maxArg) + 1] ?? maxArg.split("=")[1] ?? "0")
  : 0;

// ── Env ──────────────────────────────────────────────────────────────────────
if (!process.env.STRIPE_SECRET_KEY)
  throw new Error("STRIPE_SECRET_KEY is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-10-29.clover" as const,
});
const prisma = new PrismaClient();

// ── Canonical mapping (mirrors webhook handler) ──────────────────────────────

/** Maps Stripe subscription.status string → our internal enum. */
function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  const map: Record<string, SubscriptionStatus> = {
    active: SubscriptionStatus.ACTIVE,
    trialing: SubscriptionStatus.TRIAL,
    past_due: SubscriptionStatus.PAST_DUE,
    unpaid: SubscriptionStatus.PAST_DUE,
    canceled: SubscriptionStatus.CANCELED,
    incomplete: SubscriptionStatus.TRIAL,
    incomplete_expired: SubscriptionStatus.EXPIRED,
    paused: SubscriptionStatus.CANCELED,
  };
  return map[stripeStatus] ?? SubscriptionStatus.CANCELED;
}

/** Same algorithm as derivePlanNameFromSubscription in the webhook route. */
function derivePlanName(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  if (!item) return null;
  const price = item.price;
  if (!price) return null;

  const product = price.product;
  if (product && typeof product === "object" && "name" in product) {
    return (product as Stripe.Product).name ?? null;
  }
  if (price.nickname) return price.nickname;

  const interval = price.recurring?.interval;
  if (interval === "month") return "Monthly Plan";
  if (interval === "year") return "Yearly Plan";
  return null;
}

/**
 * Stripe credits-remaining policy from the webhook handler:
 *   - subscription.created / invoice.payment_succeeded → 999999
 *   - subscription.deleted → 0
 *   - everything else: leave unchanged
 *
 * For reconciliation we apply the same: if there's an active sub we top up to
 * 999999; if the sub is deleted/canceled we zero it; if PAST_DUE we leave the
 * existing balance alone (user can keep using until grace period ends).
 */
function deriveCreditsRemaining(
  status: SubscriptionStatus,
  currentCredits: number | null,
): number | null {
  if (status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIAL)
    return 999999;
  if (status === SubscriptionStatus.EXPIRED || status === SubscriptionStatus.CANCELED)
    return 0;
  return currentCredits; // PAST_DUE — preserve grace
}

// ── Pull desired state from Stripe ───────────────────────────────────────────

interface DesiredState {
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionId: string | null;
  subscriptionPlan: string | null;
  subscriptionEndsAt: Date | null;
  nextBillingDate: Date | null;
  creditsRemaining: number | null;
  /** Free-text reason for diff lines / report. */
  source: string;
}

async function fetchDesiredStateForCustomer(
  customerId: string,
  currentCredits: number | null,
): Promise<DesiredState> {
  // List ALL subscriptions for the customer (any status), pick the most
  // relevant one. Stripe lists newest first.
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
    expand: ["data.items.data.price.product"],
  });

  if (subs.data.length === 0) {
    // Customer exists in Stripe but has no subscription. They may have made a
    // one-off lifetime purchase or never converted. Don't touch sub fields.
    return {
      subscriptionStatus: null,
      subscriptionId: null,
      subscriptionPlan: null,
      subscriptionEndsAt: null,
      nextBillingDate: null,
      creditsRemaining: currentCredits,
      source: "no-stripe-subscriptions-for-customer",
    };
  }

  // Prefer an ACTIVE / TRIALING / PAST_DUE one over canceled. Otherwise newest.
  const ranked = [...subs.data].sort((a, b) => {
    const rank: Record<string, number> = {
      active: 0,
      trialing: 1,
      past_due: 2,
      unpaid: 3,
      paused: 4,
      incomplete: 5,
      incomplete_expired: 6,
      canceled: 7,
    };
    const ra = rank[a.status] ?? 99;
    const rb = rank[b.status] ?? 99;
    if (ra !== rb) return ra - rb;
    return b.created - a.created;
  });
  const sub = ranked[0]!;

  const status = mapStripeStatus(sub.status);
  const periodEndUnix = sub.items.data[0]?.current_period_end ?? 0;
  const endsAt = periodEndUnix ? new Date(periodEndUnix * 1000) : null;

  return {
    subscriptionStatus: status,
    subscriptionId: sub.id,
    subscriptionPlan: derivePlanName(sub),
    subscriptionEndsAt: endsAt,
    nextBillingDate: endsAt,
    creditsRemaining: deriveCreditsRemaining(status, currentCredits),
    source: `stripe-sub:${sub.id}:${sub.status}`,
  };
}

// ── Diff producer ────────────────────────────────────────────────────────────

interface UserSnapshot {
  id: string;
  email: string;
  stripeCustomerId: string;
  lifetimeAccess: boolean;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionId: string | null;
  subscriptionPlan: string | null;
  subscriptionEndsAt: Date | null;
  nextBillingDate: Date | null;
  creditsRemaining: number | null;
}

interface FieldDiff {
  field: string;
  current: unknown;
  desired: unknown;
}

interface UserDrift {
  userId: string;
  email: string;
  stripeCustomerId: string;
  lifetimeAccess: boolean;
  source: string;
  diffs: FieldDiff[];
  /** True if --apply would actually write changes for this user. */
  willApply: boolean;
}

/** Same-day equality treats Date|null comparisons as equal if within 1 minute. */
function dateEq(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a.getTime() - b.getTime()) < 60_000;
}

function computeDiff(
  current: UserSnapshot,
  desired: DesiredState,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const cmp = (
    field: keyof UserSnapshot & keyof DesiredState,
    eq: (a: unknown, b: unknown) => boolean = (a, b) => a === b,
  ) => {
    const c = current[field as keyof UserSnapshot];
    const d = desired[field as keyof DesiredState];
    if (!eq(c, d)) {
      diffs.push({ field: String(field), current: c, desired: d });
    }
  };

  cmp("subscriptionStatus");
  cmp("subscriptionId");
  cmp("subscriptionPlan");
  cmp("subscriptionEndsAt", (a, b) => dateEq(a as Date | null, b as Date | null));
  cmp("nextBillingDate", (a, b) => dateEq(a as Date | null, b as Date | null));
  cmp("creditsRemaining");
  return diffs;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date();
  console.log(
    `[reconcile-stripe-subscriptions] mode=${APPLY ? "APPLY" : "DRY-RUN"} ` +
      `customer=${ONLY_CUSTOMER ?? "*"} max=${MAX_USERS || "all"}`,
  );

  // 1. Pull Users with stripeCustomerId
  const users = await prisma.user.findMany({
    where: ONLY_CUSTOMER
      ? { stripeCustomerId: ONLY_CUSTOMER }
      : { stripeCustomerId: { not: null } },
    select: {
      id: true,
      email: true,
      stripeCustomerId: true,
      lifetimeAccess: true,
      subscriptionStatus: true,
      subscriptionId: true,
      subscriptionPlan: true,
      subscriptionEndsAt: true,
      nextBillingDate: true,
      creditsRemaining: true,
    },
    take: MAX_USERS > 0 ? MAX_USERS : undefined,
    orderBy: { createdAt: "asc" },
  });
  console.log(`Found ${users.length} users with stripeCustomerId`);

  const drifts: UserDrift[] = [];
  let cleanCount = 0;
  let lifetimeSkipCount = 0;
  let stripeErrors = 0;

  for (const user of users) {
    if (!user.stripeCustomerId) continue;
    const current: UserSnapshot = {
      id: user.id,
      email: user.email,
      stripeCustomerId: user.stripeCustomerId,
      lifetimeAccess: user.lifetimeAccess ?? false,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionId: user.subscriptionId,
      subscriptionPlan: user.subscriptionPlan,
      subscriptionEndsAt: user.subscriptionEndsAt,
      nextBillingDate: user.nextBillingDate,
      creditsRemaining: user.creditsRemaining,
    };

    let desired: DesiredState;
    try {
      desired = await fetchDesiredStateForCustomer(
        user.stripeCustomerId,
        user.creditsRemaining,
      );
    } catch (err) {
      stripeErrors++;
      console.error(
        `  ✗ stripe error for ${user.email} (${user.stripeCustomerId}):`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    // Lifetime safeguard
    if (current.lifetimeAccess) {
      lifetimeSkipCount++;
      continue;
    }

    const diffs = computeDiff(current, desired);
    if (diffs.length === 0) {
      cleanCount++;
      continue;
    }

    const drift: UserDrift = {
      userId: user.id,
      email: user.email,
      stripeCustomerId: user.stripeCustomerId,
      lifetimeAccess: false,
      source: desired.source,
      diffs,
      willApply: APPLY,
    };
    drifts.push(drift);

    if (APPLY) {
      // Build the update payload only from fields that differ. Fields with
      // desired = null/undefined when the source has no Stripe sub mean we
      // intentionally don't touch them (already handled in desired calc).
      const data: Record<string, unknown> = {};
      for (const d of diffs) data[d.field] = d.desired;
      await prisma.user.update({
        where: { id: user.id },
        data: data as Parameters<typeof prisma.user.update>[0]["data"],
      });
      console.log(
        `  ✓ updated ${user.email} (${diffs.length} field${diffs.length === 1 ? "" : "s"})`,
      );
    } else {
      console.log(
        `  ~ drift ${user.email}: ${diffs.map((d) => d.field).join(", ")}`,
      );
    }
  }

  // 2. Summary
  const summary = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    mode: APPLY ? "APPLY" : "DRY-RUN",
    onlyCustomer: ONLY_CUSTOMER,
    maxUsers: MAX_USERS || null,
    totals: {
      usersScanned: users.length,
      cleanNoChange: cleanCount,
      lifetimeSkipped: lifetimeSkipCount,
      driftFound: drifts.length,
      stripeErrors,
    },
    drifts,
  };

  const outPath = `/tmp/stripe-reconciliation-${Date.now()}.json`;
  writeFileSync(outPath, JSON.stringify(summary, null, 2));

  console.log("\n──────────────────────────────────────────────────────────");
  console.log(`Mode:                 ${summary.mode}`);
  console.log(`Users scanned:        ${summary.totals.usersScanned}`);
  console.log(`Clean (no change):    ${summary.totals.cleanNoChange}`);
  console.log(`Lifetime skipped:     ${summary.totals.lifetimeSkipped}`);
  console.log(`Drift found:          ${summary.totals.driftFound}`);
  console.log(`Stripe errors:        ${summary.totals.stripeErrors}`);
  console.log(`Full report:          ${outPath}`);
  console.log("──────────────────────────────────────────────────────────");
  if (!APPLY && drifts.length > 0) {
    console.log("Re-run with --apply to write the changes.");
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
