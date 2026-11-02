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
const DAY = 24 * 60 * 60 * 1000;

function job(id: string, userId: string, status: string, extra = {}) {
  return {
    id,
    userId,
    status,
    workspaceId: null,
    createdAt: new Date(2026, 0, 1),
    completedAt: null,
    processedAt: null,
    ...extra,
  };
}
function invoice(id: string, userId: string, status: string, cents: number, when: Date) {
  return { id, userId, status, totalIncGST: cents, invoiceDate: when, workspaceId: null, createdAt: when };
}

const RECENT = new Date(2026, 10, 1);
const JOBS = [
  // Created in the 30 days: 2 of 4 finished, so 50%.
  job("a-closed", "manager-a", "CLOSED", {
    createdAt: RECENT,
    completedAt: new Date(RECENT.getTime() + 4 * DAY),
    processedAt: new Date(RECENT.getTime() + DAY),
  }),
  job("a-legacy", "tech-a", "COMPLETED", {
    createdAt: RECENT,
    processedAt: new Date(RECENT.getTime() + 2 * DAY),
  }),
  job("a-draft", "admin-a", "DRAFT", { createdAt: RECENT }),
  job("a-archived-unfinished", "admin-a", "ARCHIVED", { createdAt: RECENT }),
  // Outside the window on both measures
  job("a-closed-old", "admin-a", "CLOSED", {
    completedAt: new Date(2026, 9, 1),
  }),
  // Other business: ten days, and all finished
  job("b-closed", "admin-b", "CLOSED", {
    createdAt: RECENT,
    completedAt: new Date(RECENT.getTime() + 10 * DAY),
  }),
  job("b-draft-old", "admin-b", "DRAFT"),
];
const THIS_MONTH = new Date(2026, 10, 5);
const INVOICES = [
  invoice("i1", "admin-a", "PAID", 100000, THIS_MONTH),
  invoice("i2", "manager-a", "PAID", 20000, THIS_MONTH),
  invoice("i3", "tech-a", "PAID", 3000, THIS_MONTH),
  invoice("i4", "tech-a", "DRAFT", 500, THIS_MONTH),
  invoice("i5", "admin-a", "CANCELLED", 7000, THIS_MONTH),
  invoice("i6", "admin-a", "PAID", 40000, new Date(2026, 9, 31)),
  invoice("i7", "admin-b", "PAID", 900000, THIS_MONTH),
];

async function statsFor(userId: string) {
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(
    sessionFor(userId),
  );
  const res = await GET(new Request("http://localhost/api/analytics/dashboard-stats") as never);
  expect(res.status).toBe(200);
  return res.json();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  seed({ user: USERS, inspection: JOBS, invoice: INVOICES });
});
afterEach(() => vi.useRealTimers());

describe("GET /api/analytics/dashboard-stats organisation reach (RA-8146)", () => {
  it.each([
    ["admin-a", 1230],
    ["manager-a", 1230],
    ["tech-a", 30],
    ["admin-b", 9000],
  ])("shows %s revenue of $%d this month", async (userId, dollars) => {
    expect((await statsFor(userId)).revenueMtdAud).toBe(dollars);
  });

  it.each(["admin-a", "manager-a", "tech-a"])(
    "gives %s the organisation's job figures",
    async (userId) => {
      const body = await statsFor(userId);
      expect(body.activeJobs).toBe(1);
      expect(body.avgDryingDays).toBeCloseTo(3, 5);
      expect(body.completionRatePct).toBe(50);
      expect(body.avgDryingTruncated).toBe(false);
    },
  );

  it("keeps the other organisation's jobs apart", async () => {
    const body = await statsFor("admin-b");
    expect(body.activeJobs).toBe(1);
    expect(body.avgDryingDays).toBeCloseTo(10, 5);
    expect(body.completionRatePct).toBe(100);
  });

  it("never asks hand-written SQL for a figure", async () => {
    await statsFor("admin-a");
    expect(fakePrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("says so when the drying sample reaches the cap", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const full = Array.from({ length: 5001 }, (_, i) =>
      job(`bulk-${i}`, "admin-a", "CLOSED", {
        createdAt: RECENT,
        completedAt: new Date(RECENT.getTime() + DAY),
      }),
    );
    seed({ user: USERS, inspection: full, invoice: [] });
    const body = await statsFor("admin-a");
    expect(body.avgDryingTruncated).toBe(true);
    expect(body.avgDryingDays).toBeCloseTo(1, 5);
    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        route: expect.any(String),
        organisationId: "org-a",
        cap: 5000,
      }),
    );
    warn.mockRestore();
  });

  it("does not claim truncation one row under the cap", async () => {
    const under = Array.from({ length: 4999 }, (_, i) =>
      job(`bulk-${i}`, "admin-a", "CLOSED", {
        createdAt: RECENT,
        completedAt: new Date(RECENT.getTime() + DAY),
      }),
    );
    seed({ user: USERS, inspection: under, invoice: [] });
    expect((await statsFor("admin-a")).avgDryingTruncated).toBe(false);
  });

  it("returns zeros for an empty organisation, without dividing by zero", async () => {
    seed({ user: USERS, inspection: [], invoice: [] });
    expect(await statsFor("admin-a")).toEqual({
      activeJobs: 0,
      avgDryingDays: 0,
      avgDryingTruncated: false,
      revenueMtdAud: 0,
      completionRatePct: 0,
    });
  });
});
