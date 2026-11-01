import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { count: vi.fn() },
    invoice: { aggregate: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ avg_days: 0 }]),
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
const INVOICES = [
  { status: "DRAFT", totalIncGST: 100 },
  { status: "CANCELLED", totalIncGST: 200 },
  { status: "SENT", totalIncGST: 400 },
  { status: "PAID", totalIncGST: 800 },
];

// Applies the route's status filter to seeded rows, so the test checks what the
// owner would see and not the shape of the query.
function matches(
  status: string,
  filter?: string | { not?: string; notIn?: readonly string[] },
) {
  if (!filter) return true;
  if (typeof filter === "string") return status === filter;
  if (filter.not && status === filter.not) return false;
  if (filter.notIn?.includes(status)) return false;
  return true;
}

beforeEach(() => {
  vi.clearAllMocks();
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "owner-1" },
  });
  (prisma.inspection.count as ReturnType<typeof vi.fn>).mockImplementation(
    async ({ where }) =>
      JOBS.filter((status) => matches(status, where.status)).length,
  );
  (prisma.invoice.aggregate as ReturnType<typeof vi.fn>).mockImplementation(
    async ({ where }) => ({
      _sum: {
        totalIncGST: INVOICES.filter((i) =>
          matches(i.status, where.status),
        ).reduce((sum, i) => sum + i.totalIncGST, 0),
      },
    }),
  );
});

const load = async () => {
  const res = await GET(
    new Request("http://localhost/api/analytics/dashboard-stats") as never,
  );
  const body = await res.json();
  return body.data ?? body;
};

describe("GET /api/analytics/dashboard-stats", () => {
  it("does not count closed, archived, completed or rejected jobs as active", async () => {
    expect((await load()).activeJobs).toBe(2);
  });

  it("does not call draft or cancelled invoices revenue", async () => {
    expect((await load()).revenueMtdAud).toBe(12);
  });

  it("stays scoped to the signed-in user", async () => {
    await load();
    const calls = (prisma.inspection.count as ReturnType<typeof vi.fn>).mock
      .calls;
    expect(calls[0][0].where.userId).toBe("owner-1");
  });
});
