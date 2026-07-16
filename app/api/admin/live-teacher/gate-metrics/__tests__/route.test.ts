/**
 * RA-7053 — gate-metrics route: auth gates + 200 response shape.
 * Mocks getServerSession, admin-auth, and @/lib/prisma (no DB).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const mockVerifyAdmin = vi.fn();
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...args: unknown[]) => mockVerifyAdmin(...args),
}));

const mockSessionGroupBy = vi.fn();
const mockSessionCount = vi.fn();
const mockUtteranceFindMany = vi.fn();
const mockChunkFindMany = vi.fn();
const mockReportFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveTeacherSession: {
      groupBy: (...a: unknown[]) => mockSessionGroupBy(...a),
      count: (...a: unknown[]) => mockSessionCount(...a),
    },
    teacherUtterance: {
      findMany: (...a: unknown[]) => mockUtteranceFindMany(...a),
    },
    standardsChunk: {
      findMany: (...a: unknown[]) => mockChunkFindMany(...a),
    },
    report: {
      findMany: (...a: unknown[]) => mockReportFindMany(...a),
    },
  },
}));

import { getServerSession } from "next-auth";
const mockGetServerSession = vi.mocked(getServerSession);

function req(): NextRequest {
  return new NextRequest(
    "http://localhost/api/admin/live-teacher/gate-metrics",
  );
}

describe("GET /api/admin/live-teacher/gate-metrics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockVerifyAdmin.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      }),
    });
    const { GET } = await import("../route");
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", role: "USER" },
    } as never);
    mockVerifyAdmin.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      }),
    });
    const { GET } = await import("../route");
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("returns 200 with the gate-metrics shape for an admin", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "admin1", role: "ADMIN" },
    } as never);
    mockVerifyAdmin.mockResolvedValue({
      user: { id: "admin1", role: "ADMIN", organizationId: "org1" },
    });

    mockSessionGroupBy.mockResolvedValue([
      { inspectionId: "i1", _sum: { totalCostAudCents: 300 }, _count: { _all: 2 } },
      { inspectionId: "i2", _sum: { totalCostAudCents: 700 }, _count: { _all: 1 } },
    ]);
    mockSessionCount.mockResolvedValue(1);
    mockUtteranceFindMany.mockResolvedValue([
      { sessionId: "s1", clauseRefs: ["[S500:2021 §10.3.2]", "[S500:2021 §99.99]"] }, // standards-cite-ignore (intentional negative-test fixture)
    ]);
    mockChunkFindMany.mockResolvedValue([
      { standard: "IICRC_S500", edition: "2021", clause: "10.3.2" },
    ]);
    mockReportFindMany.mockResolvedValue([
      {
        reportNumber: "R1",
        scopeOfWorksDocument: "scope",
        costEstimationDocument: "cost",
        totalCost: 1000,
        client: { name: "A", email: "a@b.com", phone: "123" },
        authorityForms: [{ id: "af1" }],
        inspection: {
          floorPlanImageUrl: "url",
          powerCircuits: 2,
          powerCircuitRatingA: 20,
          contentsManifestDraft: "{}",
          moistureReadings: [{ id: "m1" }],
          affectedAreas: [{ id: "a1" }],
          classifications: [{ id: "c1" }],
          scopeItems: [{ id: "si1" }],
          costEstimates: [{ id: "ce1" }],
          photos: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
          claimSketches: [{ id: "cs1", renderedPngUrl: "png" }],
          liveTeacherSessions: [{ id: "lts1" }], // assisted
        },
      },
      {
        reportNumber: "R2",
        scopeOfWorksDocument: null,
        costEstimationDocument: null,
        totalCost: null,
        client: { name: "B", email: "b@b.com", phone: "456" },
        authorityForms: [],
        inspection: {
          floorPlanImageUrl: null,
          powerCircuits: null,
          powerCircuitRatingA: null,
          contentsManifestDraft: null,
          moistureReadings: [],
          affectedAreas: [],
          classifications: [],
          scopeItems: [],
          costEstimates: [],
          photos: [],
          claimSketches: [],
          liveTeacherSessions: [], // control
        },
      },
    ]);

    const { GET } = await import("../route");
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    const { cost, citations, completeness, cohort, meta } = json.data;

    expect(cost.inspectionsMeasured).toBe(2);
    expect(cost.overThresholdCount).toBe(1); // 700 > 500

    expect(citations.totalRefs).toBe(2);
    expect(citations.verdictCounts.invalid_no_such_clause).toBe(1);
    expect(citations.citationErrorRate).toBeCloseTo(0.5, 5);

    // One assisted + one control report → delta computable.
    expect(completeness.sufficient).toBe(true);
    expect(completeness.nAssisted).toBe(1);
    expect(completeness.nControl).toBe(1);
    expect(completeness.deltaPoints).not.toBeNull();

    expect(cohort.sessions).toBe(3); // 2 + 1
    expect(Array.isArray(meta.notes)).toBe(true);
  });

  it("scopes the cost, open-session, and citation queries to the admin's organisation", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "admin1", role: "ADMIN" },
    } as never);
    mockVerifyAdmin.mockResolvedValue({
      user: { id: "admin1", role: "ADMIN", organizationId: "org1" },
    });
    mockSessionGroupBy.mockResolvedValue([]);
    mockSessionCount.mockResolvedValue(0);
    mockUtteranceFindMany.mockResolvedValue([]);
    mockChunkFindMany.mockResolvedValue([]);
    mockReportFindMany.mockResolvedValue([]);

    const { GET } = await import("../route");
    const res = await GET(req());
    expect(res.status).toBe(200);

    const orgFilter = { user: { organizationId: "org1" } };

    // F1 — cost rollup groupBy must reach the org via inspection.user.
    expect(mockSessionGroupBy.mock.calls[0][0].where.inspection).toEqual(
      orgFilter,
    );
    // F1 — open-session count must be org-scoped too.
    expect(mockSessionCount.mock.calls[0][0].where.inspection).toEqual(
      orgFilter,
    );
    // F1 — citation utterances scope via session.inspection.user.
    const utteranceArgs = mockUtteranceFindMany.mock.calls[0][0];
    expect(utteranceArgs.where.session.inspection).toEqual(orgFilter);
    // F8 — deterministic order so the MAX_UTTERANCES cap is not arbitrary.
    expect(utteranceArgs.orderBy).toEqual({ createdAt: "asc" });
    // The report query was already org-scoped (regression guard).
    expect(mockReportFindMany.mock.calls[0][0].where.user).toEqual({
      organizationId: "org1",
    });
  });

  it("F9 — all four gate-metrics queries thread the admin's organizationId (cross-org guard)", async () => {
    // Distinct, arbitrary org id proves the filter value is threaded through
    // from verifyAdminFromDb, not hardcoded or dropped on any of the four reads.
    const orgId = "org-F9-9f3c";
    mockGetServerSession.mockResolvedValue({
      user: { id: "admin9", role: "ADMIN" },
    } as never);
    mockVerifyAdmin.mockResolvedValue({
      user: { id: "admin9", role: "ADMIN", organizationId: orgId },
    });
    mockSessionGroupBy.mockResolvedValue([]);
    mockSessionCount.mockResolvedValue(0);
    mockUtteranceFindMany.mockResolvedValue([]);
    mockChunkFindMany.mockResolvedValue([]);
    mockReportFindMany.mockResolvedValue([]);

    const { GET } = await import("../route");
    const res = await GET(req());
    expect(res.status).toBe(200);

    // Cost rollup + open-session count reach the org via inspection.user.organizationId.
    expect(
      mockSessionGroupBy.mock.calls[0][0].where.inspection.user.organizationId,
    ).toBe(orgId);
    expect(
      mockSessionCount.mock.calls[0][0].where.inspection.user.organizationId,
    ).toBe(orgId);
    // Citation utterances reach the org via session.inspection.user.organizationId.
    expect(
      mockUtteranceFindMany.mock.calls[0][0].where.session.inspection.user
        .organizationId,
    ).toBe(orgId);
    // Completeness reports reach the org via user.organizationId (Report has a direct user relation).
    expect(mockReportFindMany.mock.calls[0][0].where.user.organizationId).toBe(
      orgId,
    );
  });
});
