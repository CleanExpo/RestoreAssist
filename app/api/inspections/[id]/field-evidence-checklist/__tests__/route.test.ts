import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const assertInspectionTenancy = vi.hoisted(() => vi.fn());
const auditInspectionById = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...a: unknown[]) => assertInspectionTenancy(...a),
}));
vi.mock("@/lib/evidence/field-evidence-audit", () => ({
  auditInspectionById: (...a: unknown[]) => auditInspectionById(...a),
}));

import { GET } from "../route";

const params = { params: Promise.resolve({ id: "insp_1" }) };

function makeRequest(): NextRequest {
  return new NextRequest(
    "http://localhost/api/inspections/insp_1/field-evidence-checklist",
  );
}

const sampleChecklist = {
  inspectionId: "insp_1",
  claimType: "WATER_DAMAGE",
  generatedAt: "2026-07-05T00:00:00.000Z",
  categories: { required: [], recommended: [] },
  gapsByEvidenceClass: {},
  gapsByAffectedArea: [],
  unlinkedEvidence: [],
};

beforeEach(() => {
  getServerSession.mockReset();
  assertInspectionTenancy.mockReset();
  auditInspectionById.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  assertInspectionTenancy.mockResolvedValue({ ok: true, data: { id: "insp_1" } });
  auditInspectionById.mockResolvedValue(sampleChecklist);
});

describe("GET /api/inspections/[id]/field-evidence-checklist", () => {
  it("401 when no session", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), params);
    expect(res.status).toBe(401);
    expect(auditInspectionById).not.toHaveBeenCalled();
  });

  it("propagates the tenancy check's status when not ok", async () => {
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });
    const res = await GET(makeRequest(), params);
    expect(res.status).toBe(404);
    expect(auditInspectionById).not.toHaveBeenCalled();
  });

  it("200s with the checklist for an owned inspection", async () => {
    const res = await GET(makeRequest(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(sampleChecklist);
    expect(assertInspectionTenancy).toHaveBeenCalledWith(
      { user: { id: "user_1" } },
      "insp_1",
    );
    expect(auditInspectionById).toHaveBeenCalledWith("insp_1");
  });

  it("500s when the underlying audit throws", async () => {
    auditInspectionById.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(makeRequest(), params);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL");
  });
});
