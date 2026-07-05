/**
 * Cross-user analytics authorisation must be decided on the DB role, not the
 * stale JWT `session.user.role` claim (CLAUDE.md rule 1).
 *
 * Regression guard for jwt-role-authz-without-db-revalidation: a user demoted
 * from ADMIN/MANAGER to USER carries an ADMIN/MANAGER role in their still-valid
 * JWT until expiry. If the route trusts that claim, the demoted user keeps
 * reading other team members' analytics. The route already loads `currentUser`
 * (with role) from the DB — these tests prove that value now drives the gate.
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

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET as analyticsGET } from "../route";
import { GET as insightsGET } from "../insights/route";
import { GET as completionMetricsGET } from "../completion-metrics/route";

const CALLER_ID = "caller_1";
const TARGET_ID = "target_1";

function makeReq(path: string) {
  return new NextRequest(
    `http://localhost${path}?userId=${TARGET_ID}&dateRange=30days`,
  );
}

const routes: Array<{ name: string; path: string; get: (r: NextRequest) => Promise<Response> }> = [
  { name: "analytics", path: "/api/analytics", get: analyticsGET as never },
  { name: "analytics/insights", path: "/api/analytics/insights", get: insightsGET as never },
  {
    name: "analytics/completion-metrics",
    path: "/api/analytics/completion-metrics",
    get: completionMetricsGET as never,
  },
];

describe("analytics cross-user authz revalidates role from the DB", () => {
  beforeEach(() => {
    // mockReset (not clearAllMocks) so any unconsumed `mockResolvedValueOnce`
    // queue from a prior test cannot bleed into the next one.
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.report.findMany).mockReset();
    vi.mocked(prisma.report.findMany).mockResolvedValue([] as never);
  });

  for (const route of routes) {
    describe(route.name, () => {
      it("denies a JWT-ADMIN whose DB role has been demoted to USER", async () => {
        // Stale JWT still claims ADMIN...
        vi.mocked(getServerSession).mockResolvedValue({
          user: { id: CALLER_ID, role: "ADMIN" },
        } as never);
        vi.mocked(prisma.user.findUnique)
          // ...but the DB (source of truth) says the caller is now a plain USER.
          .mockResolvedValueOnce({ organizationId: "org_1", role: "USER" } as never)
          // A perfectly valid, same-org technician target: if the route trusted
          // the JWT it would sail past the gate to here and return 200.
          .mockResolvedValueOnce({
            id: TARGET_ID,
            organizationId: "org_1",
            role: "USER",
            managedById: null,
          } as never);

        const res = await route.get(makeReq(route.path));

        expect(res.status).toBe(403);
        // The gate short-circuits before ever loading the target user's reports.
        expect(prisma.report.findMany).not.toHaveBeenCalled();
      });

      it("denies a JWT-MANAGER whose DB role has been demoted to USER", async () => {
        vi.mocked(getServerSession).mockResolvedValue({
          user: { id: CALLER_ID, role: "MANAGER" },
        } as never);
        vi.mocked(prisma.user.findUnique)
          .mockResolvedValueOnce({ organizationId: "org_1", role: "USER" } as never)
          .mockResolvedValueOnce({
            id: TARGET_ID,
            organizationId: "org_1",
            role: "USER",
            managedById: null,
          } as never);

        const res = await route.get(makeReq(route.path));

        expect(res.status).toBe(403);
        expect(prisma.report.findMany).not.toHaveBeenCalled();
      });

      it("allows a genuine DB-ADMIN to view a technician in the same org", async () => {
        // JWT role is intentionally NOT admin to prove the DB value is what counts.
        vi.mocked(getServerSession).mockResolvedValue({
          user: { id: CALLER_ID, role: "USER" },
        } as never);
        vi.mocked(prisma.user.findUnique)
          .mockResolvedValueOnce({ organizationId: "org_1", role: "ADMIN" } as never)
          .mockResolvedValueOnce({
            id: TARGET_ID,
            organizationId: "org_1",
            role: "USER",
            managedById: null,
          } as never);

        const res = await route.get(makeReq(route.path));

        expect(res.status).toBe(200);
        expect(prisma.report.findMany).toHaveBeenCalled();
      });
    });
  }
});
