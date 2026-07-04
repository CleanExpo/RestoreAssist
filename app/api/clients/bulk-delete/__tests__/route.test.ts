/**
 * Rate-limit key regression guard.
 *
 * The bulk-delete cap (10 / 15min) must be keyed on session.user.id, not the
 * client IP — IP keys are bypassable in serverless cold starts (CLAUDE.md rule 8).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    client: { findMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { DELETE } from "../route";
import { getServerSession } from "next-auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { prisma } from "@/lib/prisma";

function makeRequest(ids: string[]) {
  return new NextRequest("http://localhost/api/clients/bulk-delete", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}

describe("DELETE /api/clients/bulk-delete rate-limit key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.client.findMany).mockResolvedValue([{ id: "c1" }] as never);
    vi.mocked(prisma.client.deleteMany).mockResolvedValue({ count: 1 } as never);
  });

  it("keys the rate limit on session.user.id", async () => {
    const res = await DELETE(makeRequest(["c1"]));
    expect(res.status).toBe(200);
    expect(applyRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ key: "u1" }),
    );
  });
});
