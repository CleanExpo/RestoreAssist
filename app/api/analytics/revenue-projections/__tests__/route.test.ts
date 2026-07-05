/**
 * DB-fresh role authorization regression guard.
 *
 * Cross-user revenue projections are gated on Admin/Manager role. The JWT role
 * claim is stale (CLAUDE.md rule 1): a user demoted in the DB keeps the elevated
 * role in their session until the token expires. The gate must therefore read
 * the DB-fresh role (prisma.user.findUnique), not session.user.role — otherwise
 * a demoted admin retains cross-user revenue visibility.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    report: { findMany: vi.fn() },
  },
}));

import { GET } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

function makeRequest(userId: string) {
  return new NextRequest(
    `http://localhost/api/analytics/revenue-projections?userId=${userId}`,
  );
}

describe("GET /api/analytics/revenue-projections role authz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.report.findMany).mockResolvedValue([] as never);
  });

  it("forbids a stale-JWT admin whose DB role has been demoted to USER", async () => {
    // Session still claims ADMIN (stale token) but the DB says USER.
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "demoted", email: "demoted@example.com", role: "ADMIN" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: "org1",
      role: "USER",
    } as never);

    const res = await GET(makeRequest("victim"));

    expect(res.status).toBe(403);
    // The target user should never be looked up once the role gate rejects.
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "demoted" },
      select: { organizationId: true, role: true },
    });
  });

  it("allows an admin whose DB role is still ADMIN", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "admin", email: "admin@example.com", role: "USER" },
    } as never);
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ organizationId: "org1", role: "ADMIN" } as never)
      .mockResolvedValueOnce({
        id: "victim",
        organizationId: "org1",
        role: "USER",
        managedById: null,
      } as never);

    const res = await GET(makeRequest("victim"));

    expect(res.status).toBe(200);
  });
});
