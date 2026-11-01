import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { inspection: { findMany: vi.fn().mockResolvedValue([]) } },
}));

import { GET } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

beforeEach(() => {
  vi.clearAllMocks();
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "owner-1" },
  });
});

describe("GET /api/inspections/export?status=active", () => {
  it("exports the same active jobs the list shows, instead of passing 'active' to the database", async () => {
    await GET(
      new Request(
        "http://localhost/api/inspections/export?status=active",
      ) as never,
    );
    const { where } = (prisma.inspection.findMany as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(where.status).toEqual({
      notIn: ["COMPLETED", "REJECTED", "CLOSED", "ARCHIVED"],
    });
    expect(where.userId).toBe("owner-1");
  });
});
