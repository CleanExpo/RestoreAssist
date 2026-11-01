import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { count: vi.fn() },
    moistureReading: { count: vi.fn().mockResolvedValue(0) },
    scopeItem: { count: vi.fn().mockResolvedValue(0) },
  },
}));

import { GET } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const JOBS = [
  "DRAFT",
  "IN_BILLING",
  "COMPLETED",
  "REJECTED",
  "CLOSED",
  "ARCHIVED",
];

beforeEach(() => {
  vi.clearAllMocks();
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "owner-1" },
  });
  (prisma.inspection.count as ReturnType<typeof vi.fn>).mockImplementation(
    async ({ where }) => {
      const notIn: string[] | undefined = where.status?.notIn;
      return notIn ? JOBS.filter((s) => !notIn.includes(s)).length : 0;
    },
  );
});

describe("GET /api/dashboard/stats", () => {
  it("does not count closed or archived jobs as active", async () => {
    const res = await GET(
      new Request("http://localhost/api/dashboard/stats") as never,
    );
    const body = await res.json();
    expect(body.activeInspections.value).toBe(2);
  });
});
