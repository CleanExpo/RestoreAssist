/**
 * RA-6962 — P2002 dedup branch must reprocess recoverable duplicates.
 *
 * A duplicate StripeWebhookEvent row is NOT proof the event was handled. The
 * POST dedup branch inspects the existing row's status:
 *   - FAILED               → a prior delivery threw; reprocess.
 *   - PENDING & stale(>5m)  → a prior delivery crashed before COMPLETED; reprocess.
 *   - COMPLETED/SKIPPED/fresh-PENDING → acknowledge 200 without reprocessing.
 *
 * The handlers are idempotent, so reprocessing is safe. Prisma, Stripe and
 * next/headers are mocked (no live DB). The event type used is
 * `customer.updated`, whose only side effect is prisma.user.updateMany — an
 * easy proxy for "did the handler run again?".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stripeWebhookEvent: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: { webhooks: { constructEvent: vi.fn() } },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map([["stripe-signature", "sig"]])),
}));
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

import { POST } from "../route";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

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

const P2002 = Object.assign(new Error("Unique constraint failed"), {
  code: "P2002",
});

function makeEvent() {
  return {
    id: "evt_dedup_1",
    type: "customer.updated",
    data: { object: { id: "cus_1", email: "user@example.com" } },
  };
}

function makeRequest() {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "sig" },
  });
}

describe("stripe webhook — P2002 dedup reprocessing (RA-6962)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    swe.updateMany.mockResolvedValue({ count: 1 });
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
      makeEvent() as never,
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("first delivery throws -> 500 + FAILED; retry over a FAILED row reprocesses; third over COMPLETED skips", async () => {
    // Delivery 1: row created fresh, handler throws -> row marked FAILED, 500.
    swe.create.mockResolvedValueOnce({});
    userUpdateMany.mockRejectedValueOnce(new Error("boom"));

    const res1 = await POST(makeRequest());
    expect(res1.status).toBe(500);
    expect(swe.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeEventId: "evt_dedup_1" },
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );

    // Delivery 2: create hits P2002, existing row is FAILED -> reprocess.
    swe.create.mockRejectedValueOnce(P2002);
    swe.findUnique.mockResolvedValueOnce({
      status: "FAILED",
      createdAt: new Date(),
    });
    userUpdateMany.mockResolvedValueOnce({ count: 1 });

    const res2 = await POST(makeRequest());
    expect(res2.status).toBe(200);
    // Row flipped back to PENDING before reprocessing.
    expect(swe.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING" }),
      }),
    );
    // The handler ran again (delivery 1 + delivery 2).
    expect(userUpdateMany).toHaveBeenCalledTimes(2);

    // Delivery 3: create hits P2002, existing row is COMPLETED -> skip.
    swe.create.mockRejectedValueOnce(P2002);
    swe.findUnique.mockResolvedValueOnce({
      status: "COMPLETED",
      createdAt: new Date(),
    });

    const res3 = await POST(makeRequest());
    expect(res3.status).toBe(200);
    // NOT reprocessed — handler call count unchanged.
    expect(userUpdateMany).toHaveBeenCalledTimes(2);
  });

  it("stale PENDING (>5min) reprocesses; a fresh PENDING is acknowledged without reprocessing", async () => {
    // Stale PENDING -> reprocess.
    swe.create.mockRejectedValueOnce(P2002);
    swe.findUnique.mockResolvedValueOnce({
      status: "PENDING",
      createdAt: new Date(Date.now() - 6 * 60 * 1000),
    });
    userUpdateMany.mockResolvedValueOnce({ count: 1 });

    const resStale = await POST(makeRequest());
    expect(resStale.status).toBe(200);
    expect(userUpdateMany).toHaveBeenCalledTimes(1);

    // Fresh PENDING (another delivery in flight) -> skip.
    swe.create.mockRejectedValueOnce(P2002);
    swe.findUnique.mockResolvedValueOnce({
      status: "PENDING",
      createdAt: new Date(),
    });

    const resFresh = await POST(makeRequest());
    expect(resFresh.status).toBe(200);
    expect(userUpdateMany).toHaveBeenCalledTimes(1);
  });
});
