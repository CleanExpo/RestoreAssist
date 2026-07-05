/**
 * RA-6920 B1 — SERVICE_CRM add-on gate on the Ascora sync-trigger surface.
 *
 * A session-authenticated (user-triggered) POST /api/ascora/sync is gated by
 * requireAddon(SERVICE_CRM). The CRON_SECRET (system-level) path is
 * intentionally left ungated — it is not a user action — so it is not
 * exercised here. requireAddon is mocked so the test runs without a database.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ascoraIntegration: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/entitlements", () => ({ requireAddon: vi.fn() }));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireAddon } from "@/lib/entitlements";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockRequireAddon = requireAddon as unknown as ReturnType<typeof vi.fn>;
const mockFindUnique = (
  prisma as unknown as { ascoraIntegration: { findUnique: ReturnType<typeof vi.fn> } }
).ascoraIntegration.findUnique;

function makePost(): NextRequest {
  return new NextRequest("http://localhost/api/ascora/sync", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_test" } });
  delete process.env.ASCORA_API_KEY;
});

describe("RA-6920 B1 — SERVICE_CRM add-on gate on /api/ascora/sync", () => {
  it("returns 402 for a user-triggered sync when not entitled, without touching the DB", async () => {
    mockRequireAddon.mockResolvedValue({
      allowed: false,
      reason: "NOT_ENTITLED",
      sku: "SERVICE_CRM",
      response: NextResponse.json(
        { error: "add-on required", code: "ADDON_REQUIRED" },
        { status: 402 },
      ),
    });

    const res = await POST(makePost());

    expect(res.status).toBe(402);
    expect(mockRequireAddon).toHaveBeenCalledWith("u_test", "SERVICE_CRM");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("passes the gate for an entitled (or grandfathered) workspace and proceeds past it", async () => {
    mockRequireAddon.mockResolvedValue({
      allowed: true,
      sku: "SERVICE_CRM",
      workspaceId: "ws_1",
    });
    // No integration row + no ASCORA_API_KEY env → the route's own
    // "not connected" 404 proves the request reached past the 402 gate.
    mockFindUnique.mockResolvedValue(null);

    const res = await POST(makePost());

    expect(mockRequireAddon).toHaveBeenCalledWith("u_test", "SERVICE_CRM");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).not.toBe("ADDON_REQUIRED");
  });
});
