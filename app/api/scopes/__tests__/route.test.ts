import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-6800: authorization regression tests for the scope upsert/read endpoints.
// A scope is owned via its parent report (`report.userId`). Neither handler may
// act on a report the session user does not own.

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: NextRequest,
    _scope: string,
    handler: (body: string) => Promise<Response>,
  ) => handler(await request.text()),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findFirst: vi.fn() },
    scope: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { POST, GET } from "../route";

const ATTACKER = "user_attacker";
const VICTIM_REPORT = "report_victim";

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: ATTACKER } });
  applyRateLimit.mockResolvedValue(null);
});

function postScope(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/scopes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/scopes — report ownership", () => {
  it("rejects upserting a scope onto a report the caller does not own (IDOR)", async () => {
    // Attacker does not own the victim's report.
    (prisma.report.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    (prisma.scope.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(
      postScope({ reportId: VICTIM_REPORT, scopeType: "water" }),
    );

    expect(res.status).toBe(404);
    // The write must never happen for a non-owned report.
    expect(prisma.scope.create).not.toHaveBeenCalled();
    expect(prisma.scope.update).not.toHaveBeenCalled();
  });

  it("creates a scope when the caller owns the report", async () => {
    (prisma.report.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: VICTIM_REPORT,
    });
    (prisma.scope.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.scope.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "scope_1",
      reportId: VICTIM_REPORT,
      scopeType: "water",
      siteVariables: null,
      labourParameters: null,
      equipmentParameters: null,
      chemicalApplication: null,
      timeCalculations: null,
      labourCostTotal: 0,
      equipmentCostTotal: 0,
      chemicalCostTotal: 0,
      totalDuration: 0,
      complianceNotes: null,
      assumptions: null,
    });

    const res = await POST(
      postScope({ reportId: VICTIM_REPORT, scopeType: "water" }),
    );

    expect(res.status).toBe(200);
    expect(prisma.scope.create).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/scopes?reportId — report ownership", () => {
  it("does not return a scope for a report the caller does not own (IDOR)", async () => {
    // Return the victim's scope ONLY if the query is NOT scoped to the caller's
    // ownership — mirrors a DB that ignores ownership. A correct handler scopes
    // the lookup by `report.userId`, so the victim row stays hidden.
    (prisma.scope.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
      ({ where }: { where: { report?: { userId?: string } } }) =>
        where?.report?.userId === ATTACKER
          ? Promise.resolve(null)
          : Promise.resolve({
              id: "scope_victim",
              reportId: VICTIM_REPORT,
              scopeType: "water",
              siteVariables: null,
              labourParameters: null,
              equipmentParameters: null,
              chemicalApplication: null,
              timeCalculations: null,
              labourCostTotal: 0,
              equipmentCostTotal: 0,
              chemicalCostTotal: 0,
              totalDuration: 0,
              complianceNotes: null,
              assumptions: null,
            }),
    );

    const res = await GET(
      new NextRequest(`http://localhost/api/scopes?reportId=${VICTIM_REPORT}`),
    );

    expect(res.status).toBe(404);
  });
});
