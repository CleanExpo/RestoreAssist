/**
 * Release-gate F1 (monitoring + alerting) — "billing webhook errors".
 *
 * The F1 evidence file records that the obvious alert rule for this failure
 * class would never have fired: on an ORDINARY processing failure the handler
 * wrote `StripeWebhookEvent.status = 'FAILED'` and returned a bare HTTP 500
 * with no console output at all. The two `console.error` calls in that catch
 * block sit inside the audit write's own `.catch()`, so they fire only on the
 * rare double failure. Vercel Observability cannot read the database row, so
 * there was no log line to alert on and nothing carrying the Stripe event id.
 *
 * These tests pin the signal itself, not the phrasing of the message:
 * a `[error]` line whose payload names the stage, the route, the Stripe event
 * id and the underlying error — the fields an alert rule filters on.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stripeWebhookEvent: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
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

const EVENT_ID = "evt_observability_1";
const PROCESSING_ERROR = "db blip on activation";

function makeEvent() {
  return {
    id: EVENT_ID,
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

/**
 * Every structured observability line emitted this test, decoded.
 * `reportError` emits `console.error("[error]", JSON.stringify(payload))`, so
 * the marker is the first argument and the payload is the second.
 */
function structuredErrorPayloads(
  spy: ReturnType<typeof vi.spyOn>,
): Array<Record<string, unknown>> {
  return (spy.mock.calls as unknown[][])
    .filter((call) => call[0] === "[error]")
    .map((call) => JSON.parse(String(call[1])) as Record<string, unknown>);
}

describe("stripe webhook — an ordinary processing failure is observable (release-gate F1)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    swe.create.mockResolvedValue({});
    swe.updateMany.mockResolvedValue({ count: 1 });
    userFindUnique.mockResolvedValue({
      id: "u1",
      name: "Owner",
      email: "owner@example.com",
      subscriptionStatus: "TRIAL",
    });
    userUpdateMany.mockResolvedValue({ count: 1 });
    vi.mocked(recordSubscriptionEvent).mockResolvedValue({
      kind: "recorded",
    } as never);
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
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("emits a structured [error] line naming the stage, route and Stripe event id when the audit write SUCCEEDS", async () => {
    // The ordinary failure: processing throws, the FAILED audit write lands.
    userUpdateMany.mockRejectedValueOnce(new Error(PROCESSING_ERROR));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    // The audit write really did succeed — this is the ordinary case, not the
    // double failure the legacy console.error calls already covered.
    expect(swe.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeEventId: EVENT_ID },
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );

    const payloads = structuredErrorPayloads(errorSpy);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      stage: "stripe-webhook:processing",
      route: "/api/webhooks/stripe",
      status: 500,
      code: "INTERNAL",
      stripeEventId: EVENT_ID,
      eventType: "checkout.session.completed",
      message: PROCESSING_ERROR,
    });
  });

  it("still returns 500 so Stripe retries, and answers with the repository's error envelope", async () => {
    userUpdateMany.mockRejectedValueOnce(new Error(PROCESSING_ERROR));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    const body = (await res.json()) as {
      error: { code: string; message: string; eventId: string };
    };
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).toBe("Webhook processing failed");
    expect(body.error.eventId).toEqual(expect.any(String));
    expect(body.error.eventId.length).toBeGreaterThan(0);

    // The correlation id is the whole point of returning one: an operator
    // holding the 500 must be able to find the log line, and vice versa.
    // Asserting only that BOTH are non-empty would hold even if they were two
    // independently generated ids, which is the failure this pins.
    const payloads = structuredErrorPayloads(errorSpy);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].eventId).toBe(body.error.eventId);
  });

  it("also emits the structured line when the audit write ITSELF fails, alongside the legacy pair", async () => {
    userUpdateMany.mockRejectedValueOnce(new Error(PROCESSING_ERROR));
    swe.updateMany.mockRejectedValueOnce(new Error("audit write down"));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    // The double-failure trail RA-1302 added is untouched...
    const legacy = (errorSpy.mock.calls as unknown[][]).filter((call) =>
      String(call[0]).startsWith("[Stripe] Audit update"),
    );
    expect(legacy).toHaveLength(2);

    // ...and the alertable signal is emitted here too, so one rule covers both.
    const payloads = structuredErrorPayloads(errorSpy);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      stage: "stripe-webhook:processing",
      stripeEventId: EVENT_ID,
    });
  });

  it("emits NO [error] line on a successful delivery", async () => {
    // Negative control: without this, every assertion above would still hold
    // if the handler logged unconditionally, and the alert rule would page on
    // every healthy webhook.
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(structuredErrorPayloads(errorSpy)).toHaveLength(0);
  });
});
