import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * P1-MNY-01 C3 — the invoice page is a client component, so it cannot read
 * the server flag or the firm's Stripe state itself. GET /api/invoices/[id]
 * carries `onlinePayment: { available, reason }` and the page shows Pay Online
 * only when `available` is true. A missing precondition must come back as
 * unavailable (button hidden), and never leak the connected account id.
 */

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/audit-log", () => ({ recordMutationAudit: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findUnique: vi.fn() },
    workspace: { findUnique: vi.fn() },
    featureEntitlement: { findUnique: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  invoice: { findUnique: ReturnType<typeof vi.fn> };
  workspace: { findUnique: ReturnType<typeof vi.fn> };
  featureEntitlement: { findUnique: ReturnType<typeof vi.fn> };
};

async function get() {
  const res = await GET(new NextRequest("http://localhost/api/invoices/inv_1"), {
    params: Promise.resolve({ id: "inv_1" }),
  });
  expect(res.status).toBe(200);
  return (await res.json()).invoice;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INVOICE_ONLINE_PAYMENT_ENABLED = "true";
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.invoice.findUnique.mockResolvedValue({
    id: "inv_1",
    userId: "u_1",
    workspaceId: "ws_A",
    status: "SENT",
  });
  p.featureEntitlement.findUnique.mockResolvedValue({ id: "fe", active: true });
  p.workspace.findUnique.mockResolvedValue({
    id: "ws_A",
    stripeConnectAccountId: "acct_A",
    stripeConnectChargesEnabled: true,
  });
});

afterEach(() => {
  delete process.env.INVOICE_ONLINE_PAYMENT_ENABLED;
});

describe("GET /api/invoices/[id] onlinePayment", () => {
  it("reports available for a fully enabled firm, without the account id", async () => {
    const invoice = await get();
    expect(invoice.onlinePayment).toEqual({ available: true });
    expect(JSON.stringify(invoice)).not.toContain("acct_A");
  });

  it("reports unavailable with the flag off", async () => {
    delete process.env.INVOICE_ONLINE_PAYMENT_ENABLED;
    const invoice = await get();
    expect(invoice.onlinePayment).toEqual({ available: false, reason: "FLAG_OFF" });
  });

  it("reports unavailable with no add-on", async () => {
    p.featureEntitlement.findUnique.mockResolvedValue(null);
    expect((await get()).onlinePayment).toEqual({
      available: false,
      reason: "NO_ADDON",
    });
  });

  it("reports unavailable when charges are disabled", async () => {
    p.workspace.findUnique.mockResolvedValue({
      id: "ws_A",
      stripeConnectAccountId: "acct_A",
      stripeConnectChargesEnabled: false,
    });
    expect((await get()).onlinePayment).toEqual({
      available: false,
      reason: "CHARGES_DISABLED",
    });
  });

  it("reports unavailable for an invoice with no workspace", async () => {
    p.invoice.findUnique.mockResolvedValue({
      id: "inv_1",
      userId: "u_1",
      workspaceId: null,
      status: "SENT",
    });
    expect((await get()).onlinePayment).toEqual({
      available: false,
      reason: "NO_WORKSPACE",
    });
  });
});
