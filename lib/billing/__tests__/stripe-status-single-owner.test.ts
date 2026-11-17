/**
 * RA-8431 — discovering guard: one owner translates a Stripe subscription into
 * User.subscriptionStatus (lib/billing/stripe-status.ts).
 *
 * Three writers each held their own copy of that translation and disagreed (an
 * `unpaid` customer was PAST_DUE from the webhook and EXPIRED from the
 * dashboard). This test reads every source file under app/ and lib/ that touches
 * a Stripe subscription and fails when one writes `subscriptionStatus` with a
 * literal from {ACTIVE, PAST_DUE, CANCELED, EXPIRED} — including inside a
 * ternary or via `SubscriptionStatus.X` — outside a Prisma `where`.
 *
 * Writers that act on a Stripe EVENT or a user ACTION rather than translating a
 * subscription's status are listed below with an exact count and a reason. The
 * list is exact both ways: a new writer fails, and an entry whose writer has
 * gone fails until it is removed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

const REPO = join(__dirname, "..", "..", "..");
const OWNER = "lib/billing/stripe-status.ts";
const STATUSES = new Set(["ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"]);
const STRIPE_SUBSCRIPTION_READ =
  /stripe\.subscriptions\.(retrieve|list|update|create)|Stripe\.Subscription\b/;

/** file::STATUS -> [count, reason]. Every reason names why it is not a translation. */
const ALLOWED: Record<string, [number, string]> = {
  "app/api/webhooks/stripe/route.ts::ACTIVE": [
    2,
    "checkout.session.completed activation and customer.subscription.created; event-driven. Follow-up: route created through the owner",
  ],
  "app/api/webhooks/stripe/route.ts::PAST_DUE": [
    1,
    "invoice.payment_failed: an invoice event, not a subscription status read",
  ],
  "app/api/webhooks/stripe/route.ts::CANCELED": [
    1,
    "downgradeUserToCanceled: subscription deleted / resource_missing",
  ],
  "app/api/reactivate-subscription/route.ts::ACTIVE": [
    1,
    "user action after cancel_at_period_end=false. Follow-up: write the owner's reading of the updated subscription",
  ],
  "app/api/cancel-subscription/route.ts::CANCELED": [
    1,
    "user action; RA-8430 (in progress) owns removing it",
  ],
  "app/api/check-active-subscription/route.ts::ACTIVE": [
    1,
    "lifetime one-time checkout fallback, not a subscription",
  ],
};

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function statusLiteralsIn(node: ts.Node): string[] {
  const found: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) && STATUSES.has(n.text)) found.push(n.text);
    if (
      ts.isPropertyAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "SubscriptionStatus" &&
      STATUSES.has(n.name.text)
    ) {
      found.push(n.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function insideWhere(node: ts.Node): boolean {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isPropertyAssignment(p) && p.name.getText() === "where") return true;
  }
  return false;
}

/** Status literals written to `subscriptionStatus` in one source text. */
export function statusWrites(fileName: string, text: string): string[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const hits: string[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isPropertyAssignment(n) &&
      n.name.getText() === "subscriptionStatus" &&
      !insideWhere(n)
    ) {
      hits.push(...statusLiteralsIn(n.initializer));
    }
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(n.left) &&
      n.left.name.text === "subscriptionStatus"
    ) {
      hits.push(...statusLiteralsIn(n.right));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

function scan() {
  const files = [...walk(join(REPO, "app"), []), ...walk(join(REPO, "lib"), [])];
  const stripeFiles: string[] = [];
  const counts: Record<string, number> = {};
  for (const full of files) {
    const rel = relative(REPO, full).split(sep).join("/");
    if (rel === OWNER) continue;
    const text = readFileSync(full, "utf8");
    if (!STRIPE_SUBSCRIPTION_READ.test(text)) continue;
    stripeFiles.push(rel);
    for (const status of statusWrites(rel, text)) {
      const key = `${rel}::${status}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return { stripeFiles, counts };
}

describe("Stripe subscription status has one owner (RA-8431)", () => {
  it("the detector sees a ternary, an enum member and an assignment, and skips where", () => {
    const planted = `
      prisma.user.update({ data: { subscriptionStatus: live ? "ACTIVE" : s === "x" ? "PAST_DUE" : "EXPIRED" } });
      prisma.user.update({ data: { subscriptionStatus: SubscriptionStatus.CANCELED } });
      updateData.subscriptionStatus = "ACTIVE";
      prisma.user.findMany({ where: { subscriptionStatus: { in: ["ACTIVE", "TRIAL"] } } });
      prisma.user.findMany({ where: { subscriptionStatus: "ACTIVE" } });
      prisma.user.update({ data: { subscriptionStatus: "TRIAL" } });
    `;
    expect(statusWrites("planted.ts", planted).sort()).toEqual(
      ["ACTIVE", "ACTIVE", "CANCELED", "EXPIRED", "PAST_DUE"].sort(),
    );
  });

  it("scans the known Stripe subscription readers", () => {
    const { stripeFiles } = scan();
    for (const f of [
      "app/api/subscription/route.ts",
      "app/api/webhooks/stripe/route.ts",
      "app/api/verify-subscription/route.ts",
      "app/api/check-active-subscription/route.ts",
      "lib/cron/reconcile-stripe.ts",
    ]) {
      expect(stripeFiles).toContain(f);
    }
  });

  it("no file outside the owner writes a Stripe-derived status literal, except the named event/action writers", () => {
    const { counts } = scan();
    const expected = Object.fromEntries(
      Object.entries(ALLOWED).map(([k, [n]]) => [k, n]),
    );
    expect(counts).toEqual(expected);
  });
});
