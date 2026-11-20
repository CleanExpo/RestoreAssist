import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const assertInspectionTenancy = vi.hoisted(() => vi.fn());
const evidenceItemFindMany = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...a: unknown[]) => assertInspectionTenancy(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    evidenceItem: { findMany: (...a: unknown[]) => evidenceItemFindMany(...a) },
  },
}));

// Import after mocks — POST calls the real validateSubmission so this test
// pins the end-to-end fix, not just the normaliser in isolation.
import { POST } from "../route";

const params = { params: Promise.resolve({ id: "insp_1" }) };

function makeRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest("http://localhost/api/inspections/insp_1/validate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  assertInspectionTenancy.mockReset();
  evidenceItemFindMany.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  assertInspectionTenancy.mockResolvedValue({ ok: true, data: { id: "insp_1" } });
  evidenceItemFindMany.mockResolvedValue([]);
});

describe("POST /api/inspections/[id]/validate", () => {
  it("401 when no session", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(), params);
    expect(res.status).toBe(401);
  });

  it("propagates the tenancy check's status when not ok", async () => {
    assertInspectionTenancy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });
    const res = await POST(makeRequest(), params);
    expect(res.status).toBe(404);
  });

  it("RA-6994: a water inspection with no captured evidence now fails with named gaps instead of silently passing at 100%", async () => {
    // No claimType in the body — the historical default path.
    const res = await POST(makeRequest(), params);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.passed).toBe(false);
    expect(body.data.gaps.length).toBeGreaterThan(0);
    expect(body.data.completionPercentage).toBeLessThan(100);
  });

  it("normalises an already-uppercase claimType the same way", async () => {
    const res = await POST(makeRequest({ claimType: "WATER_DAMAGE" }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.passed).toBe(false);
    expect(body.data.gaps.length).toBeGreaterThan(0);
  });

  it("400s on an unknown claimType instead of silently passing", async () => {
    const res = await POST(
      makeRequest({ claimType: "not-a-real-claim-type" }),
      params,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toContain("not-a-real-claim-type");
    expect(evidenceItemFindMany).not.toHaveBeenCalled();
  });
});
