import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const mockAssertTenancy = vi.fn();
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...a: unknown[]) => mockAssertTenancy(...a),
}));

const mockMoistureFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    moistureReading: {
      findMany: (...a: unknown[]) => mockMoistureFindMany(...a),
    },
  },
}));

import { getServerSession } from "next-auth";
const mockSession = vi.mocked(getServerSession);

function req() {
  return new NextRequest("http://localhost/api/inspections/i1/drying-status");
}
const ctx = { params: Promise.resolve({ id: "i1" }) };

describe("GET /api/inspections/[id]/drying-status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValue(null);
    const { GET } = await import("../drying-status/route");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(401);
  });

  it("propagates a tenancy failure (403/404)", async () => {
    mockSession.mockResolvedValue({ user: { id: "u1" } } as any);
    mockAssertTenancy.mockResolvedValue({ ok: false, status: 403, reason: "Forbidden" });
    const { GET } = await import("../drying-status/route");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(403);
  });

  it("returns a not-ready readiness when materials are still wet", async () => {
    mockSession.mockResolvedValue({ user: { id: "u1" } } as any);
    mockAssertTenancy.mockResolvedValue({ ok: true });
    mockMoistureFindMany.mockResolvedValue([
      { location: "Ref", surfaceType: "drywall", moistureLevel: 0.4, unit: "PERCENT_MC", isBaseline: true },
      { location: "Bathroom", surfaceType: "drywall", moistureLevel: 22, unit: "PERCENT_MC", isBaseline: false },
    ]);
    const { GET } = await import("../drying-status/route");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ready).toBe(false);
    expect(body.data.wetCount).toBe(1);
    expect(body.data.hasBaseline).toBe(true);
    expect(body.data.wet[0].location).toBe("Bathroom");
  });

  it("returns ready when baseline exists and all readings are dry", async () => {
    mockSession.mockResolvedValue({ user: { id: "u1" } } as any);
    mockAssertTenancy.mockResolvedValue({ ok: true });
    mockMoistureFindMany.mockResolvedValue([
      { location: "Ref", surfaceType: "drywall", moistureLevel: 0.4, unit: "PERCENT_MC", isBaseline: true },
      { location: "Bathroom", surfaceType: "drywall", moistureLevel: 0.8, unit: "PERCENT_MC", isBaseline: false },
    ]);
    const { GET } = await import("../drying-status/route");
    const res = await GET(req(), ctx);
    const body = await res.json();
    expect(body.data.ready).toBe(true);
    expect(body.data.blockers).toEqual([]);
  });
});
