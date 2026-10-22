import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * P1-MNY-01 C3 — the single server-side answer to "can this invoice be paid
 * by card?". The invoice page shows Pay Online only when this says
 * available, so each missing precondition must read as unavailable with its
 * own reason, and any lookup error must read as unavailable (fail closed).
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
    featureEntitlement: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getInvoiceOnlinePayment } from "../online-payment-availability";

const p = prisma as unknown as {
  workspace: { findUnique: ReturnType<typeof vi.fn> };
  featureEntitlement: { findUnique: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INVOICE_ONLINE_PAYMENT_ENABLED = "true";
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

describe("getInvoiceOnlinePayment", () => {
  it("is available for a fully enabled firm and names its account", async () => {
    await expect(getInvoiceOnlinePayment({ workspaceId: "ws_A" })).resolves.toEqual({
      available: true,
      workspaceId: "ws_A",
      stripeAccountId: "acct_A",
    });
  });

  it("is unavailable with the flag off, before any lookup", async () => {
    delete process.env.INVOICE_ONLINE_PAYMENT_ENABLED;
    const r = await getInvoiceOnlinePayment({ workspaceId: "ws_A" });
    expect(r).toEqual({ available: false, reason: "FLAG_OFF" });
    expect(p.workspace.findUnique).not.toHaveBeenCalled();
    expect(p.featureEntitlement.findUnique).not.toHaveBeenCalled();
  });

  it("is unavailable with no workspace", async () => {
    const r = await getInvoiceOnlinePayment({ workspaceId: null });
    expect(r).toEqual({ available: false, reason: "NO_WORKSPACE" });
  });

  it("is unavailable without the PAYMENTS add-on", async () => {
    p.featureEntitlement.findUnique.mockResolvedValue(null);
    const r = await getInvoiceOnlinePayment({ workspaceId: "ws_A" });
    expect(r).toEqual({ available: false, reason: "NO_ADDON" });
  });

  it("is unavailable when Stripe is not connected", async () => {
    p.workspace.findUnique.mockResolvedValue({
      id: "ws_A",
      stripeConnectAccountId: null,
      stripeConnectChargesEnabled: false,
    });
    const r = await getInvoiceOnlinePayment({ workspaceId: "ws_A" });
    expect(r).toEqual({ available: false, reason: "NOT_CONNECTED" });
  });

  it("is unavailable when charges are not enabled", async () => {
    p.workspace.findUnique.mockResolvedValue({
      id: "ws_A",
      stripeConnectAccountId: "acct_A",
      stripeConnectChargesEnabled: false,
    });
    const r = await getInvoiceOnlinePayment({ workspaceId: "ws_A" });
    expect(r).toEqual({ available: false, reason: "CHARGES_DISABLED" });
  });

  it("fails closed when a lookup throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    p.workspace.findUnique.mockRejectedValue(new Error("db down"));
    const r = await getInvoiceOnlinePayment({ workspaceId: "ws_A" });
    expect(r).toEqual({ available: false, reason: "ERROR" });
  });
});
