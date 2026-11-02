import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", async () => ({
  prisma: (await import("@/lib/auth/__tests__/helpers/fake-tenant-db")).fakePrisma,
}));

import { GET } from "../route";
import { getServerSession } from "next-auth";
import {
  USERS,
  fakePrisma,
  seed,
  sessionFor,
} from "@/lib/auth/__tests__/helpers/fake-tenant-db";

const NOW = new Date(2026, 10, 15, 12);
const NOV = new Date(2026, 10, 5);
const FUTURE = new Date(2026, 11, 20);
const PAST = new Date(2026, 9, 1);

function invoice(
  id: string,
  userId: string,
  status: string,
  cents: number,
  when: Date,
  extra = {},
) {
  return {
    id,
    userId,
    status,
    totalIncGST: cents,
    amountDue: 0,
    invoiceDate: when,
    dueDate: FUTURE,
    paidDate: null,
    workspaceId: null,
    createdAt: when,
    ...extra,
  };
}

const INVOICES = [
  invoice("i1", "admin-a", "PAID", 100000, NOV, { paidDate: NOV }),
  invoice("i2", "manager-a", "SENT", 20000, NOV, { amountDue: 20000, dueDate: PAST }),
  invoice("i3", "tech-a", "PAID", 3000, NOV, { paidDate: NOV }),
  invoice("i4", "tech-a", "DRAFT", 500, NOV),
  invoice("i5", "admin-a", "CANCELLED", 7000, NOV),
  invoice("i6", "admin-a", "VIEWED", 40000, new Date(2026, 9, 12), { amountDue: 40000 }),
  // Each side of a month boundary, in local time
  invoice("i7", "manager-a", "PAID", 11, new Date(2026, 10, 1), { paidDate: PAST }),
  invoice("i8", "manager-a", "PAID", 22, new Date(2026, 9, 31, 23, 59, 59, 999), { paidDate: PAST }),
  // Oldest bucket is partial: twelve months back to the day
  invoice("i9", "admin-a", "PAID", 1111, new Date(2025, 10, 20), { paidDate: PAST }),
  invoice("i10", "admin-a", "PAID", 9999, new Date(2025, 10, 10), { paidDate: PAST }),
  invoice("b1", "admin-b", "PAID", 900000, NOV, { paidDate: NOV }),
];

async function analyticsFor(userId: string) {
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(
    sessionFor(userId),
  );
  const res = await GET(new Request("http://localhost/api/invoices/analytics") as never);
  expect(res.status).toBe(200);
  return res.json();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  seed({ user: USERS, invoice: INVOICES });
});
afterEach(() => vi.useRealTimers());

describe("GET /api/invoices/analytics organisation reach (RA-8146)", () => {
  const ORG_A_STATS = {
    totalRevenue: 100000 + 20000 + 3000 + 40000 + 11 + 22 + 1111 + 9999,
    outstanding: 60000,
    overdue: 20000,
    paidThisMonth: 103000,
    draftTotal: 500,
  };

  it.each(["admin-a", "manager-a"])(
    "gives %s the organisation's money",
    async (userId) => {
      const body = await analyticsFor(userId);
      expect(body.stats).toEqual(ORG_A_STATS);
      expect(body.statusCounts).toEqual({
        PAID: 6,
        SENT: 1,
        DRAFT: 1,
        CANCELLED: 1,
        VIEWED: 1,
      });
    },
  );

  it("gives a technician only their own money", async () => {
    const body = await analyticsFor("tech-a");
    expect(body.stats).toEqual({
      totalRevenue: 3000,
      outstanding: 0,
      overdue: 0,
      paidThisMonth: 3000,
      draftTotal: 500,
    });
    expect(body.statusCounts).toEqual({ PAID: 1, DRAFT: 1 });
  });

  it("gives another organisation only its own money", async () => {
    const body = await analyticsFor("admin-b");
    expect(body.stats.totalRevenue).toBe(900000);
    expect(body.statusCounts).toEqual({ PAID: 1 });
  });

  it("buckets monthly revenue by month under the organisation", async () => {
    const body = await analyticsFor("manager-a");
    expect(body.monthlyRevenue).toEqual([
      { month: "2026-11", revenue: 100000 + 20000 + 3000 + 11, count: 4 },
      { month: "2026-10", revenue: 40000 + 22, count: 2 },
      { month: "2025-11", revenue: 1111, count: 1 },
    ]);
  });

  it("buckets a technician's monthly revenue from their own invoices", async () => {
    const body = await analyticsFor("tech-a");
    expect(body.monthlyRevenue).toEqual([
      { month: "2026-11", revenue: 3000, count: 1 },
    ]);
  });

  it("keeps monthly revenue exact, on one connection, without hand-written SQL", async () => {
    await analyticsFor("admin-a");
    expect(fakePrisma.$queryRaw).not.toHaveBeenCalled();
    expect(fakePrisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = (fakePrisma.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ops).toHaveLength(13);
  });
});
