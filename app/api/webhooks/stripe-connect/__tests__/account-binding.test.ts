/**
 * P1-MNY-01 C2 — a Connect payment only pays the invoice of the firm whose
 * connected account received the money.
 *
 * A forged (or misrouted) payment_intent.succeeded from connected account
 * acct_B, whose metadata names firm A's invoice (firm A = acct_A), must leave
 * the invoice unpaid and write ONE audit row. The event is recorded SKIPPED
 * and answered 200, so Stripe does not retry it for 72 hours; a replay of the
 * same event id adds no second audit row. The same event from acct_A
 * reconciles it (positive control).
 * Sabotage: drop the event.account comparison — the acct_B case marks the
 * invoice PAID. Mark the event FAILED, or answer 4xx — the retry-storm cases fail.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const tx = vi.hoisted(() => ({
  invoice: { findUnique: vi.fn(), updateMany: vi.fn() },
  invoicePayment: { findUnique: vi.fn(), create: vi.fn() },
  invoicePaymentAllocation: { findUnique: vi.fn(), create: vi.fn() },
  invoiceAuditLog: { create: vi.fn() },
}));

// In-memory StripeWebhookEvent table so the dedupe rule behaves as on Postgres.
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
      create: vi.fn(async ({ data }: { data: { stripeEventId: string; status: string } }) => {
        if (events.has(data.stripeEventId)) {
          throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
        }
        events.set(data.stripeEventId, {
          status: data.status,
          errorMessage: null,
          createdAt: new Date(),
        });
        return {};
      }),
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
    workspace: { updateMany: vi.fn() },
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

const METADATA = {
  type: "invoice",
  invoiceId: "inv_A",
  invoiceNumber: "INV-A-0001",
  userId: "u_A",
  workspaceId: "ws_A",
};

function event(account: string | undefined) {
  return {
    id: `evt_${account ?? "none"}`,
    type: "payment_intent.succeeded",
    livemode: false,
    account,
    data: {
      object: {
        id: "pi_1",
        status: "succeeded",
        amount_received: 11_000,
        currency: "aud",
        latest_charge: "ch_1",
        created: 1_786_250_000,
        metadata: METADATA,
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

const firmAInvoice = {
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
};

beforeEach(() => {
  vi.clearAllMocks();
  events.clear();
  delete process.env.STRIPE_SECRET_KEY;
  vi.mocked(prisma.$transaction).mockImplementation(
    async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  );
  tx.invoice.findUnique.mockResolvedValue({ ...firmAInvoice });
  tx.invoice.updateMany.mockResolvedValue({ count: 1 });
  tx.invoicePayment.findUnique.mockResolvedValue(null);
  tx.invoicePayment.create.mockResolvedValue({ id: "pay_1" });
  tx.invoicePaymentAllocation.create.mockResolvedValue({ id: "alloc_1" });
  tx.invoiceAuditLog.create.mockResolvedValue({ id: "audit_1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function expectUnpaid() {
  expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  expect(tx.invoicePayment.create).not.toHaveBeenCalled();
  expect(tx.invoicePaymentAllocation.create).not.toHaveBeenCalled();
}

describe("Connect payment_intent.succeeded account binding", () => {
  it("positive control: firm A's own account pays firm A's invoice", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event("acct_A") as never);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(tx.invoice.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.invoicePayment.create).toHaveBeenCalledTimes(1);
    expect(events.get("evt_acct_A")?.status).toBe("COMPLETED");
  });

  it("acct_B paying firm A's invoice: unpaid, one audit row, SKIPPED, 200", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event("acct_B") as never);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expectUnpaid();
    expect(tx.invoiceAuditLog.create).toHaveBeenCalledTimes(1);
    const audit = tx.invoiceAuditLog.create.mock.calls[0][0].data;
    expect(audit.invoiceId).toBe("inv_A");
    expect(audit.action).toBe("stripe_connect_account_mismatch");
    expect(audit.metadata).toMatchObject({
      eventAccount: "acct_B",
      expectedAccount: "acct_A",
      paymentIntentId: "pi_1",
    });
    const row = events.get("evt_acct_B");
    expect(row?.status).toBe("SKIPPED");
    expect(row?.errorMessage).toMatch(/acct_B/);
  });

  it("a replay of the same mismatched event adds no second audit row and no retry", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event("acct_B") as never);
    await POST(req());
    const replay = await POST(req());
    const third = await POST(req());
    expect(replay.status).toBe(200);
    expect(third.status).toBe(200);
    expect(tx.invoiceAuditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expectUnpaid();
    expect(events.get("evt_acct_B")?.status).toBe("SKIPPED");
  });

  it("an invoice whose workspace has no connected account is never paid by a Connect event", async () => {
    tx.invoice.findUnique.mockResolvedValue({
      ...firmAInvoice,
      workspace: { stripeConnectAccountId: null },
    });
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event("acct_A") as never);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expectUnpaid();
    expect(tx.invoiceAuditLog.create).toHaveBeenCalledTimes(1);
    expect(events.get("evt_acct_A")?.status).toBe("SKIPPED");
  });

  it("an invoice with no workspace is never paid by a Connect event", async () => {
    tx.invoice.findUnique.mockResolvedValue({
      ...firmAInvoice,
      workspaceId: null,
      workspace: null,
    });
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event("acct_A") as never);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expectUnpaid();
    expect(events.get("evt_acct_A")?.status).toBe("SKIPPED");
  });

  it("a PaymentIntent event with no connected account is refused", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event(undefined) as never);
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
