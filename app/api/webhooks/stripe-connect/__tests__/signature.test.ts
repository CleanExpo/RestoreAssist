import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * P1-MNY-01 C5 — the Connect webhook verifies every delivery with its OWN
 * secret (STRIPE_CONNECT_WEBHOOK_SECRET) using Stripe's real signature check
 * (the SDK's HMAC, no network). Unsigned, wrongly signed, or signed with the
 * platform endpoint's secret -> 400 before any database write. No secret
 * configured -> 500.
 * Sabotage: skip constructEvent, or fall back to STRIPE_WEBHOOK_SECRET — the
 * wrong-secret / platform-secret cases reach the database and fail.
 */

vi.mock("@/lib/stripe", async () => {
  const Stripe = (await import("stripe")).default;
  // Placeholder key: only the offline webhook signature helpers are used.
  return { stripe: new Stripe("sk_test_not_a_real_key") };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stripeWebhookEvent: {
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn(),
    },
    workspace: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  },
}));

vi.mock("@/lib/lifecycle/subscribers/invoice-paid", () => ({
  onInvoicePaid: vi.fn().mockResolvedValue({ ok: true }),
}));

import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const CONNECT_SECRET = "whsec_connect_fixture";
const PLATFORM_SECRET = "whsec_platform_fixture";
const signer = new Stripe("sk_test_not_a_real_key");

const payload = JSON.stringify({
  id: "evt_sig_1",
  object: "event",
  type: "account.updated",
  account: "acct_A",
  data: {
    object: {
      id: "acct_A",
      object: "account",
      charges_enabled: true,
      details_submitted: true,
    },
  },
});

function req(body: string, signature?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["stripe-signature"] = signature;
  return new NextRequest("http://localhost/api/webhooks/stripe-connect", {
    method: "POST",
    body,
    headers,
  });
}

function sign(secret: string, body = payload) {
  return signer.webhooks.generateTestHeaderString({ payload: body, secret });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = PLATFORM_SECRET;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function expectNoWrites() {
  expect(prisma.stripeWebhookEvent.create).not.toHaveBeenCalled();
  expect(prisma.workspace.updateMany).not.toHaveBeenCalled();
}

describe("Connect webhook signature", () => {
  it("positive control: a correctly signed event is processed", async () => {
    const res = await POST(req(payload, sign(CONNECT_SECRET)));
    expect(res.status).toBe(200);
    expect(prisma.workspace.updateMany).toHaveBeenCalled();
  });

  it("refuses an unsigned event", async () => {
    const res = await POST(req(payload));
    expect(res.status).toBe(400);
    expectNoWrites();
  });

  it("refuses an event signed with the wrong secret", async () => {
    const res = await POST(req(payload, sign("whsec_attacker")));
    expect(res.status).toBe(400);
    expectNoWrites();
  });

  it("refuses an event signed with the platform endpoint's secret", async () => {
    const res = await POST(req(payload, sign(PLATFORM_SECRET)));
    expect(res.status).toBe(400);
    expectNoWrites();
  });

  it("refuses a correctly signed body that was altered", async () => {
    const sig = sign(CONNECT_SECRET);
    const res = await POST(req(payload.replace("acct_A", "acct_B"), sig));
    expect(res.status).toBe(400);
    expectNoWrites();
  });

  it("answers 500 when the Connect secret is not configured", async () => {
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    const res = await POST(req(payload, sign(PLATFORM_SECRET)));
    expect(res.status).toBe(500);
    expectNoWrites();
  });
});
