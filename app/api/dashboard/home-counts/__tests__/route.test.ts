import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", async () => ({
  prisma: (await import("@/lib/auth/__tests__/helpers/fake-tenant-db")).fakePrisma,
}));

import { getServerSession } from "next-auth";
import {
  USERS,
  calls,
  failing,
  seed,
  sessionFor,
} from "@/lib/auth/__tests__/helpers/fake-tenant-db";

const many = (n: number, make: (i: number) => object) =>
  Array.from({ length: n }, (_, i) => make(i));
const owned = (id: string, userId: string, extra: object) => ({
  id,
  userId,
  workspaceId: null,
  createdAt: new Date(2026, 0, 1),
  ...extra,
});

async function counts(userId: string) {
  // Imported here so the rest of the file can show its failure before the route exists.
  const { GET } = await import("../route");
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(
    sessionFor(userId),
  );
  return GET(new Request("http://localhost/api/dashboard/home-counts") as never);
}

beforeEach(() => {
  const OUTSTANDING = ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"];
  seed({
    user: USERS,
    inspection: [
      // 25 active, more than the list's 20
      ...many(25, (i) => owned(`j${i}`, "manager-a", { status: "DRAFT" })),
      owned("j-own", "tech-a", { status: "IN_BILLING" }),
      owned("j-closed", "admin-a", { status: "CLOSED" }),
      owned("j-completed", "admin-a", { status: "COMPLETED" }),
      owned("j-rejected", "admin-a", { status: "REJECTED" }),
      owned("j-archived", "admin-a", { status: "ARCHIVED" }),
      owned("j-b", "admin-b", { status: "DRAFT" }),
    ],
    report: [
      // 45 open, more than the list's 40
      ...many(44, (i) =>
        owned(`r${i}`, "admin-a", { status: i % 2 ? "DRAFT" : "PENDING" }),
      ),
      owned("r-own", "tech-a", { status: "DRAFT" }),
      owned("r-done", "admin-a", { status: "COMPLETED" }),
      owned("r-b", "admin-b", { status: "DRAFT" }),
    ],
    invoice: [
      // 25 waiting on payment, more than the list's 20, VIEWED among them
      ...many(25, (i) =>
        owned(`i${i}`, "admin-a", { status: OUTSTANDING[i % 4] }),
      ),
      owned("i-own", "tech-a", { status: "VIEWED" }),
      owned("i-paid", "admin-a", { status: "PAID" }),
      owned("i-draft", "admin-a", { status: "DRAFT" }),
      owned("i-b", "admin-b", { status: "SENT" }),
    ],
    client: [
      // 25 clients, more than the list's default 10
      ...many(25, (i) => owned(`c${i}`, "admin-a", {})),
      owned("c-own", "tech-a", {}),
      owned("c-b", "admin-b", {}),
    ],
  });
});

describe("GET /api/dashboard/home-counts (RA-8146)", () => {
  it.each(["admin-a", "manager-a"])(
    "gives %s true totals above the old list caps",
    async (userId) => {
      const res = await counts(userId);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        activeJobs: 26,
        openReports: 45,
        awaitingPayment: 26,
        clients: 26,
      });
    },
  );

  it("gives a technician the organisation's work and only their own money", async () => {
    const res = await counts("tech-a");
    expect(await res.json()).toEqual({
      activeJobs: 26,
      openReports: 45,
      awaitingPayment: 1,
      clients: 1,
    });
  });

  it("keeps another organisation apart", async () => {
    const res = await counts("admin-b");
    expect(await res.json()).toEqual({
      activeJobs: 1,
      openReports: 1,
      awaitingPayment: 1,
      clients: 1,
    });
  });

  it("asks the database for at most four counts", async () => {
    await counts("admin-a");
    expect(calls.filter((model) => model !== "user")).toHaveLength(4);
  });

  it.each(["inspection", "report", "invoice", "client"])(
    "fails whole when the %s count fails, with no partial figures",
    async (model) => {
      failing.add(model);
      const res = await counts("admin-a");
      expect(res.status).toBe(500);
      const body = await res.json();
      for (const key of ["activeJobs", "openReports", "awaitingPayment", "clients"]) {
        expect(body).not.toHaveProperty(key);
      }
    },
  );

  it("refuses an unsigned caller", async () => {
    const { GET } = await import("../route");
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/dashboard/home-counts") as never);
    expect(res.status).toBe(401);
  });
});
