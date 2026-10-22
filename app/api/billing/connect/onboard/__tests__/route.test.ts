import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * P1-MNY-01 C4 — Stripe Connect onboarding for a firm.
 *
 * - Creates a STANDARD account: full Stripe Dashboard, the firm pays Stripe's
 *   fees, Stripe carries negative-balance losses, Australian, tagged with the
 *   workspace, under an idempotency key bound to the workspace.
 * - A retry (the workspace already holds an account) creates NO second
 *   account and only issues a fresh Stripe-hosted onboarding link.
 * - Refused for staff (billing belongs to the owner), without the PAYMENTS
 *   add-on, and with the flag off — none of those reach Stripe.
 * Stripe is mocked; no network call is made.
 */

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/app-url", () => ({ getAppUrl: () => "https://app.example.test" }));

const { getOrganizationOwner } = vi.hoisted(() => ({
  getOrganizationOwner: vi.fn(),
}));
vi.mock("@/lib/organization-credits", () => ({
  getOrganizationOwner,
  getResourceTenantOwner: vi.fn(),
}));

const { accountsCreate, accountLinksCreate } = vi.hoisted(() => ({
  accountsCreate: vi.fn(),
  accountLinksCreate: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    accounts: { create: accountsCreate },
    accountLinks: { create: accountLinksCreate },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    featureEntitlement: { findUnique: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  workspace: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  featureEntitlement: { findUnique: ReturnType<typeof vi.fn> };
};

// A tiny in-memory workspace row so a retry sees what the first call stored.
let stored: { stripeConnectAccountId: string | null };

function call() {
  return POST(
    new NextRequest("http://localhost/api/billing/connect/onboard", {
      method: "POST",
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INVOICE_ONLINE_PAYMENT_ENABLED = "true";
  stored = { stripeConnectAccountId: null };
  mockSession.mockResolvedValue({ user: { id: "u_owner", email: "o@x.test" } });
  getOrganizationOwner.mockResolvedValue("u_owner");
  p.workspace.findFirst.mockResolvedValue({ id: "ws_A", name: "Firm A" });
  p.featureEntitlement.findUnique.mockResolvedValue({ id: "fe", active: true });
  p.workspace.findUnique.mockImplementation(async () => ({
    id: "ws_A",
    stripeConnectAccountId: stored.stripeConnectAccountId,
  }));
  p.workspace.updateMany.mockImplementation(async ({ where, data }) => {
    if (where.stripeConnectAccountId === null && stored.stripeConnectAccountId !== null) {
      return { count: 0 };
    }
    if (data.stripeConnectAccountId) stored.stripeConnectAccountId = data.stripeConnectAccountId;
    return { count: 1 };
  });
  accountsCreate.mockResolvedValue({
    id: "acct_A",
    charges_enabled: false,
    details_submitted: false,
  });
  accountLinksCreate.mockResolvedValue({
    url: "https://connect.stripe.test/setup/s/abc",
  });
});

afterEach(() => {
  delete process.env.INVOICE_ONLINE_PAYMENT_ENABLED;
});

describe("POST /api/billing/connect/onboard", () => {
  it("creates a Standard account and returns a Stripe-hosted onboarding link", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://connect.stripe.test/setup/s/abc" });

    expect(accountsCreate).toHaveBeenCalledTimes(1);
    const [params, options] = accountsCreate.mock.calls[0];
    expect(params.controller).toEqual({
      stripe_dashboard: { type: "full" },
      fees: { payer: "account" },
      losses: { payments: "stripe" },
    });
    expect(params.country).toBe("AU");
    expect(params.type).toBeUndefined();
    expect(params.controller.requirement_collection).toBeUndefined();
    expect(params.metadata).toMatchObject({ workspaceId: "ws_A" });
    expect(options).toEqual({ idempotencyKey: "connect-acct-ws_A" });

    expect(stored.stripeConnectAccountId).toBe("acct_A");
    const [linkParams] = accountLinksCreate.mock.calls[0];
    expect(linkParams).toMatchObject({ account: "acct_A", type: "account_onboarding" });
    expect(linkParams.return_url).toMatch(/^https:\/\/app\.example\.test\//);
    expect(linkParams.refresh_url).toMatch(/^https:\/\/app\.example\.test\//);
  });

  it("a retry reuses the stored account and creates no second one", async () => {
    await call();
    const res = await call();
    expect(res.status).toBe(200);
    expect(accountsCreate).toHaveBeenCalledTimes(1);
    expect(accountLinksCreate).toHaveBeenCalledTimes(2);
    expect(accountLinksCreate.mock.calls[1][0].account).toBe("acct_A");
  });

  it("keeps the account another request stored first", async () => {
    // A concurrent request stored acct_A between our read and our write.
    p.workspace.findUnique
      .mockResolvedValueOnce({ id: "ws_A", stripeConnectAccountId: null })
      .mockResolvedValue({ id: "ws_A", stripeConnectAccountId: "acct_A" });
    stored.stripeConnectAccountId = "acct_A";
    accountsCreate.mockResolvedValue({ id: "acct_A", charges_enabled: false, details_submitted: false });
    const res = await call();
    expect(res.status).toBe(200);
    expect(accountLinksCreate.mock.calls[0][0].account).toBe("acct_A");
  });

  it("refuses staff: billing belongs to the owner", async () => {
    mockSession.mockResolvedValue({ user: { id: "u_staff" } });
    getOrganizationOwner.mockResolvedValue("u_owner");
    const res = await call();
    expect(res.status).toBe(403);
    expect(accountsCreate).not.toHaveBeenCalled();
    expect(accountLinksCreate).not.toHaveBeenCalled();
  });

  it("refuses without the PAYMENTS add-on", async () => {
    p.featureEntitlement.findUnique.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(402);
    expect(accountsCreate).not.toHaveBeenCalled();
  });

  it("refuses with the flag off", async () => {
    delete process.env.INVOICE_ONLINE_PAYMENT_ENABLED;
    const res = await call();
    expect(res.status).toBe(409);
    expect(accountsCreate).not.toHaveBeenCalled();
    expect(accountLinksCreate).not.toHaveBeenCalled();
  });

  it("requires sign-in", async () => {
    mockSession.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(accountsCreate).not.toHaveBeenCalled();
  });
});
