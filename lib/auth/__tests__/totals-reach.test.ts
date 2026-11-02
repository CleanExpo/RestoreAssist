import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => ({
  prisma: (await import("./helpers/fake-tenant-db")).fakePrisma,
}));

import { resolveTotalsReach } from "@/lib/auth/assert-tenancy";
import { USERS, matches, seed, sessionFor } from "./helpers/fake-tenant-db";

const OPERATOR_NO_ORG = {
  id: "operator-solo",
  role: "ADMIN",
  organizationId: null,
  email: "s@example.test",
};
const ROWS = [
  { id: "a", userId: "admin-a", workspaceId: null },
  { id: "m", userId: "manager-a", workspaceId: null },
  { id: "t", userId: "tech-a", workspaceId: null },
  { id: "b", userId: "admin-b", workspaceId: null },
  { id: "s", userId: "operator-solo", workspaceId: null },
];

async function reachable(userId: string, intent: "read" | "read-financial") {
  const reach = await resolveTotalsReach(sessionFor(userId), intent);
  if (!reach.ok) throw new Error(reach.reason);
  return ROWS.filter((r) => matches(r, reach.data as object)).map((r) => r.id);
}

beforeEach(() => {
  seed({ user: [...USERS, OPERATOR_NO_ORG] });
});
afterEach(() => vi.unstubAllEnvs());

describe("resolveTotalsReach (RA-8146)", () => {
  it.each([
    ["admin-a", "read", ["a", "m", "t"]],
    ["admin-a", "read-financial", ["a", "m", "t"]],
    ["manager-a", "read", ["a", "m", "t"]],
    ["manager-a", "read-financial", ["a", "m", "t"]],
    ["tech-a", "read", ["a", "m", "t"]],
    ["tech-a", "read-financial", ["t"]],
    ["admin-b", "read-financial", ["b"]],
  ] as const)("%s with %s reaches %j", async (userId, intent, expected) => {
    expect(await reachable(userId, intent)).toEqual(expected);
  });

  it("holds a platform operator inside their own organisation, and logs it", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "admin-a,operator-solo");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await reachable("admin-a", "read-financial")).toEqual(["a", "m", "t"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("gives an operator with no organisation only their own rows, never every tenant", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "operator-solo");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reach = await resolveTotalsReach(sessionFor("operator-solo"), "read");
    expect(reach).not.toEqual({ ok: true, data: {} });
    expect(await reachable("operator-solo", "read")).toEqual(["s"]);
    warn.mockRestore();
  });

  it("does not warn for an ordinary owner", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await reachable("admin-a", "read");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("refuses no session", async () => {
    const reach = await resolveTotalsReach(null, "read");
    expect(reach).toMatchObject({ ok: false, status: 401 });
  });
});

describe("figure routes", () => {
  const FIGURE_ROUTES = [
    "app/api/dashboard/stats/route.ts",
    "app/api/analytics/dashboard-stats/route.ts",
    "app/api/invoices/analytics/route.ts",
    "app/api/dashboard/home-counts/route.ts",
  ];

  it.each(FIGURE_ROUTES)(
    "%s takes its reach only from resolveTotalsReach, and writes no SQL",
    (file) => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toContain("resolveTotalsReach");
      // These return {} for a platform operator, which would total every tenant.
      expect(source).not.toMatch(
        /resolve(Inspection|InspectionWrite|InspectionFinancial|Client|Invoice|Report|ReportFinancial)Reach/,
      );
      expect(source).not.toContain("$queryRaw");
    },
  );
});
