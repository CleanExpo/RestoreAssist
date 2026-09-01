import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
    material: { findMany: vi.fn() },
    claimSketch: { findMany: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { POST } from "../route";

const mockTenancy = assertInspectionTenancy as unknown as ReturnType<
  typeof vi.fn
>;

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  inspection: { findUnique: ReturnType<typeof vi.fn> };
  material: { findMany: ReturnType<typeof vi.fn> };
  claimSketch: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
  p.inspection.findUnique.mockResolvedValue({ propertyAddress: "1 Test St" });
  p.material.findMany.mockResolvedValue([
    { slug: "fibro", name: "Fibro", isPotentialAcm: true },
  ]);
  p.claimSketch.findMany.mockResolvedValue([
    { moisturePoints: [], country: "AU" },
  ]);
});

const FLOORS = [
  {
    label: "Ground",
    fabricJson: {
      objects: [
        {
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 300, y: 0 },
            { x: 300, y: 400 },
            { x: 0, y: 400 },
          ],
          data: { type: "room", material: "fibro", label: "Bathroom" },
        },
      ],
    },
  },
];

function post(body: object): NextRequest {
  return new NextRequest(
    "http://localhost/api/inspections/i1/sketches/scope-export",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const params = { params: Promise.resolve({ id: "i1" }) };

describe("POST scope-export", () => {
  it("returns the versioned structured scope as JSON", async () => {
    const res = await POST(post({ floors: FLOORS }), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = await res.json();
    expect(body.schemaVersion).toBe("1.1");
    expect(body.jurisdiction).toBe("AU");
    expect(body.floors[0].rooms[0].areaM2).toBeCloseTo(12, 5);
    expect(body.compliance.acmElements).toContain("Bathroom");
  });

  /**
   * What this proves, and what it does not.
   *
   * PROVES the route threads the derived inputs into `buildScopeExport`:
   * deleting the `...planInputs` spread turns this and the power case red.
   *
   * DOES NOT prove the Prisma `select` is wide enough. Prisma is mocked here, so
   * `select` is ignored and the mocked row is returned whole — verified by
   * removing `...PLAN_INPUT_SELECT` from the route, which left all 8 tests
   * green. A narrowed select is the exact defect CodeRabbit found in the Margot
   * tool on #2149, and the only thing guarding it in these four routes is that
   * they all spread one shared constant rather than hand-writing the columns.
   * Catching it in a test needs a real database.
   */
  it("carries the mould gate into the exported scope", async () => {
    p.inspection.findUnique.mockResolvedValue({
      propertyAddress: "1 Test St",
      report: { technicianFieldReport: "Visible mould behind the vanity." },
    });

    const body = await (await POST(post({ floors: FLOORS }), params)).json();

    expect(body.dryingPlan.mouldActive).toBe(true);
    expect(body.dryingEquipment.airMover).toBe(0);
    expect(body.dryingPlan.phases[0].airMoversAllowed).toBe(false);
  });

  it("plans air movers from the start when nothing indicates mould", async () => {
    const body = await (await POST(post({ floors: FLOORS }), params)).json();

    expect(body.dryingPlan.mouldActive).toBe(false);
    expect(body.dryingEquipment.airMover).toBeGreaterThan(0);
  });

  // A plan built on a guessed supply must not read as a measured one.
  it("carries the site power assessment, and flags its absence", async () => {
    const assumed = await (
      await POST(post({ floors: FLOORS }), params)
    ).json();
    expect(assumed.dryingPlan.power.assumed).toBe(true);

    p.inspection.findUnique.mockResolvedValue({
      propertyAddress: "1 Test St",
      powerCircuits: 4,
      powerCircuitRatingA: 20,
    });
    const measured = await (
      await POST(post({ floors: FLOORS }), params)
    ).json();
    expect(measured.dryingPlan.power).toMatchObject({
      circuits: 4,
      assumed: false,
    });
  });

  it("routes NZ when a sketch is tagged NZ", async () => {
    p.claimSketch.findMany.mockResolvedValueOnce([
      { moisturePoints: [], country: "NZ" },
    ]);
    const res = await POST(post({ floors: FLOORS }), params);
    const body = await res.json();
    expect(body.jurisdiction).toBe("NZ");
    expect(body.compliance.nhcover?.buildingCapNzd).toBe(300_000);
  });

  it("422 when floors[] is missing", async () => {
    const res = await POST(post({}), params);
    expect(res.status).toBe(422);
  });

  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(post({ floors: FLOORS }), params);
    expect(res.status).toBe(401);
  });

  it("403 when the caller fails the inspection tenancy check", async () => {
    mockTenancy.mockResolvedValueOnce({
      ok: false,
      status: 403,
      reason: "forbidden",
    });
    const res = await POST(post({ floors: FLOORS }), params);
    expect(res.status).toBe(403);
  });
});
