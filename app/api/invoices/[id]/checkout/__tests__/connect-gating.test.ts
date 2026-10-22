import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * P1-MNY-01 C3 — even with the flag on, the checkout refuses (409, no Stripe
 * call) unless the invoice belongs to a workspace that has the PAYMENTS
 * add-on, a connected Stripe account, and charges enabled on it.
 * Sabotage: remove any one of the checks — its case reaches sessions.create.
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
  workspace: { findUnique: ReturnType<typeof vi.fn> };
  featureEntitlement: { findUnique: ReturnType<typeof vi.fn> };
};

const baseInvoice = {
  id: "inv_1",
  userId: "u_1",
  workspaceId: "ws_A" as string | null,
  status: "SENT",
  amountDue: 11000,
  currency: "AUD",
  invoiceNumber: "INV-0001",
  customerName: "Mock Customer",
  customerEmail: "mock@example.com",
  lineItems: [],
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
  sessionsCreate.mockResolvedValue({ id: "cs_test", url: "https://x.test" });
  p.invoice.findUnique.mockResolvedValue({ ...baseInvoice });
  p.featureEntitlement.findUnique.mockResolvedValue({ id: "fe_1", active: true });
  p.workspace.findUnique.mockResolvedValue({
    id: "ws_A",
    stripeConnectAccountId: "acct_A",
    stripeConnectChargesEnabled: true,
  });
});

afterEach(() => {
  delete process.env.INVOICE_ONLINE_PAYMENT_ENABLED;
});

async function expectRefused() {
  const res = await call();
  expect(res.status).toBe(409);
  const body = await res.json();
  expect(body.error.code).toBe("FEATURE_UNAVAILABLE");
  expect(sessionsCreate).not.toHaveBeenCalled();
  return body;
}

describe("P1-MNY-01 checkout gating", () => {
  it("positive control: a fully enabled firm reaches Stripe", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });

  it("refuses an invoice with no workspace", async () => {
    p.invoice.findUnique.mockResolvedValue({ ...baseInvoice, workspaceId: null });
    await expectRefused();
  });

  it("refuses when the workspace has no PAYMENTS add-on", async () => {
    p.featureEntitlement.findUnique.mockResolvedValue(null);
    await expectRefused();
  });

  it("refuses when the PAYMENTS add-on is inactive", async () => {
    p.featureEntitlement.findUnique.mockResolvedValue({ id: "fe_1", active: false });
    await expectRefused();
  });

  it("refuses when the firm has not connected Stripe", async () => {
    p.workspace.findUnique.mockResolvedValue({
      id: "ws_A",
      stripeConnectAccountId: null,
      stripeConnectChargesEnabled: false,
    });
    await expectRefused();
  });

  it("refuses when charges are not enabled on the connected account", async () => {
    p.workspace.findUnique.mockResolvedValue({
      id: "ws_A",
      stripeConnectAccountId: "acct_A",
      stripeConnectChargesEnabled: false,
    });
    await expectRefused();
  });

  it("refuses when the workspace row is missing", async () => {
    p.workspace.findUnique.mockResolvedValue(null);
    await expectRefused();
  });
});
