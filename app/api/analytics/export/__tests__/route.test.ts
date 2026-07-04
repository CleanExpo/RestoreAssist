/**
 * Rate-limit key regression guard.
 *
 * The export cap (5 / window) guards expensive ExcelJS/jsPDF generation and
 * must be keyed on the authenticated userId, not the client IP — an IP-keyed
 * cap is a cost-DoS vector under IP rotation (CLAUDE.md rule 8).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (_req: unknown, _userId: string, handler: (b: string) => unknown) =>
      handler(JSON.stringify({ format: "csv", dateRange: { from: "2026-01-01", to: "2026-01-02" } })),
  ),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { report: { findMany: vi.fn() } },
}));

import { POST } from "../route";
import { getServerSession } from "next-auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { prisma } from "@/lib/prisma";

function makeRequest() {
  return new NextRequest("http://localhost/api/analytics/export", {
    method: "POST",
  });
}

describe("POST /api/analytics/export rate-limit key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.report.findMany).mockResolvedValue([] as never);
  });

  it("keys the rate limit on the authenticated userId", async () => {
    await POST(makeRequest());
    expect(applyRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ key: "u1" }),
    );
  });
});
