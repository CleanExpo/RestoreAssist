/**
 * RA-6962 (follow-up to #1674) — the P2002 reprocess path must NOT be defeated
 * by the money handlers' own inner SubscriptionEvent dedupe.
 *
 * handleCheckoutCompleted records a SubscriptionEvent row first and, before the
 * follow-up fix, RETURNED on its dedupe. So a first delivery that FAILED *after*
 * the inner row committed but *before* the activation/bonus write left the outer
 * row FAILED — and a retry re-entered the handler, saw the inner row deduped,
 * and short-circuited, so activation + the signup bonus were NEVER applied.
 *
 * These tests drive the real POST with mocked Prisma/Stripe/email and prove:
 *   1. first delivery throws after the SubscriptionEvent commits -> 500 + FAILED
 *   2. retry over the FAILED row reprocesses (reprocessing=true) and DOES apply
 *      activation + the +10 bonus, EXACTLY once, even though the inner dedupe
 *      reports the event as already seen
 *   3. a third delivery over a COMPLETED row skips (no reprocess)
 * plus the stale-vs-fresh PENDING matrix.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PRICING_CONFIG } from "@/lib/pricing";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stripeWebhookEvent: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { retrieve: vi.fn() },
  },
}));
vi.mock("@/lib/billing/subscription-event", () => ({
  recordSubscriptionEvent: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  sendSubscriptionActivatedEmail: vi.fn(async () => undefined),
}));
vi.mock("@/lib/prisma-assert", () => ({ warnIfZeroRows: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map([["stripe-signature", "sig"]])),
}));
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

import { POST } from "../route";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { recordSubscriptionEvent } from "@/lib/billing/subscription-event";

const swe = (
  prisma as unknown as {
    stripeWebhookEvent: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  }
).stripeWebhookEvent;
const userUpdateMany = (
  prisma as unknown as { user: { updateMany: ReturnType<typeof vi.fn> } }
).user.updateMany;
const userFindUnique = (
  prisma as unknown as { user: { findUnique: ReturnType<typeof vi.fn> } }
).user.findUnique;
const recSpy = vi.mocked(recordSubscriptionEvent);

const P2002 = Object.assign(new Error("Unique constraint failed"), {
  code: "P2002",
});

function makeEvent() {
  return {
    id: "evt_checkout_1",
    type: "checkout.session.completed",
    data: {
      object: {
        mode: "subscription",
        subscription: "sub_1",
        customer: "cus_1",
        metadata: { userId: "u1", tier: "STANDARD" },
        payment_status: "paid",
        amount_total: 9900,
        currency: "aud",
        invoice: null,
      },
    },
  };
}

function makeRequest() {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "sig" },
  });
}

/** All calls to prisma.user.updateMany that are the guarded signup-bonus write. */
function bonusCalls() {
  return userUpdateMany.mock.calls.filter(
    ([arg]) => arg?.where?.signupBonusApplied === false,
  );
}

describe("stripe webhook — reprocess is not defeated by inner dedupe (RA-6962)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    swe.updateMany.mockResolvedValue({ count: 1 });
    userFindUnique.mockResolvedValue({
      id: "u1",
      name: "Owner",
      email: "owner@example.com",
      subscriptionStatus: "TRIAL",
    });
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      makeEvent() as never,
    );
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      id: "sub_1",
      items: {
        data: [
          {
            current_period_end: 2_000_000_000,
            price: { recurring: { interval: "month" } },
          },
        ],
      },
    } as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("first delivery throws after the SubscriptionEvent commits -> 500 + FAILED; retry reprocesses and applies activation + bonus exactly once; third over COMPLETED skips", async () => {
    // Delivery 1: fresh outer row; inner SubscriptionEvent commits (recorded);
    // the activation updateMany throws -> outer catch marks FAILED -> 500.
    swe.create.mockResolvedValueOnce({});
    recSpy.mockResolvedValueOnce({ kind: "recorded" } as never);
    userUpdateMany.mockRejectedValueOnce(new Error("db blip on activation"));

    const res1 = await POST(makeRequest());
    expect(res1.status).toBe(500);
    expect(swe.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeEventId: "evt_checkout_1" },
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    // The failed delivery applied neither activation nor bonus.
    expect(bonusCalls()).toHaveLength(0);

    // Delivery 2: create hits P2002, outer row is FAILED -> reprocess. The inner
    // dedupe now reports "deduped" (row committed on delivery 1), but the
    // handler must STILL apply activation + bonus because reprocessing=true.
    swe.create.mockRejectedValueOnce(P2002);
    swe.findUnique.mockResolvedValueOnce({
      status: "FAILED",
      createdAt: new Date(),
    });
    recSpy.mockResolvedValueOnce({ kind: "deduped" } as never);
    userUpdateMany.mockResolvedValue({ count: 1 });

    const res2 = await POST(makeRequest());
    expect(res2.status).toBe(200);
    // Activation was applied on reprocess.
    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({ subscriptionStatus: "ACTIVE" }),
      }),
    );
    // Signup bonus applied — atomically, guarded, exactly once.
    expect(bonusCalls()).toHaveLength(1);
    expect(bonusCalls()[0][0]).toMatchObject({
      where: { id: "u1", signupBonusApplied: false },
      data: {
        addonReports: {
          increment: PRICING_CONFIG.pricing.monthly.signupBonus,
        },
        signupBonusApplied: true,
      },
    });

    const recCallsAfter2 = recSpy.mock.calls.length;
    const updateManyAfter2 = userUpdateMany.mock.calls.length;

    // Delivery 3: create hits P2002, outer row COMPLETED -> skip, no reprocess.
    swe.create.mockRejectedValueOnce(P2002);
    swe.findUnique.mockResolvedValueOnce({
      status: "COMPLETED",
      createdAt: new Date(),
    });

    const res3 = await POST(makeRequest());
    expect(res3.status).toBe(200);
    // The handler did not run again: no new record or write calls.
    expect(recSpy.mock.calls.length).toBe(recCallsAfter2);
    expect(userUpdateMany.mock.calls.length).toBe(updateManyAfter2);
    // Still exactly one bonus grant across all three deliveries.
    expect(bonusCalls()).toHaveLength(1);
  });

  it("stale PENDING (>5min) reprocesses and applies the state writes; a fresh PENDING is acknowledged without reprocessing", async () => {
    // Stale PENDING -> reprocess. Inner dedupe reports deduped; reprocessing=true
    // forces the idempotent writes to run.
    swe.create.mockRejectedValueOnce(P2002);
    swe.findUnique.mockResolvedValueOnce({
      status: "PENDING",
      createdAt: new Date(Date.now() - 6 * 60 * 1000),
    });
    recSpy.mockResolvedValueOnce({ kind: "deduped" } as never);
    userUpdateMany.mockResolvedValue({ count: 1 });

    const resStale = await POST(makeRequest());
    expect(resStale.status).toBe(200);
    expect(bonusCalls()).toHaveLength(1);

    const updateManyAfterStale = userUpdateMany.mock.calls.length;

    // Fresh PENDING (a concurrent delivery is in flight) -> skip.
    swe.create.mockRejectedValueOnce(P2002);
    swe.findUnique.mockResolvedValueOnce({
      status: "PENDING",
      createdAt: new Date(),
    });

    const resFresh = await POST(makeRequest());
    expect(resFresh.status).toBe(200);
    expect(userUpdateMany.mock.calls.length).toBe(updateManyAfterStale);
  });
});
