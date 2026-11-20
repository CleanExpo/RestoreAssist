/**
 * P1-MNY-01 C9 — a production Connect endpoint receives BOTH live and test
 * events (docs.stripe.com/connect/webhooks). An event whose livemode differs
 * from the platform key's mode (STRIPE_SECRET_KEY starts sk_live_) is ignored:
 * answered 200, recorded SKIPPED with a reason, and never pays an invoice.
 * A test-mode payment_intent.succeeded under a live key must leave the
 * invoice unpaid. Matching modes still reconcile (positive controls).
 * Sabotage: remove the livemode comparison — the mismatched cases pay the
 * invoice and these tests fail.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const tx = vi.hoisted(() => ({
  invoice: { findUnique: vi.fn(), updateMany: vi.fn() },
  invoicePayment: { findUnique: vi.fn(), create: vi.fn() },
  invoicePaymentAllocation: { findUnique: vi.fn(), create: vi.fn() },
  invoiceAuditLog: { create: vi.fn() },
}));

const events = vi.hoisted(
  () =>
    new Map<
      string,
      { status: string; errorMessage: string | null; createdAt: Date }
    >(),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stripeWebhookEvent: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: { stripeEventId: string; status: string; errorMessage?: string };
        }) => {
          if (events.has(data.stripeEventId)) {
            throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
          }
          events.set(data.stripeEventId, {
            status: data.status,
            errorMessage: data.errorMessage ?? null,
            createdAt: new Date(),
          });
          return {};
        },
      ),
      findUnique: vi.fn(async ({ where }: { where: { stripeEventId: string } }) => {
        const row = events.get(where.stripeEventId);
        return row ? { status: row.status, createdAt: row.createdAt } : null;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { stripeEventId: string };
          data: { status?: string; errorMessage?: string | null };
        }) => {
          const row = events.get(where.stripeEventId);
          if (!row) return { count: 0 };
          if (data.status) row.status = data.status;
          if (data.errorMessage !== undefined) row.errorMessage = data.errorMessage;
          return { count: 1 };
        },
      ),
    },
    workspace: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { webhooks: { constructEvent: vi.fn() } },
}));

vi.mock("@/lib/lifecycle/subscribers/invoice-paid", () => ({
  onInvoicePaid: vi.fn().mockResolvedValue({ ok: true }),
}));

process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_fixture";

import { POST } from "../route";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

// Placeholder values: only the sk_live_ / sk_test_ prefix is read.
const LIVE_KEY = "sk_live_not_a_real_key";
const TEST_KEY = "sk_test_not_a_real_key";

function piEvent(livemode: boolean, id = `evt_pi_${livemode}`) {
  return {
    id,
    type: "payment_intent.succeeded",
    livemode,
    account: "acct_A",
    data: {
      object: {
        id: "pi_1",
        status: "succeeded",
        amount_received: 11_000,
        currency: "aud",
        latest_charge: "ch_1",
        created: 1_786_250_000,
        livemode,
        metadata: {
          type: "invoice",
          invoiceId: "inv_A",
          invoiceNumber: "INV-A-0001",
          userId: "u_A",
          workspaceId: "ws_A",
        },
      },
    },
  };
}

function req() {
  return new NextRequest("http://localhost/api/webhooks/stripe-connect", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "t=1,v1=x" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  events.clear();
  vi.mocked(prisma.$transaction).mockImplementation(
    async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  );
  tx.invoice.findUnique.mockResolvedValue({
    id: "inv_A",
    invoiceNumber: "INV-A-0001",
    userId: "u_A",
    status: "SENT",
    currency: "AUD",
    totalIncGST: 11_000,
    amountPaid: 0,
    amountDue: 11_000,
    workspaceId: "ws_A",
    workspace: { stripeConnectAccountId: "acct_A" },
  });
  tx.invoice.updateMany.mockResolvedValue({ count: 1 });
  tx.invoicePayment.findUnique.mockResolvedValue(null);
  tx.invoicePayment.create.mockResolvedValue({ id: "pay_1" });
  tx.invoicePaymentAllocation.create.mockResolvedValue({ id: "alloc_1" });
  tx.invoiceAuditLog.create.mockResolvedValue({ id: "audit_1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
});

function expectUnpaid() {
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  expect(tx.invoicePayment.create).not.toHaveBeenCalled();
}

describe("Connect webhook livemode guard", () => {
  it("positive control: a live event under a live key reconciles", async () => {
    process.env.STRIPE_SECRET_KEY = LIVE_KEY;
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(piEvent(true) as never);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(tx.invoice.updateMany).toHaveBeenCalledTimes(1);
  });

  it("positive control: a test event under a test key reconciles", async () => {
    process.env.STRIPE_SECRET_KEY = TEST_KEY;
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(piEvent(false) as never);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(tx.invoice.updateMany).toHaveBeenCalledTimes(1);
  });

  it("a test-mode payment under a live key leaves the invoice unpaid, SKIPPED, 200", async () => {
    process.env.STRIPE_SECRET_KEY = LIVE_KEY;
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(piEvent(false) as never);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expectUnpaid();
    const row = events.get("evt_pi_false");
    expect(row?.status).toBe("SKIPPED");
    expect(row?.errorMessage).toMatch(/livemode/i);
  });

  it("a live-mode payment under a test key leaves the invoice unpaid, SKIPPED, 200", async () => {
    process.env.STRIPE_SECRET_KEY = TEST_KEY;
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(piEvent(true) as never);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expectUnpaid();
    expect(events.get("evt_pi_true")?.status).toBe("SKIPPED");
  });

  it("a replay of a skipped mismatched-mode event stays skipped and unpaid", async () => {
    process.env.STRIPE_SECRET_KEY = LIVE_KEY;
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(piEvent(false) as never);
    await POST(req());
    const replay = await POST(req());
    expect(replay.status).toBe(200);
    expectUnpaid();
    expect(events.get("evt_pi_false")?.status).toBe("SKIPPED");
  });

  it("a test-mode account.updated under a live key changes no workspace", async () => {
    process.env.STRIPE_SECRET_KEY = LIVE_KEY;
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_acct_test",
      type: "account.updated",
      livemode: false,
      account: "acct_A",
      data: { object: { id: "acct_A", charges_enabled: true, details_submitted: true } },
    } as never);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(prisma.workspace.updateMany).not.toHaveBeenCalled();
    expect(events.get("evt_acct_test")?.status).toBe("SKIPPED");
  });
});
