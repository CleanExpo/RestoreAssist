import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const mockAssertTenancy = vi.fn();
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...a: unknown[]) => mockAssertTenancy(...a),
}));

const mockFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
  },
}));

import { getServerSession } from "next-auth";
const mockSession = vi.mocked(getServerSession);

function req() {
  return new NextRequest(
    "http://localhost/api/inspections/i1/report-prefill",
  );
}
const ctx = { params: Promise.resolve({ id: "i1" }) };

const INSPECTION = {
  inspectionNumber: "NIR-2026-09-0007",
  propertyAddress: "12 Wattle Street, Toowoomba QLD",
  propertyPostcode: "4350",
  inspectionDate: new Date("2026-09-01T23:15:00.000Z"),
  technicianName: "J. Nguyen",
  lossDescription: "Supply line to the dishwasher failed overnight.",
  claimType: "WATER",
  propertyYearBuilt: 1974,
  propertyWallConstruction: "Cavity",
  propertyWallMaterial: "Brick",
  waterDamageClassification: {
    waterCategory: "CAT_2",
    damageClass: "CLASS_3",
    lossSourceType: "APPLIANCE",
  },
  classifications: [],
};

describe("GET /api/inspections/[id]/report-prefill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValue(null);
    mockAssertTenancy.mockResolvedValue({
      ok: false,
      status: 401,
      reason: "Unauthorized",
    });
    const { GET } = await import("../report-prefill/route");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(401);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("404s another tenant's inspection without reading it", async () => {
    // The read must not happen at all: a route that fetches first and filters
    // afterwards leaks through timing and through any later logging of the row.
    mockSession.mockResolvedValue({ user: { id: "u1" } } as never);
    mockAssertTenancy.mockResolvedValue({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });
    const { GET } = await import("../report-prefill/route");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns the mapped fields and the count the UI reports", async () => {
    mockSession.mockResolvedValue({ user: { id: "u1" } } as never);
    mockAssertTenancy.mockResolvedValue({ ok: true, data: { id: "i1" } });
    mockFindUnique.mockResolvedValue(INSPECTION);
    const { GET } = await import("../report-prefill/route");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inspectionNumber).toBe("NIR-2026-09-0007");
    expect(body.fields.propertyPostcode).toBe("4350");
    expect(body.fields.technicianAttendanceDate).toBe("2026-09-01");
    expect(body.fields.waterCategory).toBe("2");
    expect(body.filled).toHaveLength(Object.keys(body.fields).length);
  });

  it("reports nothing filled rather than an empty-looking success", async () => {
    // A DRAFT inspection with only its number. `filled: []` is what lets the
    // page say "nothing recorded yet" instead of silently pre-filling nothing
    // and leaving the technician to wonder whether it worked.
    mockSession.mockResolvedValue({ user: { id: "u1" } } as never);
    mockAssertTenancy.mockResolvedValue({ ok: true, data: { id: "i1" } });
    mockFindUnique.mockResolvedValue({
      inspectionNumber: "NIR-2026-09-0008",
      propertyAddress: null,
      propertyPostcode: null,
      inspectionDate: null,
      technicianName: null,
      lossDescription: null,
      claimType: null,
      propertyYearBuilt: null,
      propertyWallConstruction: null,
      propertyWallMaterial: null,
      waterDamageClassification: null,
      classifications: [],
    });
    const { GET } = await import("../report-prefill/route");
    const res = await GET(req(), ctx);
    const body = await res.json();
    expect(body.filled).toEqual(["jobNumber"]);
  });

  it("bounds the classification history it loads", async () => {
    // An inspection reclassified repeatedly must not drag its whole history
    // into a form load.
    mockSession.mockResolvedValue({ user: { id: "u1" } } as never);
    mockAssertTenancy.mockResolvedValue({ ok: true, data: { id: "i1" } });
    mockFindUnique.mockResolvedValue(INSPECTION);
    const { GET } = await import("../report-prefill/route");
    await GET(req(), ctx);
    const select = mockFindUnique.mock.calls[0][0].select;
    expect(select.classifications.take).toBe(20);
    expect(select.classifications.orderBy).toEqual({ createdAt: "desc" });
  });

  it("selects no column the mapping does not read", async () => {
    // The narrow select is the boundary. Widening it here is how a route starts
    // returning more than the page needs.
    mockSession.mockResolvedValue({ user: { id: "u1" } } as never);
    mockAssertTenancy.mockResolvedValue({ ok: true, data: { id: "i1" } });
    mockFindUnique.mockResolvedValue(INSPECTION);
    const { GET } = await import("../report-prefill/route");
    await GET(req(), ctx);
    expect(Object.keys(mockFindUnique.mock.calls[0][0].select).sort()).toEqual([
      "claimType",
      "classifications",
      "inspectionDate",
      "inspectionNumber",
      "lossDescription",
      "propertyAddress",
      "propertyPostcode",
      "propertyWallConstruction",
      "propertyWallMaterial",
      "propertyYearBuilt",
      "technicianName",
      "waterDamageClassification",
    ]);
  });
});
