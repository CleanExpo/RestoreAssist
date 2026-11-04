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
  seed,
  sessionFor,
} from "@/lib/auth/__tests__/helpers/fake-tenant-db";

const NOW = new Date(2026, 10, 15, 12);
const OLD = new Date(2026, 0, 1);
const MONTH_START = new Date(2026, 10, 1);

function job(id: string, userId: string, status: string, extra = {}) {
  return {
    id,
    userId,
    status,
    workspaceId: null,
    createdAt: OLD,
    updatedAt: OLD,
    completedAt: null,
    ...extra,
  };
}

async function statsFor(userId: string) {
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(
    sessionFor(userId),
  );
  const res = await GET(new Request("http://localhost/api/dashboard/stats") as never);
  expect(res.status).toBe(200);
  return res.json();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  seed({
    user: USERS,
    inspection: [
      job("a-draft", "admin-a", "DRAFT"),
      job("a-billing", "manager-a", "IN_BILLING"),
      job("a-new", "tech-a", "SUBMITTED", { createdAt: new Date(2026, 10, 15, 2) }),
      job("b-draft", "admin-b", "DRAFT"),
      // Finished this month
      job("a-closed", "manager-a", "CLOSED", {
        completedAt: new Date(2026, 10, 3),
        updatedAt: new Date(2026, 10, 3),
      }),
      job("a-archived", "admin-a", "ARCHIVED", {
        completedAt: new Date(2026, 10, 4),
        updatedAt: new Date(2026, 10, 4),
      }),
      job("a-legacy", "tech-a", "COMPLETED", {
        updatedAt: new Date(2026, 10, 5),
      }),
      job("a-edge", "admin-a", "CLOSED", {
        completedAt: MONTH_START,
        updatedAt: MONTH_START,
      }),
      // Finished last month. A later edit must not move the first one.
      job("a-closed-edited", "admin-a", "CLOSED", {
        completedAt: new Date(2026, 9, 20),
        updatedAt: new Date(2026, 10, 10),
      }),
      job("a-legacy-old", "manager-a", "COMPLETED", {
        updatedAt: new Date(2026, 9, 5),
      }),
      job("a-edge-before", "tech-a", "CLOSED", {
        completedAt: new Date(MONTH_START.getTime() - 1),
        updatedAt: new Date(MONTH_START.getTime() - 1),
      }),
      // Never finished: archived with no finish date, and a rejected job
      job("a-archived-unfinished", "admin-a", "ARCHIVED", {
        updatedAt: new Date(2026, 10, 6),
      }),
      job("a-rejected", "admin-a", "REJECTED", {
        updatedAt: new Date(2026, 10, 6),
      }),
      job("b-closed", "admin-b", "CLOSED", {
        completedAt: new Date(2026, 10, 2),
        updatedAt: new Date(2026, 10, 2),
      }),
    ],
    moistureReading: [
      { id: "m1", inspectionId: "a-draft", createdAt: new Date(2026, 10, 14) },
      { id: "m2", inspectionId: "a-new", createdAt: new Date(2026, 10, 14) },
      { id: "m3", inspectionId: "a-new", createdAt: new Date(2026, 10, 3) },
      { id: "m4", inspectionId: "b-draft", createdAt: new Date(2026, 10, 14) },
    ],
    scopeItem: [
      { id: "s1", inspectionId: "a-billing", autoDetermined: true, createdAt: OLD },
      { id: "s2", inspectionId: "a-new", autoDetermined: true, createdAt: OLD },
      { id: "s3", inspectionId: "a-new", autoDetermined: false, createdAt: OLD },
      { id: "s4", inspectionId: "b-draft", autoDetermined: true, createdAt: OLD },
    ],
  });
});
afterEach(() => vi.useRealTimers());

describe("GET /api/dashboard/stats organisation reach (RA-8146)", () => {
  // Job counts are not money: everyone in the business sees the same board.
  it.each(["admin-a", "manager-a", "tech-a"])(
    "gives %s the whole organisation's job figures",
    async (userId) => {
      const body = await statsFor(userId);
      expect(body.activeInspections.value).toBe(3);
      expect(body.moistureReadings7d.value).toBe(2);
      expect(body.moistureReadings7d.delta).toBe("+100%");
      expect(body.equipmentItems.value).toBe(2);
      expect(body.createdToday.value).toBe(1);
    },
  );

  it("never mixes in another organisation", async () => {
    const body = await statsFor("admin-b");
    expect(body.activeInspections.value).toBe(1);
    expect(body.moistureReadings7d.value).toBe(1);
    expect(body.equipmentItems.value).toBe(1);
    expect(body.completedThisMonth.value).toBe(1);
  });

  it("counts a closed job in the month it finished, not the month it was edited", async () => {
    const body = await statsFor("admin-a");
    expect(body.completedThisMonth.value).toBe(4);
    expect(body.completedThisMonth.delta).toBe("+33%");
  });

  it("opens the plain jobs list from the Completed card", async () => {
    const body = await statsFor("admin-a");
    expect(body.completedThisMonth.href).toBe("/dashboard/inspections");
  });

  it("keeps a platform operator inside their own organisation", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "admin-a");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = await statsFor("admin-a");
    vi.unstubAllEnvs();
    expect(body.activeInspections.value).toBe(3);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("refuses an unsigned caller", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/dashboard/stats") as never);
    expect(res.status).toBe(401);
  });
});
