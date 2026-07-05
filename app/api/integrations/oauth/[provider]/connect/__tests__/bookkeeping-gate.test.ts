/**
 * RA-6920 B3 — BOOKKEEPING add-on gate on the integration connect route.
 *
 * Connecting Xero/QuickBooks/MYOB requires an ACTIVE FeatureEntitlement for
 * the BOOKKEEPING sku; a non-bookkeeping provider (e.g. ServiceM8, the
 * SERVICE_CRM add-on's provider) must NOT be gated by this check.
 * requireAddon is mocked so the test runs without a database.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (
      _req: NextRequest,
      _userId: string,
      fn: () => Promise<Response>,
    ) => fn(),
  ),
}));
vi.mock("@/lib/integrations/subscription-guard", () => ({
  checkIntegrationAccess: vi.fn(async () => ({ isAllowed: true })),
  createSubscriptionRequiredResponse: vi.fn(),
}));
vi.mock("@/lib/integrations/dev-mode", () => ({
  isIntegrationDevMode: vi.fn(() => false),
}));
vi.mock("@/lib/integrations", () => ({
  getProviderAuthUrl: vi.fn(() => "https://provider.example/authorize"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    oAuthStateNonce: {
      create: vi.fn(),
    },
  },
}));
vi.mock("@/lib/entitlements", () => ({
  requireAddon: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireAddon } from "@/lib/entitlements";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockRequireAddon = requireAddon as unknown as ReturnType<typeof vi.fn>;
const mockFindFirst = (
  prisma as unknown as { integration: { findFirst: ReturnType<typeof vi.fn> } }
).integration.findFirst;

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/integrations/oauth/xero/connect", {
    method: "POST",
  });
}

function ctx(provider: string) {
  return { params: Promise.resolve({ provider }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_test" } });
  mockFindFirst.mockResolvedValue({
    id: "integration_1",
    userId: "u_test",
    provider: "XERO",
  });
});

describe("RA-6920 B3 — BOOKKEEPING add-on gate on connect", () => {
  it("returns 402 when the workspace is not entitled to connect Xero", async () => {
    mockRequireAddon.mockResolvedValue({
      allowed: false,
      reason: "NOT_ENTITLED",
      sku: "BOOKKEEPING",
      response: NextResponse.json(
        { error: "add-on required", code: "ADDON_REQUIRED" },
        { status: 402 },
      ),
    });

    const res = await POST(makeRequest(), ctx("xero"));

    expect(res.status).toBe(402);
    expect(mockRequireAddon).toHaveBeenCalledWith("u_test", "BOOKKEEPING");
    // Gated before any Integration row is touched.
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns 402 when not entitled to connect QuickBooks", async () => {
    mockRequireAddon.mockResolvedValue({
      allowed: false,
      reason: "NOT_ENTITLED",
      sku: "BOOKKEEPING",
      response: NextResponse.json(
        { error: "add-on required", code: "ADDON_REQUIRED" },
        { status: 402 },
      ),
    });

    const res = await POST(makeRequest(), ctx("quickbooks"));

    expect(res.status).toBe(402);
  });

  it("returns 402 when not entitled to connect MYOB", async () => {
    mockRequireAddon.mockResolvedValue({
      allowed: false,
      reason: "NOT_ENTITLED",
      sku: "BOOKKEEPING",
      response: NextResponse.json(
        { error: "add-on required", code: "ADDON_REQUIRED" },
        { status: 402 },
      ),
    });

    const res = await POST(makeRequest(), ctx("myob"));

    expect(res.status).toBe(402);
  });

  it("allows an entitled workspace to proceed past the gate", async () => {
    mockRequireAddon.mockResolvedValue({
      allowed: true,
      sku: "BOOKKEEPING",
      workspaceId: "ws_1",
    });

    const res = await POST(makeRequest(), ctx("xero"));

    expect(res.status).toBe(200);
    expect(mockRequireAddon).toHaveBeenCalledWith("u_test", "BOOKKEEPING");
    expect(mockFindFirst).toHaveBeenCalled();
  });

  it("does not gate a non-bookkeeping provider (ServiceM8) on the BOOKKEEPING sku", async () => {
    mockFindFirst.mockResolvedValue({
      id: "integration_2",
      userId: "u_test",
      provider: "SERVICEM8",
    });

    const res = await POST(makeRequest(), ctx("servicem8"));

    expect(res.status).toBe(200);
    expect(mockRequireAddon).not.toHaveBeenCalled();
  });
});
