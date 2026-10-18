import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const inspectionFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: (...args: unknown[]) => inspectionFindFirst(...args),
    },
  },
}));

const generateNIRPDF = vi.fn();
vi.mock("@/lib/nir-report-generation", () => ({
  generateNIRPDF: (...args: unknown[]) => generateNIRPDF(...args),
}));

const claimSketchesToFloors = vi.fn();
vi.mock("@/lib/reports/claim-sketch-floors", () => ({
  claimSketchesToFloors: (...args: unknown[]) => claimSketchesToFloors(...args),
}));

const appendSketchPages = vi.fn();
vi.mock("@/lib/reports/append-sketch-pages", () => ({
  appendSketchPages: (...args: unknown[]) => appendSketchPages(...args),
}));

const isSafePublicHttpsUrl = vi.fn();
vi.mock("@/lib/security/safe-external-url", () => ({
  isSafePublicHttpsUrl: (...args: unknown[]) => isSafePublicHttpsUrl(...args),
}));

vi.mock("@/lib/api-errors", () => ({
  apiError: (_request: unknown, options: { status: number; message: string }) =>
    Response.json({ error: options.message }, { status: options.status }),
  fromException: () =>
    Response.json({ error: "Internal server error" }, { status: 500 }),
}));

import { GET } from "../route";

const request = () =>
  new NextRequest("http://localhost/api/inspections/insp-1/report?format=pdf");
const context = { params: Promise.resolve({ id: "insp-1" }) };

function inspection(overrides: Record<string, unknown> = {}) {
  return {
    id: "insp-1",
    inspectionNumber: "NIR-1",
    propertyAddress: "1 Test Street",
    propertyPostcode: "4000",
    inspectionDate: new Date("2026-08-09T00:00:00Z"),
    completedAt: new Date("2026-08-09T01:00:00Z"),
    updatedAt: new Date("2026-08-09T01:00:00Z"),
    technicianName: "Test Technician",
    status: "COMPLETED",
    environmentalData: null,
    moistureReadings: [],
    affectedAreas: [],
    scopeItems: [],
    classifications: [],
    costEstimates: [],
    photos: [],
    claimSketches: [],
    floorPlanImageUrl: null,
    report: null,
    ...overrides,
  };
}

const floor = (label: string) => ({
  label,
  pngDataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
  fabricJson: null,
  moisturePins: [],
});

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindFirst.mockReset();
  generateNIRPDF.mockReset();
  claimSketchesToFloors.mockReset();
  appendSketchPages.mockReset();
  isSafePublicHttpsUrl.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  generateNIRPDF.mockResolvedValue(new Uint8Array([1, 2, 3]));
  appendSketchPages.mockImplementation(async (bytes: Uint8Array) => bytes);
  claimSketchesToFloors.mockResolvedValue([]);
  isSafePublicHttpsUrl.mockResolvedValue(true);
});

describe("GET /api/inspections/[id]/report — floor-plan output", () => {
  it.each(["ESTIMATED", "SUBMITTED"])(
    "generates a report for review-ready %s work",
    async (status) => {
      inspectionFindFirst.mockResolvedValue(inspection({ status }));

      const response = await GET(request(), context);

      expect(response.status).toBe(200);
      expect(generateNIRPDF).toHaveBeenCalledOnce();
    },
  );

  it.each([
    "DRAFT",
    "PROCESSING",
    "CLASSIFIED",
    "SCOPED",
    "REJECTED",
    "IN_BILLING",
    "CLOSED",
    "ARCHIVED",
  ])(
    "rejects report generation from %s",
    async (status) => {
      inspectionFindFirst.mockResolvedValue(inspection({ status }));

      const response = await GET(request(), context);

      expect(response.status).toBe(400);
      expect(generateNIRPDF).not.toHaveBeenCalled();
    },
  );

  it("queries only the signed-in user's inspection and appends clean rendered plans", async () => {
    inspectionFindFirst.mockResolvedValue(
      inspection({
        claimSketches: [
          {
            floorNumber: 0,
            floorLabel: "Ground Floor",
            renderedPngUrl: "https://cdn.example.com/ground.png",
            sketchData: null,
            moisturePoints: null,
          },
        ],
        floorPlanImageUrl: "https://res.cloudinary.com/demo/upload/plan.png",
      }),
    );
    claimSketchesToFloors.mockResolvedValue([floor("Ground Floor")]);

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    const query = inspectionFindFirst.mock.calls[0][0];
    expect(query.where).toEqual({ id: "insp-1", userId: "user-1" });
    expect(query.include.claimSketches).toMatchObject({
      orderBy: { floorNumber: "asc" },
      take: 50,
      select: {
        floorNumber: true,
        floorLabel: true,
        renderedPngUrl: true,
        sketchData: true,
        moisturePoints: true,
      },
    });
    expect(generateNIRPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        floorPlans: [
          {
            label: "Ground Floor",
            source: "rendered_sketch",
            status: "included",
          },
        ],
      }),
    );
    expect(appendSketchPages).toHaveBeenCalledTimes(1);
  });

  it("records an unapproved stored render as unavailable", async () => {
    inspectionFindFirst.mockResolvedValue(
      inspection({
        claimSketches: [
          {
            floorNumber: 0,
            floorLabel: "Ground Floor",
            renderedPngUrl: "https://127.0.0.1/internal.png",
            sketchData: null,
            moisturePoints: null,
          },
        ],
      }),
    );
    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(claimSketchesToFloors).toHaveBeenCalledOnce();
    expect(appendSketchPages).not.toHaveBeenCalled();
    expect(generateNIRPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        floorPlans: [
          expect.objectContaining({
            label: "Ground Floor",
            status: "unavailable",
            reason: expect.stringContaining("could not be retrieved"),
          }),
        ],
      }),
    );
  });

  it("ignores legacy uploaded reference artwork", async () => {
    inspectionFindFirst.mockResolvedValue(
      inspection({
        floorPlanImageUrl: "https://res.cloudinary.com/demo/upload/missing.png",
      }),
    );
    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(appendSketchPages).not.toHaveBeenCalled();
    expect(generateNIRPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        floorPlans: [],
      }),
    );
  });

  it("rebuilds the report with an unavailable status if image embedding fails", async () => {
    inspectionFindFirst.mockResolvedValue(
      inspection({
        claimSketches: [
          {
            floorNumber: 0,
            floorLabel: "Ground Floor",
            renderedPngUrl: "https://cdn.example.com/invalid.png",
            sketchData: null,
            moisturePoints: null,
          },
        ],
      }),
    );
    claimSketchesToFloors.mockResolvedValue([floor("Ground Floor")]);
    appendSketchPages
      .mockRejectedValueOnce(new Error("invalid image"))
      .mockImplementationOnce(async (bytes: Uint8Array) => bytes);

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(generateNIRPDF).toHaveBeenCalledTimes(2);
    expect(generateNIRPDF.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        floorPlans: [
          expect.objectContaining({
            status: "unavailable",
            reason: expect.stringContaining("could not be embedded"),
          }),
        ],
      }),
    );
  });
});
