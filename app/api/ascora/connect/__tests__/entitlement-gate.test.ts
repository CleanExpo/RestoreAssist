/**
 * RA-6920 B1 — SERVICE_CRM add-on gate on the Ascora connect surface.
 *
 * POST /api/ascora/connect is gated by requireAddon(SERVICE_CRM): a
 * workspace with an ACTIVE FeatureEntitlement (real or grandfathered — see
 * scripts/backfill-grandfather-service-crm-addon.ts) is allowed through;
 * everyone else gets a fail-closed 402. requireAddon is mocked here so the
 * test runs without a database.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/credential-vault", () => ({ encrypt: vi.fn((v: string) => `enc:${v}`) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ascoraIntegration: { upsert: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/entitlements", () => ({ requireAddon: vi.fn() }));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireAddon } from "@/lib/entitlements";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockRequireAddon = requireAddon as unknown as ReturnType<typeof vi.fn>;
const mockUpsert = (
  prisma as unknown as { ascoraIntegration: { upsert: ReturnType<typeof vi.fn> } }
).ascoraIntegration.upsert;

function makePost(body: object): NextRequest {
  return new NextRequest("http://localhost/api/ascora/connect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_test" } });
  vi.spyOn(global, "fetch").mockImplementation(async () => {
    throw new Error("Ascora API should not be reached in these tests");
  });
});

describe("RA-6920 B1 — SERVICE_CRM add-on gate on /api/ascora/connect", () => {
  it("returns 402 when the workspace is not entitled to SERVICE_CRM", async () => {
    mockRequireAddon.mockResolvedValue({
      allowed: false,
      reason: "NOT_ENTITLED",
      sku: "SERVICE_CRM",
      response: NextResponse.json(
        { error: "add-on required", code: "ADDON_REQUIRED" },
        { status: 402 },
      ),
    });

    const res = await POST(makePost({ apiKey: "k" }));

    expect(res.status).toBe(402);
    expect(mockRequireAddon).toHaveBeenCalledWith("u_test", "SERVICE_CRM");
    // Fail fast — never reaches the Ascora API call or the upsert.
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 401 before checking the add-on when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await POST(makePost({ apiKey: "k" }));

    expect(res.status).toBe(401);
    expect(mockRequireAddon).not.toHaveBeenCalled();
  });

  it("passes the gate for an entitled (or grandfathered) workspace and proceeds", async () => {
    mockRequireAddon.mockResolvedValue({
      allowed: true,
      sku: "SERVICE_CRM",
      workspaceId: "ws_1",
    });
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, status: 200 } as Response);
    mockUpsert.mockResolvedValue({ id: "integration_1" });

    const res = await POST(
      makePost({ apiKey: "real-key", baseUrl: "https://api.ascora.com.au" }),
    );

    expect(res.status).toBe(200);
    expect(mockRequireAddon).toHaveBeenCalledWith("u_test", "SERVICE_CRM");
    expect(mockUpsert).toHaveBeenCalled();
  });
});
