import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const findUser = vi.fn();
const findReport = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => findUser(...args) },
    report: { findUnique: (...args: unknown[]) => findReport(...args) },
  },
}));

import { getServerSession } from "next-auth";
import { GET } from "../route";

const request = () => new NextRequest("http://localhost/api/reports/r1/version-history");
const context = () => ({ params: Promise.resolve({ id: "r1" }) });

describe("creator-scoped version history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "owner-1" } } as never);
    findUser.mockResolvedValue({ id: "owner-1", email: "owner@example.test" });
  });

  it("retains an invalidated draft snapshot in the creator's internal history", async () => {
    findReport.mockResolvedValue({
      versionHistory: JSON.stringify([{
        action: "Automatic draft invalidated",
        invalidatedDraftSnapshot: { detailedReport: "synthetic unsafe draft" },
      }]),
    });
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect((await response.json()).versionHistory[0].invalidatedDraftSnapshot).toEqual({
      detailedReport: "synthetic unsafe draft",
    });
    expect(findReport).toHaveBeenCalledWith({ where: { id: "r1", userId: "owner-1" } });
  });

  it("refuses a history outside the signed-in creator's scope", async () => {
    findReport.mockResolvedValue(null);
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(findReport).toHaveBeenCalledWith({ where: { id: "r1", userId: "owner-1" } });
  });
});
