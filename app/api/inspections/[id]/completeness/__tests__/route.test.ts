import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const evidenceItemFindMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: (...a: unknown[]) => inspectionFindFirst(...a) },
    evidenceItem: { findMany: (...a: unknown[]) => evidenceItemFindMany(...a) },
  },
}));

// Import after mocks — GET calls the real validateSubmission so this test
// pins the end-to-end fix, not just the normaliser in isolation.
import { GET } from "../route";

const params = { params: Promise.resolve({ id: "insp_1" }) };

function makeRequest(claimType?: string): NextRequest {
  const url = new URL("http://localhost/api/inspections/insp_1/completeness");
  if (claimType !== undefined) url.searchParams.set("claimType", claimType);
  return new NextRequest(url);
}

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindFirst.mockReset();
  evidenceItemFindMany.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  inspectionFindFirst.mockResolvedValue({ id: "insp_1", userId: "user_1" });
  evidenceItemFindMany.mockResolvedValue([]);
});

describe("GET /api/inspections/[id]/completeness", () => {
  it("401 when no session", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), params);
    expect(res.status).toBe(401);
  });

  it("404 when inspection not found for this user", async () => {
    inspectionFindFirst.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), params);
    expect(res.status).toBe(404);
  });

  it("RA-6994: a water inspection with no captured evidence now fails with named gaps instead of silently passing at 100%", async () => {
    // Default claimType (no query param) is the historical lowercase
    // "water_damage" default — this is exactly the case that used to
    // return { passed: true, completionPercentage: 100, gaps: [] }.
    const res = await GET(makeRequest(), params);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.gaps.length).toBeGreaterThan(0);
    expect(body.data.completionPercentage).toBeLessThan(100);
    expect(
      body.data.gaps.some((g: { evidenceClass: string }) =>
        g.evidenceClass === "PHOTO_DAMAGE",
      ),
    ).toBe(true);
  });

  it("also fails correctly when claimType is passed already-uppercase", async () => {
    const res = await GET(makeRequest("WATER_DAMAGE"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.gaps.length).toBeGreaterThan(0);
  });

  it("400s on an unknown claimType instead of silently passing", async () => {
    const res = await GET(makeRequest("not-a-real-claim-type"), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toContain("not-a-real-claim-type");
    expect(evidenceItemFindMany).not.toHaveBeenCalled();
  });
});
