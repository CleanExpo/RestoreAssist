/**
 * RA-6920 B3 — BOOKKEEPING add-on gate on the integration sync-trigger route.
 *
 * Triggering a sync for Xero/QuickBooks/MYOB requires an ACTIVE
 * FeatureEntitlement for the BOOKKEEPING sku; a non-bookkeeping provider must
 * NOT be gated by this check. requireAddon is mocked so the test runs without
 * a database.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/integrations/subscription-guard", () => ({
  checkIntegrationAccess: vi.fn(async () => ({ isAllowed: true })),
  createSubscriptionRequiredResponse: vi.fn(),
}));
vi.mock("@/lib/integrations", () => ({
  createClientForIntegration: vi.fn(async () => ({
    syncClients: vi.fn(async () => 3),
    syncJobs: vi.fn(async () => 5),
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findFirst: vi.fn(),
      update: vi.fn(),
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
  return new NextRequest("http://localhost/api/integrations/oauth/xero/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
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
    status: "CONNECTED",
  });
});

describe("RA-6920 B3 — BOOKKEEPING add-on gate on sync", () => {
  it("returns 402 when the workspace is not entitled to sync Xero", async () => {
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
    // Gated before the integration lookup / sync ever runs.
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns 402 when not entitled to sync QuickBooks", async () => {
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

  it("returns 402 when not entitled to sync MYOB", async () => {
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

  it("allows an entitled workspace to sync Xero", async () => {
    mockRequireAddon.mockResolvedValue({
      allowed: true,
      sku: "BOOKKEEPING",
      workspaceId: "ws_1",
    });

    const res = await POST(makeRequest(), ctx("xero"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockRequireAddon).toHaveBeenCalledWith("u_test", "BOOKKEEPING");
  });

  it("does not gate a non-bookkeeping provider (ServiceM8) on the BOOKKEEPING sku", async () => {
    mockFindFirst.mockResolvedValue({
      id: "integration_2",
      userId: "u_test",
      provider: "SERVICEM8",
      status: "CONNECTED",
    });

    const res = await POST(makeRequest(), ctx("servicem8"));

    expect(res.status).toBe(200);
    expect(mockRequireAddon).not.toHaveBeenCalled();
  });
});
