import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * P1-MNY-01 C1 — with the flag on and the firm fully enabled, the invoice
 * checkout is a DIRECT CHARGE on the firm's own connected account: the
 * Checkout Session is created with { stripeAccount: <firm account> } and no
 * application fee. A session created without stripeAccount would put the
 * firm's customer's money into RestoreAssist's account (the P1-MNY-00 defect).
 * Sabotage: drop the second argument to sessions.create, or add an
 * application_fee_amount — these tests fail.
 */

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const { sessionsCreate } = vi.hoisted(() => ({ sessionsCreate: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  stripe: { checkout: { sessions: { create: sessionsCreate } } },
}));

vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (_req: unknown, _userId: string, fn: () => unknown) => fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findUnique: vi.fn() },
    invoiceAuditLog: { create: vi.fn() },
    workspace: { findUnique: vi.fn() },
    featureEntitlement: { findUnique: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  invoice: { findUnique: ReturnType<typeof vi.fn> };
  invoiceAuditLog: { create: ReturnType<typeof vi.fn> };
  workspace: { findUnique: ReturnType<typeof vi.fn> };
  featureEntitlement: { findUnique: ReturnType<typeof vi.fn> };
};

function call() {
  return POST(
    new NextRequest("http://localhost/api/invoices/inv_1/checkout", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "inv_1" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INVOICE_ONLINE_PAYMENT_ENABLED = "true";
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  sessionsCreate.mockResolvedValue({
    id: "cs_test_1",
    url: "https://checkout.stripe.test/cs_test_1",
  });
  p.invoice.findUnique.mockResolvedValue({
    id: "inv_1",
    userId: "u_1",
    workspaceId: "ws_A",
    status: "SENT",
    amountDue: 11000,
    currency: "AUD",
    invoiceNumber: "INV-0001",
    customerName: "Mock Customer",
    customerEmail: "mock@example.com",
    lineItems: [],
  });
  p.featureEntitlement.findUnique.mockResolvedValue({ id: "fe_1", active: true });
  p.workspace.findUnique.mockResolvedValue({
    id: "ws_A",
    stripeConnectAccountId: "acct_A",
    stripeConnectChargesEnabled: true,
  });
  p.invoiceAuditLog.create.mockResolvedValue({ id: "al_1" });
});

afterEach(() => {
  delete process.env.INVOICE_ONLINE_PAYMENT_ENABLED;
});

describe("P1-MNY-01 invoice checkout is a direct charge on the firm's account", () => {
  it("creates the session on the firm's connected account", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    const [, options] = sessionsCreate.mock.calls[0];
    expect(options).toMatchObject({ stripeAccount: "acct_A" });
  });

  it("takes no application fee", async () => {
    await call();
    const [params] = sessionsCreate.mock.calls[0];
    expect(params.payment_intent_data?.application_fee_amount).toBeUndefined();
    expect(params.application_fee_amount).toBeUndefined();
    expect(JSON.stringify(params)).not.toMatch(/application_fee/);
  });

  it("charges exactly the amount due in the invoice currency and tags the workspace", async () => {
    await call();
    const [params] = sessionsCreate.mock.calls[0];
    expect(params.mode).toBe("payment");
    expect(params.line_items[0].price_data.unit_amount).toBe(11000);
    expect(params.line_items[0].price_data.currency).toBe("aud");
    expect(params.payment_intent_data.metadata).toMatchObject({
      type: "invoice",
      invoiceId: "inv_1",
      invoiceNumber: "INV-0001",
      userId: "u_1",
      workspaceId: "ws_A",
    });
  });

  it("never calls sessions.create without stripeAccount", async () => {
    // Every call across several checkouts must carry the connected account.
    await call();
    await call();
    expect(sessionsCreate.mock.calls.length).toBeGreaterThan(0);
    for (const [, options] of sessionsCreate.mock.calls) {
      expect(typeof options?.stripeAccount).toBe("string");
      expect(options.stripeAccount).toMatch(/^acct_/);
    }
  });

  it("uses the account of the invoice's own workspace", async () => {
    await call();
    expect(p.workspace.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ws_A" } }),
    );
  });
});
